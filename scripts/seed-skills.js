'use strict';

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const SAMPLE_SKILLS = [
  {
    name: 'PDF Document Intelligence',
    slug: 'pdf-document-intelligence',
    summary: 'Generate and analyze enterprise PDFs at scale.',
    longDescription:
      'Creates production-ready PDF reports from structured data and extracts sections for downstream automation workflows.',
    category: 'Official pre-built skills',
    provider: 'Anthropic',
    status: 'live',
    visibility: 'public',
    source: 'external',
    sourceUrl: 'https://agentskills.io/what-are-skills',
    sourceName: 'AgentSkills',
    verified: true,
    industry: 'Cross-industry',
    skillType: 'Document management',
    inputs: 'JSON payload|template hints',
    outputs: 'PDF output|extracted sections',
    prerequisites: 'Prompt templates and schema definitions',
    toolsRequired: 'PDF renderer|object storage',
    modelsSupported: 'Claude Sonnet|GPT-4o',
    securityNotes: 'Redact confidential fields before export.',
    keyBenefits: 'Consistent reporting; lower manual ops; audit-ready artifacts',
    limitations: 'Large documents can increase latency.',
    requirements: 'Template discipline and metadata hygiene.',
    exampleWorkflow: 'Prepare schema; render PDF; validate output; archive in workflow',
    usageCount: 1240,
    rating: 4.8,
    docsUrl: 'https://agentskills.io/what-are-skills',
    tags: ['pdf', 'document', 'reporting'],
    companies: ['Colaberry'],
    agents: ['procurement-policy-advisor'],
    mcpServers: [],
    useCases: [],
  },
  {
    name: 'DOCX Contract Composer',
    slug: 'docx-contract-composer',
    summary: 'Generate policy and contract drafts in DOCX format.',
    longDescription:
      'Builds editable DOCX files with enterprise structure, clause libraries, and compliance annotations for legal and procurement teams.',
    category: 'Official pre-built skills',
    provider: 'Vercel',
    status: 'live',
    visibility: 'public',
    source: 'external',
    sourceUrl: 'https://agentskills.io/what-are-skills',
    sourceName: 'AgentSkills',
    verified: true,
    industry: 'Legal Ops',
    skillType: 'Document management',
    inputs: 'Policy intent|clause variables',
    outputs: 'DOCX document',
    prerequisites: 'Clause library and style guide',
    toolsRequired: 'DOCX toolkit|template repository',
    modelsSupported: 'GPT-4.1|Claude Sonnet',
    securityNotes: 'Validate privileged content before sharing.',
    keyBenefits: 'Fast first draft generation; standardized language',
    limitations: 'Requires approved clause sets for quality.',
    requirements: 'Approved legal templates and review gates.',
    exampleWorkflow: 'Capture request; draft clauses; export DOCX; legal review',
    usageCount: 980,
    rating: 4.6,
    docsUrl: 'https://agentskills.io/what-are-skills',
    tags: ['docx', 'legal', 'policy'],
    companies: ['Colaberry'],
    agents: ['contract-clause-extraction-agent'],
    mcpServers: [],
    useCases: [],
  },
  {
    name: 'PPTX Executive Brief Builder',
    slug: 'pptx-executive-brief-builder',
    summary: 'Create slides and briefing decks from structured inputs.',
    longDescription:
      'Transforms structured metrics and narrative points into executive slide decks with repeatable layout and messaging standards.',
    category: 'Official pre-built skills',
    provider: 'Anthropic',
    status: 'beta',
    visibility: 'public',
    source: 'external',
    sourceUrl: 'https://agentskills.io/what-are-skills',
    sourceName: 'AgentSkills',
    verified: false,
    industry: 'Executive',
    skillType: 'Document management',
    inputs: 'Key metrics|narrative points',
    outputs: 'PPTX deck',
    prerequisites: 'Brand template and slide taxonomy',
    toolsRequired: 'PPTX generator|asset library',
    modelsSupported: 'Claude Sonnet|GPT-4o',
    securityNotes: 'Remove sensitive metrics from external decks.',
    keyBenefits: 'Reduces prep time for leadership reviews',
    limitations: 'Complex visual charts may need manual touch-ups.',
    requirements: 'Brand-approved deck templates and assets.',
    exampleWorkflow: 'Collect KPIs; generate deck draft; QA narrative; publish',
    usageCount: 640,
    rating: 4.4,
    docsUrl: 'https://agentskills.io/what-are-skills',
    tags: ['pptx', 'briefing', 'leadership'],
    companies: ['Colaberry'],
    agents: ['marketing-campaign-optimizer'],
    mcpServers: [],
    useCases: [],
  },
  {
    name: 'Next.js Performance Optimizer',
    slug: 'nextjs-performance-optimizer',
    summary: 'Optimize caching and rendering strategy for Next.js apps.',
    longDescription:
      'Applies deterministic recommendations for ISR routes, cache headers, image optimization, and bundle boundaries to improve enterprise web performance.',
    category: 'Developer workflow skills',
    provider: 'Open Source',
    status: 'live',
    visibility: 'public',
    source: 'external',
    sourceUrl: 'https://github.com/ZhanlinCui/Ultimate-Agent-Skills-Collection',
    sourceName: 'Ultimate Agent Skills',
    verified: true,
    industry: 'Platform Engineering',
    skillType: 'Web and framework best practices',
    inputs: 'Route map|performance traces',
    outputs: 'Optimization checklist and patch guidance',
    prerequisites: 'Codebase access and profiling data',
    toolsRequired: 'Next.js|Lighthouse|Web Vitals',
    modelsSupported: 'GPT-4.1|Claude Sonnet',
    securityNotes: 'Do not expose internal diagnostics publicly.',
    keyBenefits: 'Faster page loads; lower infra cost; better SEO',
    limitations: 'Needs iterative tuning with production telemetry.',
    requirements: 'CI performance checks and baseline metrics.',
    exampleWorkflow: 'Audit routes; apply cache plan; test vitals; deploy and monitor',
    usageCount: 1500,
    rating: 4.9,
    docsUrl: 'https://github.com/ZhanlinCui/Ultimate-Agent-Skills-Collection',
    tags: ['nextjs', 'performance', 'seo'],
    companies: ['Colaberry'],
    agents: ['incident-triage-assistant'],
    mcpServers: ['a2abench-d59qkt'],
    useCases: [],
  },
  {
    name: 'React UX and Design Audit',
    slug: 'react-ux-design-audit',
    summary: 'Audit React UI for accessibility and UX quality.',
    longDescription:
      'Evaluates component-level semantics, contrast, keyboard flow, interaction consistency, and responsive behavior with prioritized remediation guidance.',
    category: 'Developer workflow skills',
    provider: 'Open Source',
    status: 'live',
    visibility: 'public',
    source: 'external',
    sourceUrl: 'https://github.com/ZhanlinCui/Ultimate-Agent-Skills-Collection',
    sourceName: 'Ultimate Agent Skills',
    verified: true,
    industry: 'Product',
    skillType: 'Web and framework best practices',
    inputs: 'UI screens|component inventory',
    outputs: 'Audit findings and fixes backlog',
    prerequisites: 'Design tokens and acceptance criteria',
    toolsRequired: 'React|axe|Lighthouse',
    modelsSupported: 'GPT-4.1|Claude Sonnet',
    securityNotes: 'Avoid collecting personal data in screenshots.',
    keyBenefits: 'Improves accessibility readiness and enterprise trust',
    limitations: 'Requires design and engineering collaboration.',
    requirements: 'Defined a11y baseline and QA checklist.',
    exampleWorkflow: 'Scan components; score issues; patch violations; re-audit',
    usageCount: 1120,
    rating: 4.7,
    docsUrl: 'https://github.com/ZhanlinCui/Ultimate-Agent-Skills-Collection',
    tags: ['react', 'ux', 'accessibility'],
    companies: ['Colaberry'],
    agents: ['customer-service-auto-resolver'],
    mcpServers: [],
    useCases: [],
  },
  {
    name: 'Unit Test and Lint Guardrail',
    slug: 'unit-test-and-lint-guardrail',
    summary: 'Auto-generate unit tests and enforce lint and security checks.',
    longDescription:
      'Creates test cases, enforces lint standards, and reports high-risk code paths before merge to stabilize delivery velocity.',
    category: 'Developer workflow skills',
    provider: 'Cursor',
    status: 'live',
    visibility: 'public',
    source: 'partner',
    sourceUrl: 'https://github.com/ZhanlinCui/Ultimate-Agent-Skills-Collection',
    sourceName: 'Cursor',
    verified: true,
    industry: 'Engineering',
    skillType: 'Code quality',
    inputs: 'Repository diff|coding standards',
    outputs: 'Unit tests and policy report',
    prerequisites: 'Test harness and lint config',
    toolsRequired: 'Jest|Vitest|ESLint|Semgrep',
    modelsSupported: 'GPT-4.1|Claude Sonnet',
    securityNotes: 'Exclude secrets and credentials from logs.',
    keyBenefits: 'Higher code quality; fewer regressions; stronger security posture',
    limitations: 'Generated tests may need domain tuning.',
    requirements: 'Mature CI pipeline and ownership model.',
    exampleWorkflow: 'Analyze diff; generate tests; run lint and scans; publish report',
    usageCount: 1710,
    rating: 4.8,
    docsUrl: 'https://github.com/ZhanlinCui/Ultimate-Agent-Skills-Collection',
    tags: ['testing', 'lint', 'security'],
    companies: ['Colaberry'],
    agents: ['incident-triage-assistant'],
    mcpServers: [],
    useCases: [],
  },
  {
    name: 'Kubernetes Runbook Automation',
    slug: 'kubernetes-runbook-automation',
    summary: 'Automate Kubernetes diagnostics and runbook execution.',
    longDescription:
      'Provides guided remediation for cluster incidents using predefined runbooks, policy checks, and post-incident summaries.',
    category: 'Specialized domain skills',
    provider: 'Open Source',
    status: 'beta',
    visibility: 'public',
    source: 'external',
    sourceUrl: 'https://github.com/ZhanlinCui/Ultimate-Agent-Skills-Collection',
    sourceName: 'Ultimate Agent Skills',
    verified: false,
    industry: 'Cloud and Infrastructure',
    skillType: 'Cloud operations',
    inputs: 'Cluster telemetry|incident context',
    outputs: 'Runbook actions and incident summary',
    prerequisites: 'Kubernetes access and SRE guardrails',
    toolsRequired: 'Kubernetes|Prometheus|Grafana',
    modelsSupported: 'Claude Sonnet|GPT-4o',
    securityNotes: 'Restrict dangerous commands and enforce approvals.',
    keyBenefits: 'Reduces MTTR and operational toil',
    limitations: 'Requires strict RBAC and change controls.',
    requirements: 'SRE runbooks and escalation policies.',
    exampleWorkflow: 'Ingest alerts; propose runbook; execute approved steps; summarize closure',
    usageCount: 730,
    rating: 4.5,
    docsUrl: 'https://github.com/ZhanlinCui/Ultimate-Agent-Skills-Collection',
    tags: ['kubernetes', 'sre', 'runbook'],
    companies: ['Colaberry'],
    agents: ['supply-chain-risk-monitor'],
    mcpServers: [],
    useCases: [],
  },
  {
    name: 'CRM Pipeline Reporting Skill',
    slug: 'crm-pipeline-reporting-skill',
    summary: 'Generate sales pipeline insights from CRM data.',
    longDescription:
      'Builds executive summaries, forecast risk views, and follow-up action plans from CRM pipeline snapshots and stage movement trends.',
    category: 'Specialized domain skills',
    provider: 'Open Source',
    status: 'live',
    visibility: 'public',
    source: 'external',
    sourceUrl: 'https://github.com/ZhanlinCui/Ultimate-Agent-Skills-Collection',
    sourceName: 'Ultimate Agent Skills',
    verified: true,
    industry: 'Business Operations',
    skillType: 'Business operations',
    inputs: 'CRM export|owner mappings',
    outputs: 'Pipeline health report and recommendations',
    prerequisites: 'CRM API access and stage taxonomy',
    toolsRequired: 'HubSpot|Salesforce',
    modelsSupported: 'GPT-4.1|Claude Sonnet',
    securityNotes: 'Mask customer identifiers in generated reports.',
    keyBenefits: 'Improves forecast clarity and sales execution cadence',
    limitations: 'Dependent on CRM data quality and process hygiene.',
    requirements: 'Consistent stage definitions and ownership mapping.',
    exampleWorkflow: 'Ingest pipeline; compute risk segments; publish actions; review weekly',
    usageCount: 860,
    rating: 4.6,
    docsUrl: 'https://github.com/ZhanlinCui/Ultimate-Agent-Skills-Collection',
    tags: ['crm', 'sales', 'analytics'],
    companies: ['Colaberry'],
    agents: ['marketing-campaign-optimizer'],
    mcpServers: [],
    useCases: [],
  },
  {
    name: 'Parallel Dispatch Orchestrator',
    slug: 'parallel-dispatch-orchestrator',
    summary: 'Dispatch tasks to multiple sub-agents in parallel.',
    longDescription:
      'Coordinates parallel execution, dependency handling, and merge strategies to accelerate multi-step workflows across teams and tools.',
    category: 'Agent orchestration skills',
    provider: 'Anthropic',
    status: 'beta',
    visibility: 'public',
    source: 'external',
    sourceUrl: 'https://agentskills.io/what-are-skills',
    sourceName: 'AgentSkills',
    verified: true,
    industry: 'Cross-industry',
    skillType: 'Agent orchestration',
    inputs: 'Goal and task graph',
    outputs: 'Parallel work packets and merged output',
    prerequisites: 'Agent registry and policy controls',
    toolsRequired: 'Agent runtime|queue broker',
    modelsSupported: 'Claude Sonnet|GPT-4.1',
    securityNotes: 'Enforce tool access boundaries per sub-agent.',
    keyBenefits: 'Faster complex workflow completion and better throughput',
    limitations: 'Can increase cost if parallelism is unbounded.',
    requirements: 'Orchestration policy and failure handling rules.',
    exampleWorkflow: 'Decompose request; dispatch sub-agents; reconcile results; return output',
    usageCount: 540,
    rating: 4.5,
    docsUrl: 'https://agentskills.io/what-are-skills',
    tags: ['orchestration', 'multi-agent', 'workflow'],
    companies: ['Colaberry'],
    agents: ['procurement-policy-advisor'],
    mcpServers: ['a2abench-d59qkt'],
    useCases: [],
  },
  {
    name: 'Chat Context Compactor',
    slug: 'chat-context-compactor',
    summary: 'Summarize long sessions while preserving critical context.',
    longDescription:
      'Compresses long conversation history into structured state checkpoints to reduce token load and maintain continuity for multi-session workflows.',
    category: 'Agent orchestration skills',
    provider: 'Anthropic',
    status: 'live',
    visibility: 'public',
    source: 'external',
    sourceUrl: 'https://agentskills.io/what-are-skills',
    sourceName: 'AgentSkills',
    verified: true,
    industry: 'Cross-industry',
    skillType: 'Agent orchestration',
    inputs: 'Conversation transcripts and policy constraints',
    outputs: 'Compact session state with handoff notes',
    prerequisites: 'Session schema and memory policy',
    toolsRequired: 'Conversation runtime|vector store',
    modelsSupported: 'Claude Sonnet|GPT-4o',
    securityNotes: 'Do not persist sensitive content without consent.',
    keyBenefits: 'Improves continuity and lowers context cost',
    limitations: 'Summaries can omit nuance without validation.',
    requirements: 'Memory schema and retention policy.',
    exampleWorkflow: 'Capture conversation; compact state; validate facts; persist checkpoint',
    usageCount: 920,
    rating: 4.7,
    docsUrl: 'https://agentskills.io/what-are-skills',
    tags: ['memory', 'context', 'conversation'],
    companies: ['Colaberry'],
    agents: ['customer-service-auto-resolver'],
    mcpServers: [],
    useCases: [],
  },
];


