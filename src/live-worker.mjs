import {
  transcriptRecord,
  tryDecodeFrame,
  verifyTranscriptRecord
} from "../../tclk/dist/index.js";

const BASE = "https://technocore.chat";
const ROOM = "tclk-offers";

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

console.log("FLOP/TCLK live worker");
console.log("Mode: STRICT READ-ONLY");
console.log("No key loaded. Nothing can be posted.");
console.log("");

//
// Bootstrap using the latest visible messages.
//
const initial = await read({ limit: "50" });

let lastSeq = 0;

for (const m of initial.messages ?? []) {
  if (Number(m.seq) > lastSeq) {
    lastSeq = Number(m.seq);
  }
}

console.log(`Starting cursor: ${lastSeq}`);
console.log("");

while (true) {
  try {
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

    for (const message of messages) {
      const seq = Number(message.seq);

      if (seq > lastSeq) {
        lastSeq = seq;
      }

      let record;

      try {
        record = transcriptRecord(ROOM, message);
      } catch {
        continue;
      }

      const verified = verifyTranscriptRecord(record);

      if (!verified.ok) {
        continue;
      }

      const frame = tryDecodeFrame(record.line);

      if (!frame) continue;
      if (frame.from !== record.sender) continue;

      const candidate = classify(frame);

      if (!candidate) continue;

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

      if (frame.job) {
        console.log(`job      : ${frame.job.id}`);

        if (frame.job.context) {
          console.log(
            `context  : ${frame.job.context.slice(0, 350)}`
          );
        }
      }

      if (candidate.score >= 90) {
        console.log("ACTION   : ⭐ HIGH-QUALITY CANDIDATE");
      } else if (candidate.score >= 75) {
        console.log("ACTION   : REVIEW");
      } else {
        console.log("ACTION   : IGNORE / LOW PRIORITY");
      }
    }
  } catch (error) {
    console.error(
      new Date().toISOString(),
      error.message
    );

    await sleep(5000);
  }
}
