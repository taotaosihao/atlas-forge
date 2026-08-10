"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const {
  StableFileError,
  stableFileSnapshot,
  stableJsonSnapshot,
} = require(path.join(ROOT, "workflow/bin/lib/codex-workflow/core/stable-file"));

function rawDigest(buffer) {
  return `sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`;
}

test("stable snapshots use fatal UTF-8, strip one BOM, and digest the original bytes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-stable-file."));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const textFile = path.join(root, "contract.md");
  const textBytes = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from("contract_semantics_version: 5\n", "utf8"),
  ]);
  fs.writeFileSync(textFile, textBytes);
  const text = stableFileSnapshot(textFile, "contract", { root });
  assert.equal(text.text, "contract_semantics_version: 5\n");
  assert.equal(text.sha256, rawDigest(textBytes));
  assert.deepEqual(text.buffer, textBytes);

  const jsonFile = path.join(root, "brief.json");
  const jsonBytes = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from('{"schema_version":4}\n', "utf8"),
  ]);
  fs.writeFileSync(jsonFile, jsonBytes);
  const json = stableJsonSnapshot(jsonFile, "brief", { root });
  assert.deepEqual(json.value, { schema_version: 4 });
  assert.equal(json.sha256, rawDigest(jsonBytes));

  const invalidFile = path.join(root, "invalid.md");
  fs.writeFileSync(invalidFile, Buffer.from([0x61, 0x80, 0x62]));
  assert.throws(
    () => stableFileSnapshot(invalidFile, "contract", { root }),
    (error) => error instanceof StableFileError && /not readable UTF-8/.test(error.message),
  );
});
