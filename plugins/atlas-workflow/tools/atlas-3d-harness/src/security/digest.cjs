"use strict";
const crypto = require("crypto");
const fs = require("fs");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileDigest = (file) => sha256(fs.readFileSync(file));
const stableJson = (value) => `${JSON.stringify(value, Object.keys(value).sort())}\n`;
function captureBindingId(parts) {
  const framed = parts.map((part) => { const bytes = Buffer.from(String(part)); return Buffer.concat([Buffer.from(`${bytes.length}:`), bytes]); });
  return sha256(Buffer.concat(framed));
}
module.exports = { captureBindingId, fileDigest, sha256, stableJson };
