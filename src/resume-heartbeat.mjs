import fs from "node:fs";

import { createHandlers } from "../../tclk/mcp/dist/index.js";
import { loadAgentIdentity } from "./lib/identity.mjs";

const statePath = process.argv[2];

if (!statePath) {
  throw new Error("Usage: node src/resume-heartbeat.mjs <state-file>");
}

const stat = fs.statSync(statePath);

if ((stat.mode & 0o777) !== 0o600) {
  throw new Error(
    "Refusing: task state file must have permissions 600"
  );
}

const state = JSON.parse(fs.readFileSync(statePath, "utf8"));

if (state.status !== "ACCEPT_POSTED") {
  throw new Error(`Refusing: expected ACCEPT_POSTED, got ${state.status}`);
}

const { did, tclk } = loadAgentIdentity({ createHandlers });

if (state.agentDid && state.agentDid !== did) {
  throw new Error(
    `Task belongs to ${state.agentDid}, but local identity is ${did}`
  );
}

const heartbeat = tclk.tclk_make_heartbeat({
  from: did,
  contract: state.accept.contract,
  note: "active"
});

console.log("Contract:", state.accept.contract);
console.log("Room    :", state.accept.dealRoom);
console.log("Posting heartbeat only...");
console.log("");

try {
  const posted = await tclk.tclk_post_frame({
    room: state.accept.dealRoom,
    line: heartbeat.line
  });

  if (!posted.posted) {
    throw new Error("Heartbeat was not posted");
  }

  state.status = "ACCEPTED_HEARTBEAT_POSTED";
  state.heartbeatPostedAt = new Date().toISOString();

  fs.writeFileSync(
    statePath,
    JSON.stringify(state, null, 2) + "\n",
    { mode: 0o600 }
  );

  console.log("✅ HEARTBEAT POSTED");
  console.log("DID :", did);
  console.log("Room:", state.accept.dealRoom);
  console.log("");
  console.log("Secret remains private.");
} catch (err) {
  console.error("❌ HEARTBEAT NOT POSTED");
  console.error(err.message);
  console.error("");
  console.error("Local status remains ACCEPT_POSTED.");
  process.exitCode = 2;
}
