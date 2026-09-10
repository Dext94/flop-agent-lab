import {
  findJobSpecPath
} from "./job-spec.mjs";

const REVIEW_ONLY_SIGNALS = new Set([
  "INCOMPLETE_SPEC",
  "MISSING_CONTEXT"
]);

export function analyzeJobRisk(
  frame,
  { specText = null } = {}
) {
  const context =
    typeof frame?.job?.context === "string"
      ? frame.job.context
      : "";

  const untrustedSpecText =
    typeof specText === "string"
      ? specText
      : "";

  //
  // Both inputs are untrusted data.
  // They are inspected as text only and never executed.
  //
  const combinedText = [
    context,
    untrustedSpecText
  ]
    .filter(Boolean)
    .join("\n");

  const signals = [];

  const specPath =
    findJobSpecPath(context);

  if (
    !context.trim() &&
    !untrustedSpecText
  ) {
    signals.push("MISSING_CONTEXT");
  }

  if (
    specPath &&
    !untrustedSpecText
  ) {
    signals.push("INCOMPLETE_SPEC");
  }

  //
  // Technocore GET endpoints can perform writes.
  //
  if (
    /\/say(?:-signed)?\//i.test(combinedText) ||
    /\/kv\/[^/\s]+\/[^/\s]+\/set\//i.test(
      combinedText
    )
  ) {
    signals.push("WRITE_ENDPOINT");
  }

  if (
    /\bsigned\s+(?:message|messages|line|lines|write|writes)\b/i.test(
      combinedText
    ) ||
    /\b(?:deliver|send|post|publish|write)\b.{0,100}\bsigned\b/is.test(
      combinedText
    )
  ) {
    signals.push("SIGNED_WRITE");
  }

  if (/\breveal\b/i.test(combinedText)) {
    signals.push("SECRET_REVEAL");
  }

  if (
    /\b(?:claim|buy|sell|bet|stake)\b/i.test(
      combinedText
    )
  ) {
    signals.push("EXTERNAL_ACTION");
  }

  if (
    /\bget\s+https?:\/\/technocore\.chat\/r\/[^\s]+\/say(?:-signed)?\//i.test(
      combinedText
    )
  ) {
    signals.push("GET_IS_WRITE");
  }

  const uniqueSignals =
    [...new Set(signals)];

  const actionSignals =
    uniqueSignals.filter(
      (signal) =>
        !REVIEW_ONLY_SIGNALS.has(signal)
    );

  const reviewSignals =
    uniqueSignals.filter(
      (signal) =>
        REVIEW_ONLY_SIGNALS.has(signal)
    );

  let level;

  if (actionSignals.length > 0) {
    level = "MANUAL_ONLY";
  } else if (reviewSignals.length > 0) {
    level = "NEEDS_SPEC_REVIEW";
  } else {
    level = "READ_ONLY_CANDIDATE";
  }

  return {
    level,
    autoEligible: false,
    signals: uniqueSignals,

    note:
      level === "MANUAL_ONLY"
        ? "Task requests or references an action that must never be executed automatically."
        : level === "NEEDS_SPEC_REVIEW"
          ? "Insufficient trusted context for classification; inspect the full untrusted spec first."
          : "No obvious write/action instruction detected; content remains untrusted."
  };
}
