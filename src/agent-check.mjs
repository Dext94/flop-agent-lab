import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createHandlers } from "@flop-labs/tclk-mcp";

const EXPECTED_DID =
  "did:key:z6Mkt6jAezZ7WyPyN1bTXX63ps4vn8MSvNwtfA9JFgsqeFTB";

const identityPath = path.join(
  os.homedir(),
  ".config",
  "flop",
  "agent-identity.txt"
);

const identity = fs.readFileSync(identityPath, "utf8");

const seedMatch = identity.match(/^seed:\s+([0-9a-fA-F]{64})$/m);

if (!seedMatch) {
  throw new Error("Agent seed not found or malformed");
}

const seed = seedMatch[1];

const technocoreUrl =
  process.env.TECHNOCORE_URL ?? "http://127.0.0.1:8000";

const tclk = createHandlers({
  env: {
    TECHNOCORE_SIGNING_KEY: seed,
    TECHNOCORE_URL: technocoreUrl
  }
});

const who = tclk.tclk_whoami();

if (who.did !== EXPECTED_DID) {
  throw new Error(
    `Unexpected DID. Expected ${EXPECTED_DID}, got ${who.did}`
  );
}

console.log("✅ FLOP Agent identity verified");
console.log(`DID:   ${who.did}`);
console.log(`Venue: ${who.technocoreUrl}`);

const offers = await tclk.tclk_read_room({
  room: "tclk-offers"
});

console.log("");
console.log("TCLK offer board");
console.log(`Records:   ${offers.count}`);

if ("malformed" in offers) {
  console.log(`Malformed: ${offers.malformed.length}`);
}

console.log(`Last seq:  ${offers.lastSeq ?? "none"}`);