const CLAWHUB_SKILLS_FILE = path.resolve(__dirname, './templates/skills-clawhub-top-downloads.json');

function loadClawhubTopSkills() {
  try {
    const raw = fs.readFileSync(CLAWHUB_SKILLS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.log(`WARN: unable to read ${CLAWHUB_SKILLS_FILE}: ${error?.message || error}`);
    return [];
  }
}

function toClawhubSeedSkill(item) {
  const skillType = item.skillType || 'Development utilities';
  const sourceUrl = `https://clawhub.ai/skills/${item.slug}`;
  return {
    name: item.name,
    slug: item.slug,
    summary: item.summary,
    longDescription: item.longDescription,
    category: item.category || 'ClawHub top downloads',
    provider: item.provider || 'Unknown',
    status: 'live',
    visibility: 'public',
    source: 'external',
    sourceUrl,
    sourceName: 'ClawHub',
    verified: true,
    industry: 'Cross-industry',
    skillType,
    inputs: 'Prompt context|goal definition',
    outputs: 'Structured result|execution notes',
    prerequisites: 'Configured runtime and policy controls',
    toolsRequired: skillType,
    modelsSupported: 'Claude Sonnet|GPT-4.1',
    securityNotes: 'Validate tool permissions and redact sensitive output.',
    keyBenefits: 'Faster execution and reusable workflow quality.',
    limitations: 'Depends on source integration quality and runtime permissions.',
    requirements: 'Access controls, monitoring, and owner review.',
    exampleWorkflow: 'Define task; run skill; review output; publish or handoff.',
    usageCount: Number.isFinite(item.usageCount) ? item.usageCount : null,
    rating: Number.isFinite(item.rating) ? item.rating : null,
    docsUrl: sourceUrl,
    tags: Array.isArray(item.tags) ? item.tags : ['skill'],
    companies: ['Colaberry'],
    agents: [],
    mcpServers: [],
    useCases: [],
  };
}

const ALL_SEED_SKILLS = (() => {
  const merged = [...SAMPLE_SKILLS, ...loadClawhubTopSkills().map(toClawhubSeedSkill)];
  const bySlug = new Map();
  for (const skill of merged) {
    if (!skill?.slug) continue;
    bySlug.set(skill.slug, skill);
  }
  return Array.from(bySlug.values());
})();

const shouldPublish = process.argv.includes('--publish');

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 100);
}

