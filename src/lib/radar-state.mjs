import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function defaultStatePath() {
  const base =
    process.env.XDG_STATE_HOME ??
    path.join(os.homedir(), ".local", "state");

  return path.join(
    base,
    "flop-agent-lab",
    "radar-v2.json"
  );
}

export function radarStatePath() {
  return (
    process.env.FLOP_RADAR_STATE_PATH ??
    defaultStatePath()
  );
}

export function loadRadarState() {
  const statePath = radarStatePath();

  if (!fs.existsSync(statePath)) {
    return {
      version: 1,
      lastSeq: 0,
      updatedAt: null
    };
  }

  const raw = fs.readFileSync(statePath, "utf8");
  const state = JSON.parse(raw);

  if (
    state.version !== 1 ||
    !Number.isSafeInteger(state.lastSeq) ||
    state.lastSeq < 0
  ) {
    throw new Error("Radar state is malformed");
  }

  return state;
}

export function saveRadarState(lastSeq) {
  if (
    !Number.isSafeInteger(lastSeq) ||
    lastSeq < 0
  ) {
    throw new Error("Invalid radar cursor");
  }

  const statePath = radarStatePath();
  const dir = path.dirname(statePath);

  fs.mkdirSync(dir, {
    recursive: true,
    mode: 0o700
  });

  const state = {
    version: 1,
    lastSeq,
    updatedAt: new Date().toISOString()
  };

  const tmp =
    `${statePath}.${process.pid}.${Date.now()}.tmp`;

  const fd = fs.openSync(
    tmp,
    "wx",
    0o600
  );

  try {
    fs.writeFileSync(
      fd,
      JSON.stringify(state, null, 2) + "\n"
    );

    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  fs.renameSync(tmp, statePath);

  const dirFd = fs.openSync(dir, "r");

  try {
    fs.fsyncSync(dirFd);
  } finally {
    fs.closeSync(dirFd);
  }

  return state;
}
