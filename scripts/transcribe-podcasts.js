/* eslint-disable no-console */
const fs = require("fs");

const args = process.argv.slice(2);

const urlArgIndex = args.indexOf("--url");
const tokenArgIndex = args.indexOf("--token");
const webhookArgIndex = args.indexOf("--webhook");
const deepgramKeyArgIndex = args.indexOf("--deepgram-key");
const openaiKeyArgIndex = args.indexOf("--openai-key");
const providerArgIndex = args.indexOf("--provider");
const limitArgIndex = args.indexOf("--limit");
const logFileArgIndex = args.indexOf("--log-file");
const dryRun = args.includes("--dry-run");

const baseUrl =
  (urlArgIndex !== -1 ? args[urlArgIndex + 1] : process.env.STRAPI_URL) ||
  "http://localhost:1337";
const token =
  (tokenArgIndex !== -1 ? args[tokenArgIndex + 1] : process.env.STRAPI_TOKEN) || "";
const webhook =
  (webhookArgIndex !== -1 ? args[webhookArgIndex + 1] : process.env.TRANSCRIPT_WEBHOOK_URL) ||
  "";
const deepgramKey =
  (deepgramKeyArgIndex !== -1
    ? args[deepgramKeyArgIndex + 1]
    : process.env.DEEPGRAM_API_KEY) || "";
const openaiKey =
  (openaiKeyArgIndex !== -1
    ? args[openaiKeyArgIndex + 1]
    : process.env.OPENAI_API_KEY) || "";
const provider =
  (providerArgIndex !== -1
    ? args[providerArgIndex + 1]
    : process.env.TRANSCRIPT_PROVIDER) || "";
const limit = limitArgIndex !== -1 ? Number(args[limitArgIndex + 1]) : 20;
const logFile =
  (logFileArgIndex !== -1 ? args[logFileArgIndex + 1] : process.env.TRANSCRIPT_LOG_FILE) || "";

if (!token && !dryRun) {
  console.error("Missing STRAPI_TOKEN or --token.");
  process.exit(1);
}

if (!webhook && !openaiKey && !deepgramKey && !dryRun) {
  console.error(
    "Missing TRANSCRIPT_WEBHOOK_URL/--webhook, OPENAI_API_KEY/--openai-key, or DEEPGRAM_API_KEY/--deepgram-key."
  );
  process.exit(1);
}

function logEvent(level, message, context = {}) {
  const payload = {
    at: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }

  if (logFile) {
    try {
      fs.appendFileSync(logFile, `${line}\n`, "utf8");
    } catch (error) {
      console.error(`Failed to write transcript log file: ${error.message}`);
    }
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, options = {}) {
  const retries = Number.isFinite(options.retries) ? Number(options.retries) : 2;
  const initialDelayMs = Number.isFinite(options.initialDelayMs)
    ? Number(options.initialDelayMs)
    : 500;
  const label = options.label || "operation";

  let attempt = 0;
  // attempt count = retries + initial attempt
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }
      const delay = initialDelayMs * Math.pow(2, attempt);
      logEvent("warn", `${label} failed, retrying`, {
        attempt: attempt + 1,
        retries,
        delayMs: delay,
        reason: error?.message || "unknown",
      });
      await sleep(delay);
      attempt += 1;
    }
  }
}

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${options.method || "GET"} ${url} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function fetchEpisodes() {
  const basePath =
    `/api/podcast-episodes?publicationState=preview&pagination[page]=1&pagination[pageSize]=${limit}` +
    `&filters[audioUrl][$notNull]=true` +
    `&sort=publishedDate:desc`;

  // Primary query: include episodes where transcriptStatus is null OR not ready.
  const pendingPath =
    `${basePath}` +
    `&filters[$or][0][transcriptStatus][$null]=true` +
    `&filters[$or][1][transcriptStatus][$ne]=ready`;

  const pendingRes = await withRetry(() => request(pendingPath), {
    label: "fetch-episodes-pending",
  });
  const pendingEpisodes = pendingRes?.data || [];
  if (pendingEpisodes.length) {
    return pendingEpisodes;
  }

  // Fallback for environments where OR/null filters behave inconsistently.
  const allRes = await withRetry(() => request(basePath), {
    label: "fetch-episodes-fallback",
  });
  return (allRes?.data || []).filter((item) => {
    const attrs = item?.attributes || item || {};
    return String(attrs.transcriptStatus || "").toLowerCase() !== "ready";
  });
}

