"use strict";

const LIMITS = Object.freeze({
  max_pixels: 16_777_216,
  max_png_bytes: 16_777_216,
  max_raw_bytes: 4_194_304,
  max_canonical_bytes: 4_194_304,
  max_adapter_stdout_bytes: 1_048_576,
  max_response_bytes: 33_554_432,
  max_capture_count: 12,
  max_network_events: 256,
  max_console_events: 256,
  max_lifecycle_events: 256,
  max_evidence_refs: 25,
  max_temp_files: 128,
  max_temp_bytes: 134_217_728,
  max_worker_stdout_bytes: 1_048_576,
  max_worker_stderr_bytes: 1_048_576,
});

function boundedCounter(limit, code) {
  let count = 0;
  return Object.freeze({
    add(amount = 1) {
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`${code}_INVALID_INCREMENT`);
      count += amount;
      if (count > limit) throw new Error(code);
      return count;
    },
    value: () => count,
  });
}

function enforceByteLength(value, limit, code) {
  const length = Buffer.isBuffer(value) ? value.length : Buffer.byteLength(value);
  if (length > limit) throw new Error(code);
  return length;
}

function enforceLimitValue(value, limit, code) {
  if (!Number.isSafeInteger(value) || value < 0 || value > limit) throw new Error(code);
  return value;
}

module.exports = { LIMITS, boundedCounter, enforceByteLength, enforceLimitValue };
