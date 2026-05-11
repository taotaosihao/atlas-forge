#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync
} from "node:fs";
import { homedir } from "node:os";
import {
  dirname,
  join,
  resolve
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_MARKETPLACE = "atlas-forge";
const DEFAULT_PLUGIN = "paseo-agent-guard-plugin";

class UpdateError extends Error {
  constructor(message, code = "plugin_update_error") {
    super(message);
    this.name = "UpdateError";
    this.code = code;
  }
}

function expandHome(pathValue) {
  if (!pathValue || typeof pathValue !== "string") {
    return pathValue;
  }
  if (pathValue === "~") {
    return homedir();
  }
  if (pathValue.startsWith("~/")) {
    return join(homedir(), pathValue.slice(2));
  }
  return pathValue;
}

function parseCliArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function repoRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) {
    throw new UpdateError(`${command}_error: ${result.error.message}`, "command_error");
  }
  if (result.status !== 0) {
    throw new UpdateError(
      `${command}_failed: ${command} ${args.join(" ")}\n${result.stderr || result.stdout}`,
      "command_failed"
    );
  }
  return result;
}

function usage() {
  return [
    "Usage:",
    "  npm run plugin:update",
    "",
    "Environment overrides:",
    "  CODEX_PLUGIN_MARKETPLACE=atlas-forge",
    "  CODEX_PLUGIN_NAME=paseo-agent-guard-plugin"
  ].join("\n");
}

export function buildOptions(argv = process.argv.slice(2), env = process.env) {
  const args = parseCliArgs(argv);
  return {
    marketplace: args.marketplace || env.CODEX_PLUGIN_MARKETPLACE || DEFAULT_MARKETPLACE,
    plugin: args.plugin || env.CODEX_PLUGIN_NAME || DEFAULT_PLUGIN,
    codexHome: resolve(expandHome(args["codex-home"] || env.CODEX_HOME || "~/.codex")),
    help: Boolean(args.help)
  };
}

function validatePluginManifest(root, plugin) {
  const pluginRoot = join(root, "plugins", plugin);
  const runtimeManifestPath = join(pluginRoot, "plugin.json");
  const scaffoldManifestPath = join(pluginRoot, ".codex-plugin/plugin.json");
  for (const manifestPath of [runtimeManifestPath, scaffoldManifestPath]) {
    if (!existsSync(manifestPath)) {
      throw new UpdateError(`plugin_manifest_missing: ${manifestPath}`, "plugin_manifest_missing");
    }
  }

  const manifest = loadJson(runtimeManifestPath);
  if (manifest.name !== plugin) {
    throw new UpdateError(
      `plugin_name_mismatch: expected ${plugin}, got ${manifest.name}`,
      "plugin_name_mismatch"
    );
  }
  const scaffoldManifest = loadJson(scaffoldManifestPath);
  if (JSON.stringify(scaffoldManifest) !== JSON.stringify(manifest)) {
    throw new UpdateError(
      `plugin_manifest_mismatch: ${runtimeManifestPath} differs from ${scaffoldManifestPath}`,
      "plugin_manifest_mismatch"
    );
  }
}

function validateMarketplaceManifest(root, marketplace, plugin) {
  const marketplacePath = join(root, ".agents/plugins/marketplace.json");
  if (!existsSync(marketplacePath)) {
    throw new UpdateError(`marketplace_manifest_missing: ${marketplacePath}`, "marketplace_manifest_missing");
  }
  const manifest = loadJson(marketplacePath);
  if (manifest.name !== marketplace) {
    throw new UpdateError(
      `marketplace_name_mismatch: expected ${marketplace}, got ${manifest.name}`,
      "marketplace_name_mismatch"
    );
  }
  const entry = (manifest.plugins || []).find((candidate) => candidate.name === plugin);
  if (!entry) {
    throw new UpdateError(`marketplace_plugin_missing: ${plugin}`, "marketplace_plugin_missing");
  }
  const expectedPath = `./plugins/${plugin}`;
  if (entry.source?.path !== expectedPath) {
    throw new UpdateError(
      `marketplace_plugin_path_mismatch: expected ${expectedPath}, got ${entry.source?.path}`,
      "marketplace_plugin_path_mismatch"
    );
  }
}

export function updateCodexPlugin(options = buildOptions()) {
  const root = repoRoot();
  validatePluginManifest(root, options.plugin);
  validateMarketplaceManifest(root, options.marketplace, options.plugin);

  run("codex", ["plugin", "marketplace", "upgrade", options.marketplace], { cwd: root });

  return {
    status: "updated",
    updateMethod: "codex_marketplace_upgrade",
    marketplace: options.marketplace,
    plugin: options.plugin,
    source: root,
    codexHome: options.codexHome
  };
}

export function main(argv = process.argv.slice(2)) {
  const options = buildOptions(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  process.stdout.write(`${JSON.stringify(updateCodexPlugin(options), null, 2)}\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    const status = error instanceof UpdateError ? error.code : "error";
    process.stderr.write(`${status}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
