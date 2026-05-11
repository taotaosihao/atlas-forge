import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";

import {
  repairInstalledPluginCacheManifests,
  updateCodexPlugin,
  UpdateError
} from "../scripts/update-codex-plugin.mjs";

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

test("updateCodexPlugin retries once after missing plugin cache manifest failures", () => {
  const root = tempRoot();
  try {
    let calls = 0;
    const result = updateCodexPlugin(
      {
        marketplace: "atlas-forge",
        plugin: "paseo-agent-guard-plugin",
        codexHome: root
      },
      (command, args, options) => {
        calls += 1;
        assert.equal(command, "codex");
        assert.deepEqual(args, ["plugin", "marketplace", "upgrade", "atlas-forge"]);
        assert.equal(options.cwd, process.cwd());
        assert.notEqual(basename(options.cwd), "");
        if (calls === 1) {
          throw new UpdateError(
            "codex_failed: failed to read plugin version for paseo-agent-guard-plugin@atlas-forge: missing plugin.json",
            "command_failed"
          );
        }
        return { status: 0, stdout: "", stderr: "" };
      }
    );

    assert.equal(calls, 2);
    assert.equal(result.status, "updated");
    assert.deepEqual(result.repairedCacheManifests, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