function normalizeSegments(segments) {
  if (!Array.isArray(segments)) return null;
  return segments
    .map((segment) => ({
      start: Number(segment.start) || 0,
      end: segment.end != null ? Number(segment.end) : null,
      text: String(segment.text || "").trim(),
    }))
    .filter((segment) => segment.text);
}

function formatSrtTime(seconds) {
  if (!Number.isFinite(seconds)) return "00:00:00,000";
  const totalMs = Math.max(0, Math.floor(seconds * 1000));
  const hrs = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
}

function formatVttTime(seconds) {
  if (!Number.isFinite(seconds)) return "00:00:00.000";
  const totalMs = Math.max(0, Math.floor(seconds * 1000));
  const hrs = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
}

function buildSrt(segments) {
  if (!segments?.length) return null;
  return segments
    .map((segment, index) => {
      const end = segment.end != null ? segment.end : segment.start + 5;
      return `${index + 1}\n${formatSrtTime(segment.start)} --> ${formatSrtTime(end)}\n${segment.text}\n`;
    })
    .join("\n");
}

function buildVtt(segments) {
  if (!segments?.length) return null;
  const body = segments
    .map((segment) => {
      const end = segment.end != null ? segment.end : segment.start + 5;
      return `${formatVttTime(segment.start)} --> ${formatVttTime(end)}\n${segment.text}`;
    })
    .join("\n\n");
  return `WEBVTT\n\n${body}`;
}

function buildSegmentsFromDeepgram(payload) {
  const alt = payload?.results?.channels?.[0]?.alternatives?.[0];
  if (!alt) return null;

  const paragraphSegments = alt?.paragraphs?.paragraphs
    ? alt.paragraphs.paragraphs
        .map((p) => ({
          start: p.start,
          end: p.end,
          text: p.text || (Array.isArray(p.sentences) ? p.sentences.map((s) => s.text).join(" ") : ""),
        }))
        .filter((p) => p.text)
    : null;

  if (paragraphSegments?.length) return paragraphSegments;

  const utterances = payload?.results?.utterances
    ? payload.results.utterances
        .map((u) => ({ start: u.start, end: u.end, text: u.transcript }))
        .filter((u) => u.text)
    : null;

  if (utterances?.length) return utterances;

  const words = alt?.words || [];
  if (!words.length) return null;

  const chunks = [];
  const chunkSize = 18;
  for (let i = 0; i < words.length; i += chunkSize) {
    const slice = words.slice(i, i + chunkSize);
    const start = slice[0]?.start ?? 0;
    const end = slice[slice.length - 1]?.end ?? start + 5;
    const text = slice
      .map((w) => w.punctuated_word || w.word || "")
      .join(" ")
      .trim();
    if (text) chunks.push({ start, end, text });
  }
  return chunks.length ? chunks : null;
}

function buildSegmentsFromOpenAI(payload) {
  if (!payload?.segments?.length) return null;
  return payload.segments
    .map((segment) => ({
      start: Number(segment.start) || 0,
      end: segment.end != null ? Number(segment.end) : null,
      text: String(segment.text || "").trim(),
    }))
    .filter((segment) => segment.text);
}

async function resolveEpisodeDocId(docId, slug) {
  if (!slug) return docId;
  try {
    const res = await request(
      `/api/podcast-episodes?publicationState=preview&filters[slug][$eq]=${encodeURIComponent(slug)}`
    );
    if (res?.data?.length) {
      return res.data[0].documentId || res.data[0].id;
    }
  } catch (err) {
    console.log(`Failed to resolve id for ${slug}: ${err.message}`);
  }
  return docId;
}


async function updateEpisode(docId, data, slug) {
  if (dryRun) {
    logEvent("info", "DRY RUN: episode update skipped", {
      slug,
      targetId: docId,
      fields: Object.keys(data),
    });
    return;
  }
  const targetId = await withRetry(() => resolveEpisodeDocId(docId, slug), {
    label: "resolve-episode-id",
  });
  await withRetry(
    () =>
      request(`/api/podcast-episodes/${targetId}`, {
        method: "PUT",
        body: JSON.stringify({ data }),
      }),
    { label: "update-episode" }
  );
}

async function transcribeWithWebhook(audioUrl, attrs) {
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioUrl,
      slug: attrs.slug,
      title: attrs.title,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Transcript webhook failed");
  }
  const payload = await res.json();
  const segments = normalizeSegments(payload.segments || payload.transcriptSegments);
  const transcriptSrt = payload.srt || buildSrt(segments);
  const transcriptVtt = payload.vtt || buildVtt(segments);
  return {
    segments,
    transcriptSrt,
    transcriptVtt,
    transcriptText: payload.text || payload.transcript || null,
  };
}

