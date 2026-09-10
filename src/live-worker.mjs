import {
  transcriptRecord,
  tryDecodeFrame,
  verifyTranscriptRecord
} from "../../tclk/dist/index.js";

import {
  loadRadarState,
  radarStatePath,
  saveRadarState
} from "./lib/radar-state.mjs";

import {
  checkTechnocoreHealth,
  formatTechnocoreHealth
} from "./lib/technocore-health.mjs";

import { analyzeJobRisk } from "./lib/job-risk.mjs";
import {
  extractJobSpecPath,
  fetchJobSpec
} from "./lib/job-spec.mjs";

const BASE = "https://technocore.chat";
const ROOM = "tclk-offers";
const HEALTH_INTERVAL_MS = 5 * 60 * 1000;

let nextHealthCheckAt = 0;

async function refreshHealth({ force = false } = {}) {
  const now = Date.now();

  if (!force && now < nextHealthCheckAt) {
    return;
  }

  nextHealthCheckAt = now + HEALTH_INTERVAL_MS;

  const health = await checkTechnocoreHealth({
    base: BASE
  });

  console.log("");
  console.log("-".repeat(72));
  console.log("TECHNOCORE HEALTH");
  console.log(formatTechnocoreHealth(health));
  console.log("-".repeat(72));
  console.log("");

  //
  // RADAR remains allowed to observe even when venue health is degraded.
  // EXECUTION is informational only here: this worker has no execution
  // capability, no signing key, and no write endpoint.
  //
}

const ACCEPTED_JOBS = new Set([
  "math",
  "validation",
  "attest",
  "census",
  "protocol"
]);

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function read(params) {
  const qs = new URLSearchParams({
    format: "json",
    ...params
  });

  const res = await fetch(`${BASE}/r/${ROOM}?${qs}`);

  if (!res.ok) {
    throw new Error(`Technocore HTTP ${res.status}`);
  }

  return res.json();
}

function classify(frame) {
  if (frame.type !== "offer") return null;
  if (frame.role !== "payer") return null;

  const now = Date.now();
  const remainingSec =
    Math.floor((frame.expiresMs - now) / 1000);

  if (remainingSec <= 0) return null;

  const proto = frame.job?.proto ?? "-";
  const context = frame.job?.context ?? "";

  let category = "unknown";

  for (const candidate of ACCEPTED_JOBS) {
    if (
      frame.job?.id?.includes(candidate) ||
      context.toLowerCase().startsWith(candidate)
    ) {
      category = candidate;
      break;
    }
  }

  let score = 50;

  if (frame.rails.length === 1 && frame.rails[0] === "paper")
    score += 20;

  if (category !== "unknown")
    score += 20;

  if (remainingSec >= 300)
    score += 5;

  if (remainingSec >= 600)
    score += 5;

  return {
    category,
    score: Math.min(score, 100),
    remainingSec,
    proto
  };
}

async function processMessage(message, seq) {
  let record;

  try {
    record = transcriptRecord(ROOM, message);
  } catch {
    return;
  }

  const verified = verifyTranscriptRecord(record);

  if (!verified.ok) {
    return;
  }

  const frame = tryDecodeFrame(record.line);

  if (!frame) return;
  if (frame.from !== record.sender) return;

  const candidate = classify(frame);

  if (!candidate) return;

  let risk = analyzeJobRisk(frame);
  let specStatus = "INLINE";

  if (risk.level === "NEEDS_SPEC_REVIEW") {
    const specPath = extractJobSpecPath(
      frame.job?.context
    );

    if (specPath) {
      try {
        const spec = await fetchJobSpec({
          path: specPath,
          base: BASE
        });

        risk = analyzeJobRisk(frame, {
          specText: spec.text
        });

        specStatus = "LOADED READ-ONLY";
      } catch (error) {
        specStatus =
          `FETCH FAILED: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`;
      }
    } else {
      specStatus = "UNSUPPORTED SPEC REFERENCE";
    }
  }

  const minutes = Math.floor(
    candidate.remainingSec / 60
  );

  console.log("");
  console.log("=".repeat(72));
  console.log(
    `[${String(candidate.score).padStart(3)}] ` +
    `${candidate.category.toUpperCase()} | ` +
    `${frame.amount} ${frame.asset} | ` +
    `${minutes}m left`
  );

  console.log(`seq      : ${seq}`);
  console.log(`offer    : ${frame.id}`);
  console.log(`payer    : ${frame.from}`);
  console.log(`rails    : ${frame.rails.join(", ")}`);
  console.log(`proto    : ${candidate.proto}`);
  console.log(`risk     : ${risk.level}`);
  console.log(`spec     : ${specStatus}`);

  if (risk.signals.length > 0) {
    console.log(`signals  : ${risk.signals.join(", ")}`);
  }

  console.log("auto     : DISABLED");

  if (frame.job) {
    console.log(`job      : ${frame.job.id}`);

    if (frame.job.context) {
      console.log(
        `context  : ${frame.job.context.slice(0, 350)}`
      );
    }
  }

  if (risk.level === "MANUAL_ONLY") {
    console.log("ACTION   : ⚠️ MANUAL REVIEW ONLY");
  } else if (risk.level === "NEEDS_SPEC_REVIEW") {
    console.log("ACTION   : 🔎 LOAD FULL SPEC BEFORE REVIEW");
  } else if (candidate.score >= 90) {
    console.log(
      "ACTION   : ⭐ HIGH-QUALITY READ-ONLY CANDIDATE"
    );
  } else if (candidate.score >= 75) {
    console.log("ACTION   : REVIEW");
  } else {
    console.log("ACTION   : IGNORE / LOW PRIORITY");
  }
}

console.log("FLOP/TCLK live worker");
console.log("Mode: STRICT READ-ONLY");
console.log("No key loaded. Nothing can be posted.");
console.log("");

await refreshHealth({ force: true });

//
// Restore the durable cursor.
// On a first run, bootstrap from the latest visible messages so the radar
// starts at the live edge instead of replaying historical traffic.
//
const persisted = loadRadarState();

let lastSeq = persisted.lastSeq;

console.log(`State file: ${radarStatePath()}`);

if (lastSeq === 0) {
  const initial = await read({ limit: "50" });

  for (const message of initial.messages ?? []) {
    const seq = Number(message.seq);

    if (
      Number.isSafeInteger(seq) &&
      seq > lastSeq
    ) {
      lastSeq = seq;
    }
  }

  saveRadarState(lastSeq);

  console.log(`Bootstrap cursor: ${lastSeq}`);
} else {
  console.log(`Resuming cursor: ${lastSeq}`);
}

console.log("");

while (true) {
  try {
    await refreshHealth();

    const data = await read({
      since: String(lastSeq),
      wait: "10",
      limit: "200"
    });

    if (data.wait_held === false) {
      await sleep(10000);
      continue;
    }

    const messages = data.messages ?? [];

    if (messages.length === 0) {
      continue;
    }

    const ordered = messages
      .map((message) => ({
        message,
        seq: Number(message.seq)
      }))
      .filter(
        ({ seq }) =>
          Number.isSafeInteger(seq) &&
          seq > lastSeq
      )
      .sort((a, b) => a.seq - b.seq);

    for (const { message, seq } of ordered) {
      //
      // Advance the durable cursor only after this message has been
      // processed successfully. An unexpected processing failure will
      // therefore retry the same message after restart.
      //
      await processMessage(message, seq);

      lastSeq = seq;
      saveRadarState(lastSeq);
    }
  } catch (error) {
    console.error(
      new Date().toISOString(),
      error.message
    );

    await sleep(5000);
  }
}
