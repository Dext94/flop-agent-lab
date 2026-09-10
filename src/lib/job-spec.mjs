const DEFAULT_BASE = "https://technocore.chat";
const MAX_SPEC_CHARS = 16_000;

const EXACT_JOB_SPEC_RE =
  /^\/kv\/(tclk-job(?:-[a-z0-9_-]+)?)\/([a-z0-9][a-z0-9_-]{0,127})\/?$/i;

const EMBEDDED_JOB_SPEC_RE =
  /(?:^|[\s(])(?<path>\/kv\/tclk-job(?:-[a-z0-9_-]+)?\/[a-z0-9][a-z0-9_-]{0,127})(?=$|[\s),.;|])/i;

export function extractJobSpecPath(value) {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(
    EXACT_JOB_SPEC_RE
  );

  if (!match) {
    return null;
  }

  return `/kv/${match[1]}/${match[2]}`;
}

export function findJobSpecPath(context) {
  if (typeof context !== "string") {
    return null;
  }

  const exact = extractJobSpecPath(context);

  if (exact) {
    return exact;
  }

  const match = context.match(
    EMBEDDED_JOB_SPEC_RE
  );

  return match?.groups?.path ?? null;
}

export async function fetchJobSpec({
  path,
  base = process.env.TECHNOCORE_URL ?? DEFAULT_BASE
} = {}) {
  const safePath = extractJobSpecPath(path);

  if (!safePath) {
    throw new Error(
      "Refusing unsafe or unsupported job spec path"
    );
  }

  const baseUrl = new URL(base);

  if (!["https:", "http:"].includes(baseUrl.protocol)) {
    throw new Error("Unsupported Technocore protocol");
  }

  const url = new URL(safePath, baseUrl);

  url.searchParams.set(
    "cb",
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    redirect: "error",
    headers: {
      accept: "text/plain"
    },
    signal: AbortSignal.timeout(7000)
  });

  if (!response.ok) {
    throw new Error(
      `Job spec fetch failed: HTTP ${response.status}`
    );
  }

  const text = await response.text();

  if (text.length > MAX_SPEC_CHARS) {
    throw new Error(
      `Job spec exceeds ${MAX_SPEC_CHARS} characters`
    );
  }

  return {
    path: safePath,
    text
  };
}
