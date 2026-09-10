import fs from "node:fs";

import { createHandlers } from "../../tclk/mcp/dist/index.js";
import { loadAgentIdentity } from "./lib/identity.mjs";

const statePath = process.argv[2];

if (!statePath) {
  throw new Error("Usage: node src/start-task.mjs <state-file>");
}

const stat = fs.statSync(statePath);

if ((stat.mode & 0o777) !== 0o600) {
  throw new Error("Refusing: task state file must have permissions 600");
}

const state = JSON.parse(
  fs.readFileSync(statePath, "utf8")
);

if (state.status !== "PREPARED_NOT_POSTED") {
  throw new Error(`Unexpected task status: ${state.status}`);
}

if (Date.now() >= state.offer.expiresMs) {
  throw new Error("Offer expired — NOTHING POSTED");
}

const { did, tclk } = loadAgentIdentity({ createHandlers });

if (state.agentDid && state.agentDid !== did) {
  throw new Error(
    `Task belongs to ${state.agentDid}, but local identity is ${did}`
  );
}

console.log("Task:");
console.log(`Offer   : ${state.offer.id}`);
console.log(`Amount  : ${state.offer.amount} ${state.offer.asset}`);
console.log(`Contract: ${state.accept.contract}`);
console.log(`Room    : ${state.accept.dealRoom}`);
console.log("");

//
// 1. Publish ACCEPT to tclk-offers.
//
const acceptPost = await tclk.tclk_post_frame({
  room: "tclk-offers",
  line: state.accept.line
});

if (!acceptPost.posted) {
  throw new Error("Accept was not posted");
}

console.log("✅ ACCEPT POSTED");
console.log(`DID : ${acceptPost.did}`);
console.log(`Room: ${acceptPost.room}`);

state.status = "ACCEPT_POSTED";
state.acceptPostedAt = new Date().toISOString();

fs.writeFileSync(
  statePath,
  JSON.stringify(state, null, 2) + "\n",
  { mode: 0o600 }
);

//
// 2. Publish HEARTBEAT to the derived deal room.
//
const heartbeat = tclk.tclk_make_heartbeat({
  from: did,
  contract: state.accept.contract
});

const heartbeatPost = await tclk.tclk_post_frame({
  room: state.accept.dealRoom,
  line: heartbeat.line
});

if (!heartbeatPost.posted) {
  throw new Error(
    "Accept was posted but heartbeat failed — DO NOT rerun blindly"
  );
}

state.status = "ACCEPTED_HEARTBEAT_POSTED";
state.heartbeatPostedAt = new Date().toISOString();
state.heartbeatLine = heartbeat.line;

fs.writeFileSync(
  statePath,
  JSON.stringify(state, null, 2) + "\n",
  { mode: 0o600 }
);

console.log("✅ HEARTBEAT POSTED");
console.log(`Room: ${heartbeatPost.room}`);
console.log("");
console.log("Public participation has started.");
console.log("Secret remains private.");
console.log("Next step: wait for payer LOCK.");
