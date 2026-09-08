import { createHandlers } from "../../tclk/mcp/dist/index.js";
import {
  tryDecodeFrame,
  verifyTranscriptRecord
} from "../../tclk/dist/index.js";

const URL = "https://technocore.chat";

const tclk = createHandlers({
  env: { TECHNOCORE_URL: URL }
});

const result = await tclk.tclk_read_room({
  room: "tclk-offers"
});

let authenticated = 0;
let badSignature = 0;
let badSenderBinding = 0;
let nonTclk = 0;

const offers = [];

for (const record of result.records) {
  const verification = verifyTranscriptRecord(record);

  if (!verification.ok) {
    badSignature++;
    continue;
  }

  const frame = tryDecodeFrame(record.line);

  if (!frame) {
    nonTclk++;
    continue;
  }

  if (frame.from !== record.sender) {
    badSenderBinding++;
    continue;
  }

  authenticated++;

  if (frame.type === "offer") {
    offers.push({
      seq: record.seq,
      ts: new Date(record.timestampMs).toISOString(),
      sender: record.sender,
      frame
    });
  }
}

console.log(`Venue:              ${URL}`);
console.log(`Records normalized: ${result.count}`);
console.log(`Malformed records:  ${result.malformed.length}`);
console.log(`Authenticated TCLK: ${authenticated}`);
console.log(`Bad signatures:     ${badSignature}`);
console.log(`Bad sender binding: ${badSenderBinding}`);
console.log(`Non-TCLK records:   ${nonTclk}`);
console.log(`Last seq:           ${result.lastSeq}`);
console.log("");
console.log(`Authenticated offers: ${offers.length}`);
console.log("");

for (const { seq, ts, sender, frame } of offers) {
  const expired = frame.expiresMs <= Date.now();

  console.log(`seq       : ${seq}`);
  console.log(`time      : ${ts}`);
  console.log(`sender    : ${sender}`);
  console.log(`amount    : ${frame.amount} ${frame.asset}`);
  console.log(`role      : ${frame.role}`);
  console.log(`lock      : ${frame.lock}`);
  console.log(`rails     : ${frame.rails.join(", ")}`);
  console.log(`status    : ${expired ? "EXPIRED" : "OPEN by timestamp"}`);

  if (frame.job) {
    console.log(
      `job       : ${frame.job.proto}:${frame.job.id}` +
      (frame.job.context ? ` (${frame.job.context})` : "")
    );
  } else {
    console.log("job       : none");
  }

  console.log(`offer id  : ${frame.id}`);
  console.log("-".repeat(72));
}