async function transcribeWithDeepgram(audioUrl) {
  const res = await fetch(
    "https://api.deepgram.com/v1/listen?punctuate=true&paragraphs=true&utterances=true&timestamps=true&smart_format=true&model=nova-2",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${deepgramKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: audioUrl }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Deepgram transcription failed");
  }
  const payload = await res.json();
  const segments = buildSegmentsFromDeepgram(payload);
  const transcriptText = payload?.results?.channels?.[0]?.alternatives?.[0]?.transcript || null;
  return {
    segments,
    transcriptSrt: buildSrt(segments),
    transcriptVtt: buildVtt(segments),
    transcriptText,
  };
}

async function transcribeWithOpenAI(audioUrl) {
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    const text = await audioRes.text();
    throw new Error(text || "Failed to fetch audio");
  }
  const contentType = audioRes.headers.get("content-type") || "audio/mpeg";
  const buffer = await audioRes.arrayBuffer();
  const blob = new Blob([buffer], { type: contentType });
  const form = new FormData();
  form.append("file", blob, "audio.mp3");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
    },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "OpenAI transcription failed");
  }
  const payload = await res.json();
  const segments = buildSegmentsFromOpenAI(payload);
  return {
    segments,
    transcriptSrt: buildSrt(segments),
    transcriptVtt: buildVtt(segments),
    transcriptText: payload?.text || null,
  };
}

async function run() {
  const episodes = await fetchEpisodes();
  if (!episodes.length) {
    logEvent("info", "No episodes to transcribe.");
    return;
  }

  logEvent("info", "Starting podcast transcription batch", {
    total: episodes.length,
    provider: webhook ? "webhook" : provider || (deepgramKey ? "deepgram" : "none"),
    dryRun,
  });

  for (const item of episodes) {
    const id = item.id;
    const docId = item.documentId || item.documentId || item.document_id || null;
    const attrs = item.attributes || item;
    const audioUrl = attrs.audioUrl;
    if (!audioUrl) continue;

    const episodeLabel = attrs.slug || attrs.title || String(id);
    logEvent("info", "Transcribing episode", {
      episode: episodeLabel,
      id: docId || id,
    });
    await updateEpisode(
      docId || id,
      { transcriptStatus: "processing", transcriptSource: "auto" },
      attrs.slug
    );

    if (dryRun) continue;

    try {
      let result;
      const providerKey = provider.toLowerCase();
      if (webhook) {
        result = await withRetry(() => transcribeWithWebhook(audioUrl, attrs), {
          label: "transcribe-webhook",
        });
      } else if (providerKey === "openai") {
        if (!openaiKey) {
          throw new Error("OPENAI_API_KEY is required for provider=openai.");
        }
        result = await withRetry(() => transcribeWithOpenAI(audioUrl), {
          label: "transcribe-openai",
        });
      } else if (providerKey === "deepgram") {
        if (!deepgramKey) {
          throw new Error("DEEPGRAM_API_KEY is required for provider=deepgram.");
        }
        result = await withRetry(() => transcribeWithDeepgram(audioUrl), {
          label: "transcribe-deepgram",
        });
      } else if (deepgramKey) {
        result = await withRetry(() => transcribeWithDeepgram(audioUrl), {
          label: "transcribe-deepgram-default",
        });
      } else {
        result = await withRetry(() => transcribeWithDeepgram(audioUrl), {
          label: "transcribe-deepgram-fallback",
        });
      }

      if (!result.segments?.length) {
        throw new Error("No transcript segments returned");
      }

      await updateEpisode(
        docId || id,
        {
          transcriptSegments: result.segments,
          transcriptSrt: result.transcriptSrt,
          transcriptVtt: result.transcriptVtt,
          transcriptStatus: "ready",
          transcriptSource: "auto",
          transcriptGeneratedAt: new Date().toISOString(),
        },
        attrs.slug
      );
      logEvent("info", "Transcript ready", {
        episode: episodeLabel,
        segments: result.segments.length,
      });
    } catch (err) {
      logEvent("error", "Transcript failed", {
        episode: episodeLabel,
        reason: err?.message || "unknown",
      });
      await updateEpisode(docId || id, { transcriptStatus: "failed" }, attrs.slug);
    }
  }

  logEvent("info", "Podcast transcription batch complete", { total: episodes.length });
}

run().catch((err) => {
  logEvent("error", "Podcast transcription job failed", { reason: err?.message || "unknown" });
  process.exit(1);
});
