import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function loadAgentIdentity({
  createHandlers,
  technocoreUrl = process.env.TECHNOCORE_URL ?? "https://technocore.chat"
} = {}) {
  if (typeof createHandlers !== "function") {
    throw new Error("createHandlers implementation is required");
  }

  const identityPath = path.join(
    os.homedir(),
    ".config",
    "flop",
    "agent-identity.txt"
  );

  const stat = fs.statSync(identityPath);

  if ((stat.mode & 0o777) !== 0o600) {
    throw new Error(
      `Unsafe permissions on ${identityPath}; expected 600`
    );
  }

  const raw = fs.readFileSync(identityPath, "utf8");

  const match = raw.match(
    /^seed:\s+([0-9a-fA-F]{64})$/m
  );

  if (!match) {
    throw new Error("Agent seed missing or malformed");
  }

  const tclk = createHandlers({
    env: {
      TECHNOCORE_URL: technocoreUrl,
      TECHNOCORE_SIGNING_KEY: match[1]
    }
  });

  const who = tclk.tclk_whoami();

  if (!who?.did?.startsWith("did:key:")) {
    throw new Error("Could not derive agent DID");
  }

  return {
    did: who.did,
    tclk,
    technocoreUrl
  };
}
