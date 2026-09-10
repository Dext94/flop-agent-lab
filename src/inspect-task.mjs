import fs from "node:fs";

import { createHandlers } from "../../tclk/mcp/dist/index.js";
import {
  tryDecodeFrame,
  verifyTranscriptRecord
} from "../../tclk/dist/index.js";

const statePath = process.argv[2];

if (!statePath) {
  throw new Error("Usage: node src/inspect-task.mjs <state-file>");
}

const stat = fs.statSync(statePath);

if ((stat.mode & 0o777) !== 0o600) {
  throw new Error(
    "Refusing: task state file must have permissions 600"
  );
}

const state = JSON.parse(
  fs.readFileSync(statePath, "utf8")
);

if (
  typeof state.accept?.contract !== "string" ||
  typeof state.accept?.dealRoom !== "string" ||
  typeof state.offer?.payer !== "string"
) {
  throw new Error("Task state is missing required contract metadata");
}

if (
  !Array.isArray(state.offer?.rails) ||
  state.offer.rails.length === 0
) {
  throw new Error("Task state has no accepted settlement rails");
}

const tclk = createHandlers({
  env: {
    TECHNOCORE_URL: "https://technocore.chat"
  }
});

const view = await tclk.tclk_read_room({
  room: state.accept.dealRoom
});

const records = Array.isArray(view.records)
  ? view.records
  : [];

const malformed = Array.isArray(view.malformed)
  ? view.malformed
  : [];

console.log(`Contract : ${state.accept.contract}`);
console.log(`Room     : ${state.accept.dealRoom}`);
console.log(`Local    : ${state.status}`);
console.log(`Records  : ${view.count ?? records.length}`);
console.log(`Malformed: ${malformed.length}`);
console.log("");

let lock = null;

for (const record of records) {
  const verified = verifyTranscriptRecord(record);

  if (!verified.ok) {
    console.log(`seq ${record.seq}: ❌ bad signature`);
    continue;
  }

  const frame = tryDecodeFrame(record.line);

  if (!frame) {
    console.log(`seq ${record.seq}: signed non-TCLK message`);
    continue;
  }

  const binding = frame.from === record.sender;

  console.log(
    `seq ${record.seq}: ${frame.type} | ${record.sender} | ` +
    `binding=${binding ? "OK" : "BAD"}`
  );

  if (
    binding &&
    frame.type === "lock" &&
    frame.contract === state.accept.contract &&
    record.sender === state.offer.payer &&
    state.offer.rails.includes(frame.rail)
  ) {
    lock = frame;
  }
}

console.log("");

if (!lock) {
  console.log("⏳ No authenticated payer LOCK yet.");
  console.log("Do not reveal the secret.");
} else {
  console.log("✅ AUTHENTICATED PAYER LOCK FOUND");
  console.log(`Rail: ${lock.rail}`);
  console.log(`Ref : ${lock.ref}`);
  console.log("");

  const now = Date.now();
  const claimByMs = state.offer.claimByMs;
  const refundAfterMs = state.offer.refundAfterMs;

  if (
    Number.isSafeInteger(refundAfterMs) &&
    now >= refundAfterMs
  ) {
    console.log("❌ Refund deadline has passed.");
    console.log("Do not reveal the secret.");
  } else if (
    Number.isSafeInteger(claimByMs) &&
    now >= claimByMs
  ) {
    console.log("⚠️ Claim deadline has passed.");
    console.log("Do not reveal automatically; manual review required.");
  } else {
    console.log("The contract is ready for the work/reveal phase.");
  }
}
