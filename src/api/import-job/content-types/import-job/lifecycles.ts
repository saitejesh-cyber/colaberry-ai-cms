import fs from 'node:fs/promises';
import path from 'node:path';
import type { Core } from '@strapi/strapi';
import { runImportDispatch } from '../../services/csv-import';

declare const strapi: Core.Strapi;

const IMPORT_JOB_UID = 'api::import-job.import-job';
const queuedJobIds = new Set<number>();

type ImportJob = {
  id: number;
  entityType?: string | null;
  csvText?: string | null;
  sourceUrl?: string | null;
  dryRun?: boolean | null;
  strictMode?: boolean | null;
  createRelations?: boolean | null;
  publishEntries?: boolean | null;
  runImport?: boolean | null;
  csvFile?:
    | {
        id?: number;
        url?: string | null;
        name?: string | null;
        mime?: string | null;
      }
    | null;
};

function toBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (value == null) return fallback;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

async function readCsvFromMedia(media: ImportJob['csvFile']) {
  if (!media) return null;

  const url = String(media.url || '').trim();
  if (!url) return null;

  if (url.startsWith('/')) {
    const localPath = path.join(process.cwd(), 'public', url);
    try {
      return await fs.readFile(localPath, 'utf8');
    } catch {
      return null;
    }
  }

  if (/^https?:\/\//i.test(url)) {
    const response = await fetch(url);
    if (!response.ok) return null;
    return response.text();
  }

  return null;
}

async function readCsvFromSourceUrl(sourceUrl: string | null | undefined) {
  const value = String(sourceUrl || '').trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return null;

  const response = await fetch(value);
  if (!response.ok) return null;
  return response.text();
}

async function loadJob(jobId: number): Promise<ImportJob | null> {
  const job = await (strapi.db.query(IMPORT_JOB_UID) as any).findOne({
    where: { id: jobId },
    populate: {
      csvFile: true,
    },
  });

  return (job as ImportJob | null) ?? null;
}

async function updateJob(jobId: number, data: Record<string, unknown>) {
  await (strapi.db.query(IMPORT_JOB_UID) as any).update({
    where: { id: jobId },
    data,
  });
}

async function processImportJob(jobId: number) {
  const startedAt = new Date().toISOString();

  await updateJob(jobId, {
    status: 'processing',
    startedAt,
    processedAt: null,
    summary: null,
    errors: null,
    lastMessage: 'Import started.',
    runImport: false,
  });

  try {
    const job = await loadJob(jobId);
    if (!job) {
      throw new Error('Import job not found.');
    }

    const entityType = String(job.entityType || '').trim();
    if (!entityType) {
      throw new Error('entityType is required.');
    }

    let csvText = String(job.csvText || '').trim();
    if (!csvText) {
      const fileCsvText = await readCsvFromMedia(job.csvFile);
      csvText = String(fileCsvText || '').trim();
    }
    if (!csvText) {
      const sourceCsvText = await readCsvFromSourceUrl(job.sourceUrl);
      csvText = String(sourceCsvText || '').trim();
    }

    if (!csvText) {
      throw new Error('CSV input missing. Provide csvText, csvFile, or sourceUrl.');
    }

    const result = await runImportDispatch(strapi, {
      entityType,
      csvText,
      dryRun: toBoolean(job.dryRun, true),
      strictMode: toBoolean(job.strictMode, false),
      createRelations: toBoolean(job.createRelations, true),
      publishEntries: toBoolean(job.publishEntries, true),
    });

    const hasErrors = result.summary.failed > 0;
    const processedAt = new Date().toISOString();

    await updateJob(jobId, {
      status: hasErrors ? 'failed' : 'completed',
      processedAt,
      summary: result.summary,
      errors: result.errors.slice(0, 500),
      lastMessage: hasErrors
        ? `Import completed with ${result.summary.failed} failed row(s).`
        : 'Import completed successfully.',
      runImport: false,
    });
  } catch (error) {
    const processedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : 'Unknown import error';

    await updateJob(jobId, {
      status: 'failed',
      processedAt,
      lastMessage: message,
      runImport: false,
    });
  }
}

function shouldTriggerImport(event: any) {
  return event?.params?.data?.runImport === true;
}

function queueImport(jobId: number) {
  if (!Number.isFinite(jobId) || jobId <= 0) return;
  if (queuedJobIds.has(jobId)) return;

  queuedJobIds.add(jobId);

  setTimeout(() => {
    processImportJob(jobId)
      .catch((error) => {
        strapi.log.error(`Import job failed for ${jobId}: ${error}`);
      })
      .finally(() => {
        queuedJobIds.delete(jobId);
      });
  }, 0);
}

export default {
  async afterCreate(event: any) {
    if (!shouldTriggerImport(event)) return;
    const jobId = Number(event?.result?.id || 0);
    queueImport(jobId);
  },

  async afterUpdate(event: any) {
    if (!shouldTriggerImport(event)) return;
    const jobId = Number(event?.result?.id || 0);
    queueImport(jobId);
  },
};
