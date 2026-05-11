import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { repairInstalledPluginCacheManifests } from "../scripts/update-codex-plugin.mjs";

function tempRoot() {
  return mkdtempSync(join(tmpdir(), "update-codex-plugin-test-"));
}

test("repairInstalledPluginCacheManifests adds root manifests for legacy cache entries", () => {
  const root = tempRoot();
  try {
    const cacheEntry = join(root, "plugins/cache/local-atlas/paseo-agent-guard-plugin/local");
    const scaffoldManifest = join(cacheEntry, ".codex-plugin/plugin.json");
    const runtimeManifest = join(cacheEntry, "plugin.json");
    const manifest = {
      name: "paseo-agent-guard-plugin",
      version: "0.1.0",
      skills: "./skills/"
    };
    mkdirSync(join(cacheEntry, ".codex-plugin"), { recursive: true });
    writeFileSync(scaffoldManifest, `${JSON.stringify(manifest, null, 2)}\n`);

    assert.deepEqual(repairInstalledPluginCacheManifests(root, "paseo-agent-guard-plugin"), [runtimeManifest]);
    assert.deepEqual(JSON.parse(readFileSync(runtimeManifest, "utf8")), manifest);
    assert.deepEqual(repairInstalledPluginCacheManifests(root, "paseo-agent-guard-plugin"), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
