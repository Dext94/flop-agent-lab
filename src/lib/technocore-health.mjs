const DEFAULT_BASE = "https://technocore.chat";

function safeInt(value) {
  return Number.isSafeInteger(value) ? value : null;
}

async function fetchJson(base, pathname) {
  const url = new URL(pathname, base);

  url.searchParams.set(
    "cb",
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "application/json"
    },
    signal: AbortSignal.timeout(7000)
  });

  if (!response.ok) {
    throw new Error(
      `${pathname}: HTTP ${response.status}`
    );
  }

  return response.json();
}

async function attempt(base, pathname) {
  try {
    return {
      ok: true,
      data: await fetchJson(base, pathname),
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      data: null,
      error: error instanceof Error
        ? error.message
        : String(error)
    };
  }
}

export async function checkTechnocoreHealth({
  base = process.env.TECHNOCORE_URL ?? DEFAULT_BASE
} = {}) {
  const checkedAt = new Date().toISOString();

  const [agent, config, rooms] =
    await Promise.all([
      attempt(base, "/.well-known/agent.json"),
      attempt(base, "/config"),
      attempt(base, "/rooms?format=json&limit=1")
    ]);

  const allOk =
    agent.ok &&
    config.ok &&
    rooms.ok;

  const agentVersion =
    agent.data?.version ?? null;

  const configVersion =
    config.data?.version ?? null;

  const maxRooms =
    safeInt(config.data?.settings?.max_rooms) ??
    safeInt(agent.data?.limits?.rooms) ??
    safeInt(rooms.data?.capacity);

  const publicRooms =
    safeInt(rooms.data?.total);

  const newRoomsPerDayPerIp =
    safeInt(
      config.data?.settings?.rate_rooms_per_day
    ) ??
    safeInt(
      agent.data?.limits?.new_rooms_per_day_per_ip
    );

  const retentionSeconds =
    safeInt(agent.data?.limits?.retention_seconds);

  const stillbornSeconds =
    safeInt(config.data?.settings?.stillborn_seconds);

  const ephemeralTtlSeconds =
    safeInt(
      config.data?.settings?.ephemeral_ttl_seconds
    ) ??
    safeInt(
      agent.data?.limits?.ephemeral_ttl_seconds
    );

  const definitelyAtCapacity =
    publicRooms !== null &&
    maxRooms !== null &&
    publicRooms >= maxRooms;

  //
  // /rooms enumerates public/listable rooms only.
  // Private/unlisted rooms also count toward max_rooms.
  //
  // Therefore:
  // - publicRooms >= maxRooms proves saturation.
  // - publicRooms < maxRooms does NOT prove room creation is available.
  //
  let execution;

  if (!allOk) {
    execution = "UNKNOWN";
  } else if (definitelyAtCapacity) {
    execution = "BLOCKED";
  } else {
    execution = "UNKNOWN";
  }

  const radar =
    allOk
      ? "HEALTHY"
      : "DEGRADED";

  const warnings = [];

  if (
    agentVersion &&
    configVersion &&
    agentVersion !== configVersion
  ) {
    warnings.push(
      `Version mismatch: agent=${agentVersion}, config=${configVersion}`
    );
  }

  if (
    safeInt(agent.data?.limits?.rooms) !== null &&
    safeInt(config.data?.settings?.max_rooms) !== null &&
    agent.data.limits.rooms !==
      config.data.settings.max_rooms
  ) {
    warnings.push(
      "Room capacity differs between discovery and config"
    );
  }

  if (!allOk) {
    for (const [name, result] of [
      ["agent", agent],
      ["config", config],
      ["rooms", rooms]
    ]) {
      if (!result.ok) {
        warnings.push(`${name}: ${result.error}`);
      }
    }
  }

  if (
    execution === "UNKNOWN" &&
    allOk
  ) {
    warnings.push(
      "Read-only telemetry cannot prove private-room creation capacity"
    );
  }

  return {
    checkedAt,
    base,
    radar,
    execution,

    version:
      configVersion ??
      agentVersion,

    publicRooms,
    maxRooms,
    newRoomsPerDayPerIp,

    retentionSeconds,
    stillbornSeconds,
    ephemeralTtlSeconds,

    endpoints: {
      agent: agent.ok,
      config: config.ok,
      rooms: rooms.ok
    },

    warnings
  };
}

export function formatTechnocoreHealth(health) {
  const lines = [
    `Venue       : ${health.base}`,
    `Version     : ${health.version ?? "unknown"}`,
    `RADAR       : ${health.radar}`,
    `EXECUTION   : ${health.execution}`,
    `Public rooms: ${health.publicRooms ?? "unknown"} (listable only)`,
    `Room cap    : ${health.maxRooms ?? "unknown"} (service-wide)`,
    `New rooms/IP: ${
      health.newRoomsPerDayPerIp ?? "unknown"
    } / day`
  ];

  if (health.stillbornSeconds !== null) {
    lines.push(
      `Stillborn   : ${health.stillbornSeconds}s`
    );
  }

  if (health.ephemeralTtlSeconds !== null) {
    lines.push(
      `Ephemeral   : ${health.ephemeralTtlSeconds}s`
    );
  }

  for (const warning of health.warnings) {
    lines.push(`Warning     : ${warning}`);
  }

  return lines.join("\n");
}
