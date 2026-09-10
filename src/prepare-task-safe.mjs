import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createHandlers } from "../../tclk/mcp/dist/index.js";
import { loadAgentIdentity } from "./lib/identity.mjs";
import {
  tryDecodeFrame,
  parseTranscriptExport,
  verifyTranscriptRecord
} from "../../tclk/dist/index.js";

const TARGET = process.argv[2];
const TARGET_SEQ = Number(process.argv[3]);
const PROPOSED_ANSWER = process.argv[4];

if (
  !TARGET ||
  !/^0x[0-9a-f]{64}$/.test(TARGET) ||
  !Number.isSafeInteger(TARGET_SEQ) ||
  TARGET_SEQ < 1 ||
  !PROPOSED_ANSWER
) {
  throw new Error(
    "Usage: node src/prepare-task-safe.mjs <offer-id> <offer-seq> <answer>"
  );
}

const { did, tclk } = loadAgentIdentity({ createHandlers });

/*
 * Window only.
 * Nothing is posted by this script.
 */
const response = await fetch(
  "https://technocore.chat/r/tclk-offers/export"
);

if (!response.ok) {
  throw new Error(`Technocore export failed: HTTP ${response.status}`);
}

const exportText = await response.text();

/*
 * Do NOT parse the whole export: the public room contains old malformed
 * records and TCLK intentionally rejects an incomplete full-history audit.
 *
 * Locate the raw JSONL row by venue seq first, then parse only that row.
 */
const rawLine = exportText
  .split("\n")
  .find((line) => {
    const match = line.match(/"seq"\s*:\s*(\d+)/);
    return match && Number(match[1]) === TARGET_SEQ;
  });

let target = null;

if (rawLine) {
  let records;

  try {
    records = parseTranscriptExport("tclk-offers", rawLine);
  } catch (error) {
    throw new Error(
      `Target export row could not be normalized: ${error.message}`
    );
  }

  const record = records[0];

  if (record) {
    const verified = verifyTranscriptRecord(record);

    if (verified.ok) {
      const frame = tryDecodeFrame(record.line);

      if (
        frame &&
        frame.from === record.sender &&
        frame.type === "offer" &&
        frame.id === TARGET
      ) {
        target = { record, frame };
      }
    }
  }
}

if (!target) {
  throw new Error(
    "Authenticated offer not found in current board window"
  );
}

if (target.frame.expiresMs <= Date.now()) {
  throw new Error("Offer has expired");
}

if (target.frame.role !== "payer") {
  throw new Error(
    `Expected payer offer, got ${target.frame.role}`
  );
}

console.log("✅ Authenticated payer offer found");
console.log(`Offer : ${target.frame.id}`);
console.log(`Payer : ${target.frame.from}`);
console.log(`Amount: ${target.frame.amount} ${target.frame.asset}`);
console.log(`Rails : ${target.frame.rails.join(", ")}`);

if (target.frame.job) {
  console.log(
    `Job   : ${target.frame.job.proto}:${target.frame.job.id}`
  );
}

/*
 * Pure local transform.
 * This creates the accept + secret but DOES NOT post it.
 */
const accept = tclk.tclk_accept_offer({
  offer: target.record.line,
  from: did
});

const tasksDir = path.join(
  os.homedir(),
  ".config",
  "flop",
  "tasks"
);

fs.mkdirSync(tasksDir, {
  recursive: true,
  mode: 0o700
});

const statePath = path.join(
  tasksDir,
  `${accept.contract}.json`
);

const state = {
  version: 1,
  status: "PREPARED_NOT_POSTED",

  preparedAt: new Date().toISOString(),
  venue: "https://technocore.chat",

  agentDid: did,

  offer: {
    id: target.frame.id,
    line: target.record.line,
    payer: target.frame.from,
    amount: target.frame.amount,
    asset: target.frame.asset,
    rails: target.frame.rails,
    expiresMs: target.frame.expiresMs,
    job: target.frame.job ?? null
  },

  proposedAnswer: PROPOSED_ANSWER,

  accept: {
    line: accept.line,
    contract: accept.contract,
    statement: accept.statement,
    dealRoom: accept.dealRoom,
    stateNote: accept.stateNote
  },

  secret: accept.secret
};

fs.writeFileSync(
  statePath,
  JSON.stringify(state, null, 2) + "\n",
  { mode: 0o600 }
);

fs.chmodSync(statePath, 0o600);

console.log("");
console.log("✅ ACCEPT GENERATED LOCALLY");
console.log("✅ SECRET SAVED PRIVATELY");
console.log("❌ NOTHING POSTED TO TECHNOCORE");
console.log("");
console.log(`Contract: ${accept.contract}`);
console.log(`Room:     ${accept.dealRoom}`);
console.log(`State:    ${statePath}`);
