import type { Core } from '@strapi/strapi';
import { runPodcastCsvImport } from '../../podcast-import/services/csv-import';
import { runSkillCsvImport } from '../../skill-import/services/csv-import';

type ImportEntityType = 'agent' | 'mcpServer' | 'skill' | 'podcast';

type ImportOptions = {
  entityType: string;
  csvText: string;
  dryRun: boolean;
  strictMode: boolean;
  createRelations: boolean;
  publishEntries: boolean;
};

type ImportError = {
  row: number;
  slug?: string;
  message: string;
};

type ImportSummary = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
};

type ImportResult = {
  summary: ImportSummary;
  errors: ImportError[];
};

type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
};

const AGENT_UID = 'api::agent.agent';
const MCP_UID = 'api::mcp-server.mcp-server';
const SKILL_UID = 'api::skill.skill';
const USE_CASE_UID = 'api::use-case.use-case';
const TAG_UID = 'api::tag.tag';
const COMPANY_UID = 'api::company.company';

function normalizeEntityType(value: string): ImportEntityType {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (normalized === 'podcast' || normalized === 'podcasts') return 'podcast';
  if (normalized === 'skill' || normalized === 'skills') return 'skill';
  if (normalized === 'agent' || normalized === 'agents') return 'agent';
  if (normalized === 'mcpserver' || normalized === 'mcpservers' || normalized === 'mcp') {
    return 'mcpServer';
  }

  throw new Error(`Unsupported entityType "${value}". Use one of: agent, mcpServer, skill, podcast.`);
}