function compactData(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
}

async function getOrCreateTag(name) {
  const slug = slugify(name);
  const existing = await strapi.db.query('api::tag.tag').findOne({ where: { slug }, select: ['id'] });
  if (existing) return existing.id;

  const created = await strapi.db.query('api::tag.tag').create({
    data: {
      name,
      slug,
      ...(shouldPublish ? { publishedAt: new Date() } : {}),
    },
    select: ['id'],
  });
  return created.id;
}

async function getOrCreateCompany(name) {
  const slug = slugify(name);
  const existing = await strapi.db.query('api::company.company').findOne({ where: { slug }, select: ['id'] });
  if (existing) return existing.id;

  const created = await strapi.db.query('api::company.company').create({
    data: {
      name,
      slug,
      ...(shouldPublish ? { publishedAt: new Date() } : {}),
    },
    select: ['id'],
  });
  return created.id;
}

async function findIdsBySlugs(uid, slugs) {
  if (!Array.isArray(slugs) || slugs.length === 0) return [];

  const ids = [];
  for (const slug of slugs) {
    const entry = await strapi.db.query(uid).findOne({ where: { slug }, select: ['id'] });
    if (entry?.id) {
      ids.push(entry.id);
    } else {
      console.log(`WARN: ${uid} relation not found for slug ${slug}`);
    }
  }
  return ids;
}

