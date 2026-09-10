import { createHandlers } from "@flop-labs/tclk-mcp";
import { loadAgentIdentity } from "./lib/identity.mjs";

const technocoreUrl =
  process.env.TECHNOCORE_URL ?? "http://127.0.0.1:8000";

const { did, tclk } = loadAgentIdentity({
  createHandlers,
  technocoreUrl
});

const who = tclk.tclk_whoami();

console.log("✅ FLOP Agent identity verified");
console.log(`DID:   ${did}`);
console.log(`Venue: ${who.technocoreUrl ?? technocoreUrl}`);

const offers = await tclk.tclk_read_room({
  room: "tclk-offers"
});

console.log("");
console.log("TCLK offer board");
console.log(`Frames:    ${offers.frames?.length ?? 0}`);
console.log(`Skipped:   ${offers.skipped ?? 0}`);
console.log(`Last seq:  ${offers.lastSeq ?? "none"}`);