function normalizeHeader(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function slugify(value: string) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseBoolean(value: string | undefined) {
  if (value == null) return undefined;
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  if (['true', '1', 'yes', 'y'].includes(text)) return true;
  if (['false', '0', 'no', 'n'].includes(text)) return false;
  return null;
}

function parseInteger(value: string | undefined) {
  if (value == null) return undefined;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDecimal(value: string | undefined) {
  if (value == null) return undefined;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateTime(value: string | undefined) {
  if (value == null) return undefined;
  const text = String(value).trim();
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T00:00:00.000Z`).toISOString();
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
    const [month, day, year] = text.split('/').map((part) => Number(part));
    if (
      Number.isFinite(month) &&
      Number.isFinite(day) &&
      Number.isFinite(year) &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    ) {
      const monthPart = String(month).padStart(2, '0');
      const dayPart = String(day).padStart(2, '0');
      return new Date(`${year}-${monthPart}-${dayPart}T00:00:00.000Z`).toISOString();
    }
  }

  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function parseList(value: string | undefined) {
  if (value == null) return [];
  const text = String(value).trim();
  if (!text) return [];
  if (text.includes('|')) {
    return text
      .split('|')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (text.includes(';')) {
    return text
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return text
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseCsv(text: string): CsvParseResult {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const normalized = String(text || '').replace(/^\uFEFF/, '');

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    if (char === '\r') continue;
    cell += char;
  }

  row.push(cell);
  if (row.some((entry) => String(entry).trim().length > 0)) {
    rows.push(row);
  }

  if (!rows.length) {
    return { headers: [], rows: [] };
  }

  const headers = rows[0].map((entry) => normalizeHeader(entry));
  const records = rows.slice(1).map((recordItems) => {
    const output: Record<string, string> = {};
    headers.forEach((header, idx) => {
      output[header] = String(recordItems[idx] || '').trim();
    });
    return output;
  });

  return { headers, rows: records };
}

function hasAnyAlias(record: Record<string, string>, aliases: readonly string[]) {
  return aliases.some((alias) => Object.prototype.hasOwnProperty.call(record, alias));
}

function valueFromAliases(record: Record<string, string>, aliases: readonly string[]) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(record, alias)) {
      return record[alias];
    }
  }
  return undefined;
}

function normalizeStatus(value: string | undefined, fallback = 'live') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'live' || normalized === 'beta' || normalized === 'concept') return normalized;
  return fallback;
}

function normalizeVisibility(value: string | undefined, fallback = 'public') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'public' || normalized === 'private') return normalized;
  return fallback;
}

function normalizeSource(value: string | undefined, fallback = 'internal') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'internal' || normalized === 'external' || normalized === 'partner') {
    return normalized;
  }
  return fallback;
}

function cleanObject<T extends Record<string, unknown>>(input: T) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    output[key] = value;
  }
  return output as T;
}

function normalizeTextValue(value: string | undefined) {
  if (value === undefined) return undefined;
  const normalized = String(value).trim();
  return normalized || null;
}

async function resolveNamedRelationId(
  strapi: Core.Strapi,
  uid: string,
  nameValue: string,
  createMissing: boolean,
  cache: Map<string, number>,
  publishEntries: boolean
) {
  const normalizedName = String(nameValue || '').trim();
  if (!normalizedName) return null;

  const slug = slugify(normalizedName);
  if (!slug) return null;

  if (cache.has(slug)) return cache.get(slug)!;

  const existing = await (strapi.db.query(uid) as any).findOne({
    where: { slug },
    select: ['id', 'slug'],
  });

  if (existing?.id) {
    cache.set(slug, existing.id as number);
    return existing.id as number;
  }

  if (!createMissing) return null;

  const created = await (strapi.db.query(uid) as any).create({
    data: {
      name: normalizedName,
      slug,
      ...(publishEntries ? { publishedAt: new Date().toISOString() } : {}),
    },
    select: ['id', 'slug'],
  });

  if (!created?.id) return null;
  cache.set(slug, created.id as number);
  return created.id as number;
}

async function resolveLookupRelationId(
  strapi: Core.Strapi,
  uid: string,
  inputValue: string,
  cache: Map<string, number>
) {
  const normalizedInput = String(inputValue || '').trim();
  if (!normalizedInput) return null;

  const slug = slugify(normalizedInput);
  if (!slug) return null;

  if (cache.has(slug)) return cache.get(slug)!;

  const bySlug = await (strapi.db.query(uid) as any).findOne({
    where: { slug },
    select: ['id', 'slug'],
  });

  if (bySlug?.id) {
    cache.set(slug, bySlug.id as number);
    return bySlug.id as number;
  }

  const byName = await (strapi.db.query(uid) as any).findOne({
    where: { name: normalizedInput },
    select: ['id', 'slug'],
  });

  if (!byName?.id) return null;
  cache.set(slug, byName.id as number);
  return byName.id as number;
}

async function resolveNamedRelationIds(
  strapi: Core.Strapi,
  uid: string,
  rawValues: string | undefined,
  createMissing: boolean,
  cache: Map<string, number>,
  publishEntries: boolean
) {
  if (rawValues === undefined) return undefined;
  const values = parseList(rawValues);
  const ids: number[] = [];

  for (const value of values) {
    const id = await resolveNamedRelationId(
      strapi,
      uid,
      value,
      createMissing,
      cache,
      publishEntries
    );
    if (id != null) ids.push(id);
  }

  return Array.from(new Set(ids));
}

async function resolveLookupRelationIds(
  strapi: Core.Strapi,
  uid: string,
  rawValues: string | undefined,
  cache: Map<string, number>
) {
  if (rawValues === undefined) return undefined;
  const values = parseList(rawValues);
  const ids: number[] = [];

  for (const value of values) {
    const id = await resolveLookupRelationId(strapi, uid, value, cache);
    if (id != null) ids.push(id);
  }

  return Array.from(new Set(ids));
}

async function runCatalogCsvImport(
  strapi: Core.Strapi,
  entityType: 'agent' | 'mcpServer',
  options: Omit<ImportOptions, 'entityType'>
): Promise<ImportResult> {
  const parsed = parseCsv(options.csvText);
  const summary: ImportSummary = {
    total: parsed.rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    dryRun: options.dryRun,
  };

  const errors: ImportError[] = [];
  const tagCache = new Map<string, number>();
  const companyCache = new Map<string, number>();
  const skillCache = new Map<string, number>();
  const useCaseCache = new Map<string, number>();
  const mcpCache = new Map<string, number>();
  const uid = entityType === 'agent' ? AGENT_UID : MCP_UID;

  for (let index = 0; index < parsed.rows.length; index += 1) {
    const row = parsed.rows[index];
    const rowNumber = index + 2;

    try {
      const name = String(valueFromAliases(row, ['name', 'title']) || '').trim();
      const slugInput = String(valueFromAliases(row, ['slug']) || '').trim();
      const slug = slugInput || slugify(name);

      if (!slug) {
        throw new Error('Unable to derive slug. Provide a name or slug.');
      }

      const existing = await (strapi.db.query(uid) as any).findOne({
        where: { slug },
        select: ['id', 'slug', 'status', 'visibility', 'source'],
      });

      if (!existing?.id && !name) {
        throw new Error('name is required for new rows.');
      }

      const statusProvided = hasAnyAlias(row, ['status']);
      const visibilityProvided = hasAnyAlias(row, ['visibility']);
      const sourceProvided = hasAnyAlias(row, ['source']);

      const status = statusProvided
        ? normalizeStatus(valueFromAliases(row, ['status']), 'live')
        : existing
        ? undefined
        : 'live';

      const visibility = visibilityProvided
        ? normalizeVisibility(valueFromAliases(row, ['visibility']), 'public')
        : existing
        ? undefined
        : 'public';

      const source = sourceProvided
        ? normalizeSource(valueFromAliases(row, ['source']), 'internal')
        : existing
        ? undefined
        : 'internal';

      const usageCountRaw = valueFromAliases(row, ['usagecount']);
      const usageCount = parseInteger(usageCountRaw);
      if (
        hasAnyAlias(row, ['usagecount']) &&
        String(usageCountRaw || '').trim() &&
        usageCount === null
      ) {
        throw new Error('Invalid usageCount value.');
      }

      const ratingRaw = valueFromAliases(row, ['rating']);
      const rating = parseDecimal(ratingRaw);
      if (hasAnyAlias(row, ['rating']) && String(ratingRaw || '').trim() && rating === null) {
        throw new Error('Invalid rating value.');
      }

      const lastUpdatedRaw = valueFromAliases(row, ['lastupdated']);
      const lastUpdated = parseDateTime(lastUpdatedRaw);
      if (
        hasAnyAlias(row, ['lastupdated']) &&
        String(lastUpdatedRaw || '').trim() &&
        lastUpdated === null
      ) {
        throw new Error('Invalid lastUpdated value. Use ISO date/datetime or YYYY-MM-DD.');
      }

      const verifiedRaw = valueFromAliases(row, ['verified']);
      const verified = parseBoolean(verifiedRaw);
      if (
        hasAnyAlias(row, ['verified']) &&
        String(verifiedRaw || '').trim() &&
        verified === null
      ) {
        throw new Error('Invalid verified value. Use true/false.');
      }

      const openSourceRaw = valueFromAliases(row, ['opensource']);
      const openSource = parseBoolean(openSourceRaw);
      if (
        entityType === 'mcpServer' &&
        hasAnyAlias(row, ['opensource']) &&
        String(openSourceRaw || '').trim() &&
        openSource === null
      ) {
        throw new Error('Invalid openSource value. Use true/false.');
      }

      const [tags, companies, skills, linkedUseCases, linkedMcpServers] = await Promise.all([
        resolveNamedRelationIds(
          strapi,
          TAG_UID,
          valueFromAliases(row, ['tags']),
          options.createRelations,
          tagCache,
          options.publishEntries
        ),
        resolveNamedRelationIds(
          strapi,
          COMPANY_UID,
          valueFromAliases(row, ['companies', 'company']),
          options.createRelations,
          companyCache,
          options.publishEntries
        ),
        resolveLookupRelationIds(
          strapi,
          SKILL_UID,
          valueFromAliases(row, ['skills', 'skill']),
          skillCache
        ),
        resolveLookupRelationIds(
          strapi,
          USE_CASE_UID,
          valueFromAliases(row, ['linkedusecases', 'linkedusecase', 'usecaserelations']),
          useCaseCache
        ),
        entityType === 'agent'
          ? resolveLookupRelationIds(
              strapi,
              MCP_UID,
              valueFromAliases(row, ['linkedmcpservers', 'linkedmcpserver', 'mcpserverrelations']),
              mcpCache
            )
          : Promise.resolve(undefined),
      ]);

      const payload = cleanObject({
        name: hasAnyAlias(row, ['name', 'title']) ? (name || null) : existing ? undefined : name,
        slug,
        description: hasAnyAlias(row, ['description'])
          ? normalizeTextValue(valueFromAliases(row, ['description']))
          : undefined,
        status,
        visibility,
        source,
        sourceUrl: hasAnyAlias(row, ['sourceurl'])
          ? normalizeTextValue(valueFromAliases(row, ['sourceurl']))
          : undefined,
        sourceName: hasAnyAlias(row, ['sourcename'])
          ? normalizeTextValue(valueFromAliases(row, ['sourcename']))
          : undefined,
        verified: hasAnyAlias(row, ['verified']) ? verified : undefined,
        industry: hasAnyAlias(row, ['industry'])
          ? normalizeTextValue(valueFromAliases(row, ['industry']))
          : undefined,
        tags,
        companies,
        usageCount: hasAnyAlias(row, ['usagecount']) ? usageCount : undefined,
        rating: hasAnyAlias(row, ['rating']) ? rating : undefined,
        lastUpdated: hasAnyAlias(row, ['lastupdated'])
          ? lastUpdated
          : existing
          ? undefined
          : new Date().toISOString(),
        longDescription: hasAnyAlias(row, ['longdescription'])
          ? normalizeTextValue(valueFromAliases(row, ['longdescription']))
          : undefined,
        keyBenefits: hasAnyAlias(row, ['keybenefits'])
          ? normalizeTextValue(valueFromAliases(row, ['keybenefits']))
          : undefined,
        useCases: hasAnyAlias(row, ['usecases'])
          ? normalizeTextValue(valueFromAliases(row, ['usecases']))
          : undefined,
        limitations: hasAnyAlias(row, ['limitations'])
          ? normalizeTextValue(valueFromAliases(row, ['limitations']))
          : undefined,
        requirements: hasAnyAlias(row, ['requirements'])
          ? normalizeTextValue(valueFromAliases(row, ['requirements']))
          : undefined,
        exampleWorkflow: hasAnyAlias(row, ['exampleworkflow'])
          ? normalizeTextValue(valueFromAliases(row, ['exampleworkflow']))
          : undefined,
        skills,
        linkedUseCases,
      });

      if (entityType === 'agent') {
        Object.assign(
          payload,
          cleanObject({
            whatItDoes: hasAnyAlias(row, ['whatitdoes'])
              ? normalizeTextValue(valueFromAliases(row, ['whatitdoes']))
              : undefined,
            outcomes: hasAnyAlias(row, ['outcomes'])
              ? normalizeTextValue(valueFromAliases(row, ['outcomes']))
              : undefined,
            coreTasks: hasAnyAlias(row, ['coretasks'])
              ? normalizeTextValue(valueFromAliases(row, ['coretasks']))
              : undefined,
            inputs: hasAnyAlias(row, ['inputs'])
              ? normalizeTextValue(valueFromAliases(row, ['inputs']))
              : undefined,
            outputs: hasAnyAlias(row, ['outputs'])
              ? normalizeTextValue(valueFromAliases(row, ['outputs']))
              : undefined,
            tools: hasAnyAlias(row, ['tools'])
              ? normalizeTextValue(valueFromAliases(row, ['tools']))
              : undefined,
            executionModes: hasAnyAlias(row, ['executionmodes'])
              ? normalizeTextValue(valueFromAliases(row, ['executionmodes']))
              : undefined,
            orchestration: hasAnyAlias(row, ['orchestration'])
              ? normalizeTextValue(valueFromAliases(row, ['orchestration']))
              : undefined,
            securityCompliance: hasAnyAlias(row, ['securitycompliance'])
              ? normalizeTextValue(valueFromAliases(row, ['securitycompliance']))
              : undefined,
            docsUrl: hasAnyAlias(row, ['docsurl'])
              ? normalizeTextValue(valueFromAliases(row, ['docsurl']))
              : undefined,
            demoUrl: hasAnyAlias(row, ['demourl'])
              ? normalizeTextValue(valueFromAliases(row, ['demourl']))
              : undefined,
            changelogUrl: hasAnyAlias(row, ['changelogurl'])
              ? normalizeTextValue(valueFromAliases(row, ['changelogurl']))
              : undefined,
            linkedMcpServers,
          })
        );
      }

      if (entityType === 'mcpServer') {
        Object.assign(
          payload,
          cleanObject({
            category: hasAnyAlias(row, ['category'])
              ? normalizeTextValue(valueFromAliases(row, ['category']))
              : undefined,
            docsUrl: hasAnyAlias(row, ['docsurl'])
              ? normalizeTextValue(valueFromAliases(row, ['docsurl']))
              : undefined,
            serverType: hasAnyAlias(row, ['servertype'])
              ? normalizeTextValue(valueFromAliases(row, ['servertype']))
              : undefined,
            primaryFunction: hasAnyAlias(row, ['primaryfunction'])
              ? normalizeTextValue(valueFromAliases(row, ['primaryfunction']))
              : undefined,
            openSource: hasAnyAlias(row, ['opensource']) ? openSource : undefined,
            language: hasAnyAlias(row, ['language'])
              ? normalizeTextValue(valueFromAliases(row, ['language']))
              : undefined,
            capabilities: hasAnyAlias(row, ['capabilities'])
              ? normalizeTextValue(valueFromAliases(row, ['capabilities']))
              : undefined,
            tools: hasAnyAlias(row, ['tools'])
              ? normalizeTextValue(valueFromAliases(row, ['tools']))
              : undefined,
            authMethods: hasAnyAlias(row, ['authmethods'])
              ? normalizeTextValue(valueFromAliases(row, ['authmethods']))
              : undefined,
            hostingOptions: hasAnyAlias(row, ['hostingoptions'])
              ? normalizeTextValue(valueFromAliases(row, ['hostingoptions']))
              : undefined,
            compatibility: hasAnyAlias(row, ['compatibility'])
              ? normalizeTextValue(valueFromAliases(row, ['compatibility']))
              : undefined,
            pricing: hasAnyAlias(row, ['pricing'])
              ? normalizeTextValue(valueFromAliases(row, ['pricing']))
              : undefined,
            tryItNowUrl: hasAnyAlias(row, ['tryitnowurl'])
              ? normalizeTextValue(valueFromAliases(row, ['tryitnowurl']))
              : undefined,
            registryName: hasAnyAlias(row, ['registryname'])
              ? normalizeTextValue(valueFromAliases(row, ['registryname']))
              : undefined,
          })
        );
      }

      if (options.publishEntries) {
        (payload as any).publishedAt = new Date().toISOString();
      }

      if (Object.keys(payload).length <= 1) {
        summary.skipped += 1;
        continue;
      }

      if (options.dryRun) {
        if (existing?.id) {
          summary.updated += 1;
        } else {
          summary.created += 1;
        }
        continue;
      }

      if (existing?.id) {
        await (strapi.db.query(uid) as any).update({
          where: { id: existing.id },
          data: payload,
        });
        summary.updated += 1;
      } else {
        await (strapi.db.query(uid) as any).create({
          data: payload,
        });
        summary.created += 1;
      }
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push({
        row: rowNumber,
        slug: valueFromAliases(row, ['slug']),
        message,
      });

      if (options.strictMode) {
        break;
      }
    }
  }

  return {
    summary,
    errors,
  };
}

export async function runImportDispatch(
  strapi: Core.Strapi,
  options: ImportOptions
): Promise<ImportResult> {
  const entityType = normalizeEntityType(options.entityType);
  const runtimeOptions = {
    csvText: options.csvText,
    dryRun: options.dryRun,
    strictMode: options.strictMode,
    createRelations: options.createRelations,
    publishEntries: options.publishEntries,
  };

  if (entityType === 'podcast') {
    return runPodcastCsvImport(strapi, {
      csvText: runtimeOptions.csvText,
      dryRun: runtimeOptions.dryRun,
      strictMode: runtimeOptions.strictMode,
      createRelations: runtimeOptions.createRelations,
    });
  }

  if (entityType === 'skill') {
    return runSkillCsvImport(strapi, {
      csvText: runtimeOptions.csvText,
      dryRun: runtimeOptions.dryRun,
      strictMode: runtimeOptions.strictMode,
      createRelations: runtimeOptions.createRelations,
      publishEntries: runtimeOptions.publishEntries,
    });
  }

  if (entityType === 'agent' || entityType === 'mcpServer') {
    return runCatalogCsvImport(strapi, entityType, runtimeOptions);
  }

  throw new Error(`Unsupported entityType "${options.entityType}".`);
}