async function upsertSkill(skill) {
  const tagIds = [];
  for (const tag of skill.tags || []) {
    tagIds.push(await getOrCreateTag(tag));
  }

  const companyIds = [];
  for (const company of skill.companies || []) {
    companyIds.push(await getOrCreateCompany(company));
  }

  const agentIds = await findIdsBySlugs('api::agent.agent', skill.agents || []);
  const mcpServerIds = await findIdsBySlugs('api::mcp-server.mcp-server', skill.mcpServers || []);
  const useCaseIds = await findIdsBySlugs('api::use-case.use-case', skill.useCases || []);

  const payload = compactData({
    name: skill.name,
    slug: skill.slug,
    summary: skill.summary ?? null,
    longDescription: skill.longDescription ?? null,
    category: skill.category ?? null,
    provider: skill.provider ?? null,
    status: skill.status ?? 'live',
    visibility: skill.visibility ?? 'public',
    source: skill.source ?? 'internal',
    sourceUrl: skill.sourceUrl ?? null,
    sourceName: skill.sourceName ?? null,
    verified: Boolean(skill.verified),
    industry: skill.industry ?? null,
    skillType: skill.skillType ?? null,
    inputs: skill.inputs ?? null,
    outputs: skill.outputs ?? null,
    prerequisites: skill.prerequisites ?? null,
    toolsRequired: skill.toolsRequired ?? null,
    modelsSupported: skill.modelsSupported ?? null,
    securityNotes: skill.securityNotes ?? null,
    keyBenefits: skill.keyBenefits ?? null,
    limitations: skill.limitations ?? null,
    requirements: skill.requirements ?? null,
    exampleWorkflow: skill.exampleWorkflow ?? null,
    usageCount: Number.isFinite(skill.usageCount) ? skill.usageCount : null,
    rating: Number.isFinite(skill.rating) ? skill.rating : null,
    lastUpdated: skill.lastUpdated ? new Date(skill.lastUpdated) : new Date(),
    docsUrl: skill.docsUrl ?? null,
    demoUrl: skill.demoUrl ?? null,
    tags: tagIds,
    companies: companyIds,
    agents: agentIds,
    mcpServers: mcpServerIds,
    useCases: useCaseIds,
    ...(shouldPublish ? { publishedAt: new Date() } : {}),
  });

  const existing = await strapi.db
    .query('api::skill.skill')
    .findOne({ where: { slug: skill.slug }, select: ['id'] });

  if (existing?.id) {
    await strapi.db.query('api::skill.skill').update({
      where: { id: existing.id },
      data: payload,
    });
    console.log(`Updated skill ${skill.slug}`);
    return;
  }

  await strapi.db.query('api::skill.skill').create({ data: payload });
  console.log(`Created skill ${skill.slug}`);
}

async function seedSkills() {
  console.log(`Seeding ${ALL_SEED_SKILLS.length} skills...`);
  for (const skill of ALL_SEED_SKILLS) {
    await upsertSkill(skill);
  }

  const totalSkills = await strapi.db.query('api::skill.skill').count();
  const preview = await strapi.db.query('api::skill.skill').findMany({
    select: ['name', 'slug', 'status', 'visibility'],
    orderBy: { updatedAt: 'desc' },
    limit: 5,
  });

  console.log(`Seed complete. Total skills in DB: ${totalSkills}`);
  console.log('Sample skills:');
  preview.forEach((item) => {
    console.log(`- ${item.name} (${item.slug}) [${item.status}/${item.visibility}]`);
  });
}

async function main() {
  const { createStrapi, compileStrapi } = require('@strapi/strapi');

  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();
  app.log.level = 'error';

  await seedSkills();
  await app.destroy();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
