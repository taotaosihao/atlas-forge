"use strict";

const OPERATIONAL_CLASSES = new Set([
  "quota_exhausted",
  "rate_limited",
  "provider_unavailable",
  "model_unavailable",
  "mode_unavailable",
  "authentication_failed",
  "cli_unavailable",
  "daemon_unavailable",
  "runtime_crashed",
  "timeout_no_useful_output",
]);

const TRUSTED_SOURCES = new Set([
  "paseo-cli",
  "paseo-daemon",
  "provider",
  "adapter-watchdog",
]);

const TRUSTED_CHANNELS = new Set(["control", "runtime"]);
const TRUSTED_SOURCE_CHANNELS = new Set([
  "paseo-cli:control",
  "paseo-daemon:control",
  "paseo-daemon:runtime",
  "provider:runtime",
  "adapter-watchdog:runtime",
]);

function oneLine(value) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function structuredCode(envelope) {
  return oneLine(envelope.code).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function classifyPaseoObservation(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return { failureClass: "unknown", retryable: false, retryAfterMs: null };
  }
  if (!TRUSTED_SOURCES.has(envelope.source) || !TRUSTED_CHANNELS.has(envelope.channel)
    || !TRUSTED_SOURCE_CHANNELS.has(`${envelope.source}:${envelope.channel}`)) {
    return { failureClass: "unknown", retryable: false, retryAfterMs: null };
  }

  const code = structuredCode(envelope);
  const rawMessage = oneLine(envelope.message).toLowerCase();
  const httpStatus = Number(envelope.http_status || 0);
  const hasRetryAfter = envelope.retry_after_ms !== null
    && envelope.retry_after_ms !== undefined
    && envelope.retry_after_ms !== "";
  const retryAfter = hasRetryAfter ? Number(envelope.retry_after_ms) : Number.NaN;
  const retryAfterMs = Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null;
  const status = oneLine(envelope.status).toLowerCase();
  const hasFailureSignal = Number(envelope.exit_code) !== 0
    || /^(error|failed|unavailable|crashed|timeout)$/.test(status)
    || Boolean(code)
    || httpStatus >= 400;
  if (!hasFailureSignal) {
    return { failureClass: "unknown", retryable: false, retryAfterMs: null };
  }
  if (/REQUEST_CHANGES|TEST_FAILED|LINT_FAILED|CODE_BUG|SEMANTIC|SCOPE_CONFLICT|AUTHORITY_CONFLICT|CLAUDE_MODEL_SELECTION_REQUIRED|MODEL_FAMILY_UNVERIFIED/.test(code)) {
    return { failureClass: "unknown", retryable: false, retryAfterMs: null };
  }
  const message = Number(envelope.exit_code) !== 0 || Boolean(code) || httpStatus >= 400
    ? rawMessage
    : "";

  let failureClass = "unknown";
  if (/QUOTA|CREDIT|INSUFFICIENT_BALANCE/.test(code)
    || /quota|credits? exhausted|insufficient balance/.test(message)) {
    failureClass = "quota_exhausted";
  } else if (httpStatus === 429 || /RATE_LIMIT|TOO_MANY_REQUESTS/.test(code)
    || /rate limit|too many requests/.test(message)) {
    failureClass = "rate_limited";
  } else if (/MODEL.*(UNAVAILABLE|NOT_FOUND)|UNKNOWN_MODEL/.test(code)
    || /model (?:is )?(?:unavailable|not found|disabled)|unknown model/.test(message)) {
    failureClass = "model_unavailable";
  } else if (/MODE.*(UNAVAILABLE|NOT_FOUND)|UNKNOWN_MODE/.test(code)
    || /mode (?:is )?(?:unavailable|not found)|unknown mode/.test(message)) {
    failureClass = "mode_unavailable";
  } else if (/(^AUTH(?:ENTICATION)?(?:_|$))|UNAUTHORIZED|FORBIDDEN|CREDENTIAL/.test(code)
    || /authentication|unauthorized|invalid (?:token|credential)|permission denied/.test(message)) {
    failureClass = "authentication_failed";
  } else if (/DAEMON.*(UNAVAILABLE|CONNECTION)|CONNECTION_REFUSED/.test(code)
    || /daemon.*(?:unavailable|not responding)|connection refused/.test(message)) {
    failureClass = "daemon_unavailable";
  } else if (/CLI.*(UNAVAILABLE|NOT_FOUND)|ENOENT/.test(code)
    || /paseo.*(?:not found|cannot execute)|cli unavailable/.test(message)) {
    failureClass = "cli_unavailable";
  } else if (/PROVIDER.*(UNAVAILABLE|DISABLED)|SERVICE_UNAVAILABLE/.test(code)
    || /provider.*(?:unavailable|disabled)|service unavailable|gateway unavailable/.test(message)) {
    failureClass = "provider_unavailable";
  } else if (/TIMEOUT|NO_USEFUL_OUTPUT/.test(code)
    || /timed? out|no useful output/.test(message)) {
    failureClass = "timeout_no_useful_output";
  } else if (/CRASH|PROCESS_EXIT|RUNTIME_FAILED/.test(code)
    || /runtime crash|process (?:exited|terminated) unexpectedly/.test(message)) {
    failureClass = "runtime_crashed";
  }

  return {
    failureClass,
    retryable: failureClass === "rate_limited" && retryAfterMs !== null,
    retryAfterMs,
  };
}

module.exports = {
  OPERATIONAL_CLASSES,
  TRUSTED_CHANNELS,
  TRUSTED_SOURCE_CHANNELS,
  TRUSTED_SOURCES,
  classifyPaseoObservation,
};
