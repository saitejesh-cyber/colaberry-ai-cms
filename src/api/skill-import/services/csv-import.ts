import type { Core } from '@strapi/strapi';

type SkillImportOptions = {
  csvText: string;
  dryRun: boolean;
  strictMode: boolean;
  createRelations: boolean;
  publishEntries: boolean;
};

type SkillImportError = {
  row: number;
  slug?: string;
  message: string;
};

type SkillImportSummary = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  dryRun: boolean;
};

type SkillImportResult = {
  summary: SkillImportSummary;
  errors: SkillImportError[];
};

type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
};

const SKILL_UID = 'api::skill.skill';
const TAG_UID = 'api::tag.tag';
const COMPANY_UID = 'api::company.company';
const AGENT_UID = 'api::agent.agent';
const MCP_UID = 'api::mcp-server.mcp-server';
const USE_CASE_UID = 'api::use-case.use-case';

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
  cache: Map<string, number>
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
      publishedAt: new Date().toISOString(),
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

  const existing = await (strapi.db.query(uid) as any).findOne({
    where: { slug },
    select: ['id', 'slug'],
  });

  if (!existing?.id) return null;
  cache.set(slug, existing.id as number);
  return existing.id as number;
}

async function resolveNamedRelationIds(
  strapi: Core.Strapi,
  uid: string,
  rawValues: string | undefined,
  createMissing: boolean,
  cache: Map<string, number>
) {
  if (rawValues === undefined) return undefined;
  const values = parseList(rawValues);
  const ids: number[] = [];

  for (const value of values) {
    const id = await resolveNamedRelationId(strapi, uid, value, createMissing, cache);
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

export async function runSkillCsvImport(
  strapi: Core.Strapi,
  options: SkillImportOptions
): Promise<SkillImportResult> {
  const parsed = parseCsv(options.csvText);

  const summary: SkillImportSummary = {
    total: parsed.rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    dryRun: options.dryRun,
  };

  const errors: SkillImportError[] = [];
  const tagCache = new Map<string, number>();
  const companyCache = new Map<string, number>();
  const agentCache = new Map<string, number>();
  const mcpCache = new Map<string, number>();
  const useCaseCache = new Map<string, number>();

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

      const existing = await (strapi.db.query(SKILL_UID) as any).findOne({
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

      const [tags, companies, agents, mcpServers, useCases] = await Promise.all([
        resolveNamedRelationIds(
          strapi,
          TAG_UID,
          valueFromAliases(row, ['tags']),
          options.createRelations,
          tagCache
        ),
        resolveNamedRelationIds(
          strapi,
          COMPANY_UID,
          valueFromAliases(row, ['companies', 'company']),
          options.createRelations,
          companyCache
        ),
        resolveLookupRelationIds(
          strapi,
          AGENT_UID,
          valueFromAliases(row, ['agents', 'agent']),
          agentCache
        ),
        resolveLookupRelationIds(
          strapi,
          MCP_UID,
          valueFromAliases(row, ['mcpservers', 'mcpserver']),
          mcpCache
        ),
        resolveLookupRelationIds(
          strapi,
          USE_CASE_UID,
          valueFromAliases(row, ['usecases', 'usecase']),
          useCaseCache
        ),
      ]);

      const payload = cleanObject({
        name: hasAnyAlias(row, ['name', 'title']) ? (name || null) : existing ? undefined : name,
        slug,
        summary: hasAnyAlias(row, ['summary'])
          ? normalizeTextValue(valueFromAliases(row, ['summary']))
          : undefined,
        longDescription: hasAnyAlias(row, ['longdescription', 'description'])
          ? normalizeTextValue(valueFromAliases(row, ['longdescription', 'description']))
          : undefined,
        category: hasAnyAlias(row, ['category'])
          ? normalizeTextValue(valueFromAliases(row, ['category']))
          : undefined,
        provider: hasAnyAlias(row, ['provider'])
          ? normalizeTextValue(valueFromAliases(row, ['provider']))
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
        skillType: hasAnyAlias(row, ['skilltype'])
          ? normalizeTextValue(valueFromAliases(row, ['skilltype']))
          : undefined,
        inputs: hasAnyAlias(row, ['inputs'])
          ? normalizeTextValue(valueFromAliases(row, ['inputs']))
          : undefined,
        outputs: hasAnyAlias(row, ['outputs'])
          ? normalizeTextValue(valueFromAliases(row, ['outputs']))
          : undefined,
        prerequisites: hasAnyAlias(row, ['prerequisites'])
          ? normalizeTextValue(valueFromAliases(row, ['prerequisites']))
          : undefined,
        toolsRequired: hasAnyAlias(row, ['toolsrequired'])
          ? normalizeTextValue(valueFromAliases(row, ['toolsrequired']))
          : undefined,
        modelsSupported: hasAnyAlias(row, ['modelssupported'])
          ? normalizeTextValue(valueFromAliases(row, ['modelssupported']))
          : undefined,
        securityNotes: hasAnyAlias(row, ['securitynotes'])
          ? normalizeTextValue(valueFromAliases(row, ['securitynotes']))
          : undefined,
        keyBenefits: hasAnyAlias(row, ['keybenefits'])
          ? normalizeTextValue(valueFromAliases(row, ['keybenefits']))
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
        usageCount: hasAnyAlias(row, ['usagecount']) ? usageCount : undefined,
        rating: hasAnyAlias(row, ['rating']) ? rating : undefined,
        lastUpdated: hasAnyAlias(row, ['lastupdated'])
          ? lastUpdated
          : existing
          ? undefined
          : new Date().toISOString(),
        docsUrl: hasAnyAlias(row, ['docsurl'])
          ? normalizeTextValue(valueFromAliases(row, ['docsurl']))
          : undefined,
        demoUrl: hasAnyAlias(row, ['demourl'])
          ? normalizeTextValue(valueFromAliases(row, ['demourl']))
          : undefined,
        tags,
        companies,
        agents,
        mcpServers,
        useCases,
      });

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
        await (strapi.db.query(SKILL_UID) as any).update({
          where: { id: existing.id },
          data: payload,
        });
        summary.updated += 1;
      } else {
        await (strapi.db.query(SKILL_UID) as any).create({
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
