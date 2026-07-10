"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { atomicWriteFile, atomicWriteJson } = require("../core/atomic-file");
const { relativeToCodeHome } = require("../core/paths");
const { timestampSeconds } = require("../task/runtime");
const {
  ArtifactError,
  appendLegacyRuntimeEvent,
  artifactFile,
  commandOptions,
  expandUserPath,
  oneLine,
  prepareArtifactTask,
  updateArtifactTask,
} = require("./runtime");

const SOURCE_USAGE =
  'usage: codex-workflow source-snapshot <task-id> --source <path-or-url> --used-for "<purpose>" [--authority canonical|advisory|background] [--freshness fresh|stale|unknown]';
const PROMPT_USAGE =
  "usage: codex-workflow prompt-bundle <task-id> --include <path>... [--skill <name>]... [--agent atlas|multica|reviewer|e2e] [--bundle-id <id>]";
const VALID_AUTHORITIES = new Set(["canonical", "advisory", "background"]);
const VALID_FRESHNESS = new Set(["fresh", "stale", "unknown"]);
const VALID_AGENTS = new Set(["atlas", "multica", "reviewer", "e2e"]);

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function parseSourceArgs(argv) {
  if (argv.length === 0) {
    throw new ArtifactError(SOURCE_USAGE);
  }
  const result = {
    authority: "advisory",
    freshness: "unknown",
    sources: [],
    taskId: argv[0],
    usedFor: "",
  };
  const scalar = {
    "--used-for": "usedFor",
    "--authority": "authority",
    "--freshness": "freshness",
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--source") {
      if (index + 1 >= argv.length) {
        throw new ArtifactError(SOURCE_USAGE);
      }
      result.sources.push(argv[++index]);
      continue;
    }
    if (argument.startsWith("--source=")) {
      result.sources.push(argument.slice("--source=".length));
      continue;
    }
    if (Object.hasOwn(scalar, argument)) {
      if (index + 1 >= argv.length) {
        throw new ArtifactError(SOURCE_USAGE);
      }
      result[scalar[argument]] = argv[++index];
      continue;
    }
    const equal = argument.indexOf("=");
    const flag = equal === -1 ? argument : argument.slice(0, equal);
    if (equal !== -1 && Object.hasOwn(scalar, flag)) {
      result[scalar[flag]] = argument.slice(equal + 1);
      continue;
    }
    throw new ArtifactError(SOURCE_USAGE);
  }
  if (result.sources.length === 0) {
    throw new ArtifactError("missing required argument: --source");
  }
  if (!result.usedFor) {
    throw new ArtifactError("missing required argument: --used-for");
  }
  return result;
}

function parsePromptArgs(argv) {
  if (argv.length === 0) {
    throw new ArtifactError(PROMPT_USAGE);
  }
  const result = {
    agent: "atlas",
    bundleId: "",
    includes: [],
    skills: [],
    taskId: argv[0],
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    const collection = argument === "--include" || argument === "--skill";
    if (collection) {
      if (index + 1 >= argv.length) {
        throw new ArtifactError(PROMPT_USAGE);
      }
      result[argument === "--include" ? "includes" : "skills"].push(argv[++index]);
    } else if (argument.startsWith("--include=")) {
      result.includes.push(argument.slice("--include=".length));
    } else if (argument.startsWith("--skill=")) {
      result.skills.push(argument.slice("--skill=".length));
    } else if (argument === "--agent" || argument === "--bundle-id") {
      if (index + 1 >= argv.length) {
        throw new ArtifactError(PROMPT_USAGE);
      }
      result[argument === "--agent" ? "agent" : "bundleId"] = argv[++index];
    } else if (argument.startsWith("--agent=")) {
      result.agent = argument.slice("--agent=".length);
    } else if (argument.startsWith("--bundle-id=")) {
      result.bundleId = argument.slice("--bundle-id=".length);
    } else {
      throw new ArtifactError(PROMPT_USAGE);
    }
  }
  if (result.includes.length === 0) {
    throw new ArtifactError("missing required argument: --include");
  }
  return result;
}

function readJsonLines(file) {
  try {
    return fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line.trim())
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function writeSourceSnapshot(parsed, options = {}) {
  const { clock, cwd, environment, paths } = commandOptions(options);
  const usedFor = oneLine(parsed.usedFor, "used-for", { allowEmpty: false });
  const authority = oneLine(parsed.authority || "advisory", "authority", {
    allowEmpty: false,
  });
  const freshness = oneLine(parsed.freshness || "unknown", "freshness", {
    allowEmpty: false,
  });
  if (!VALID_AUTHORITIES.has(authority)) {
    throw new ArtifactError(`invalid authority: ${authority}`);
  }
  if (!VALID_FRESHNESS.has(freshness)) {
    throw new ArtifactError(`invalid freshness: ${freshness}`);
  }
  const sources = parsed.sources.map((value) =>
    oneLine(value, "source", { allowEmpty: false }),
  );
  prepareArtifactTask(paths, parsed.taskId, clock);
  const recordedAt = timestampSeconds(clock);
  const newRows = sources.map((source) => {
    const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(source)?.[1].toLowerCase();
    const row = {
      task_id: parsed.taskId,
      recorded_at: recordedAt,
      source,
      used_for: usedFor,
      authority,
      freshness,
    };
    if (scheme === "http" || scheme === "https") {
      return { ...row, type: "url", sha256: "-", mtime: "-" };
    }
    const sourceFile = path.resolve(cwd, expandUserPath(source, environment));
    let stats;
    try {
      stats = fs.statSync(sourceFile, { bigint: true });
    } catch {
      throw new ArtifactError(`missing source file: ${source}`);
    }
    if (!stats.isFile()) {
      throw new ArtifactError(`missing source file: ${source}`);
    }
    return {
      ...row,
      type: "file",
      source: sourceFile,
      sha256: sha256(sourceFile),
      mtime: stats.mtimeNs.toString(),
    };
  });

  const sourcesFile = artifactFile(paths, parsed.taskId, "sources.jsonl");
  const provenanceFile = artifactFile(paths, parsed.taskId, "provenance.md");
  fs.mkdirSync(path.dirname(sourcesFile), { recursive: true });
  fs.appendFileSync(
    sourcesFile,
    newRows.map((row) => JSON.stringify(row)).join("\n") + "\n",
    "utf8",
  );
  const tableRows = [
    "| Source | Type | Authority | Freshness | Used For | SHA256 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...readJsonLines(sourcesFile)
      .slice(-50)
      .map((row) => {
        const source = `\`${row.source || "-"}\``.replace(/\|/g, "\\|");
        const purpose = String(row.used_for || "-").replace(/\|/g, "\\|");
        return `| ${source} | ${row.type || "-"} | ${row.authority || "-"} | ${row.freshness || "-"} | ${purpose} | \`${row.sha256 || "-"}\` |`;
      }),
  ];
  const bundleFile = artifactFile(paths, parsed.taskId, "prompt-bundle.json");
  const bundleNote = fs.existsSync(bundleFile)
    ? "Prompt bundle recorded at `prompt-bundle.json`."
    : "No prompt bundle recorded yet.";
  atomicWriteFile(
    provenanceFile,
    [
      "# Provenance",
      "",
      `Updated: ${recordedAt}`,
      `Atlas task: ${parsed.taskId}`,
      "",
      "## Source Snapshots",
      "",
      ...tableRows,
      "",
      "## Prompt Bundle",
      "",
      bundleNote,
      "",
    ].join("\n"),
    { encoding: "utf8" },
  );
  const sourcesRelative = relativeToCodeHome(paths, sourcesFile);
  const provenanceRelative = relativeToCodeHome(paths, provenanceFile);
  updateArtifactTask(
    paths,
    parsed.taskId,
    {
      sources: sourcesRelative,
      provenance: provenanceRelative,
      source_snapshot_count: String(newRows.length),
    },
    {
      "provenance.sources": sourcesRelative,
      "provenance.file": provenanceRelative,
      "provenance.last_source_count": String(newRows.length),
    },
    clock,
  );
  appendLegacyRuntimeEvent(
    paths,
    parsed.taskId,
    "source-snapshot",
    `${newRows.length} source(s): ${usedFor}`,
    clock,
  );
  return [
    `task_id: ${parsed.taskId}`,
    `sources: ${sourcesFile}`,
    `provenance: ${provenanceFile}`,
    `count: ${newRows.length}`,
  ];
}

function writePromptBundle(parsed, options = {}) {
  const { clock, cwd, environment, paths } = commandOptions(options);
  const bundleId = oneLine(
    parsed.bundleId || `${parsed.taskId}-prompt-bundle`,
    "bundle id",
    { allowEmpty: false },
  );
  const agent = oneLine(parsed.agent || "atlas", "agent", { allowEmpty: false });
  if (!VALID_AGENTS.has(agent)) {
    throw new ArtifactError(`invalid agent: ${agent}`);
  }
  const skills = parsed.skills.map((value) =>
    oneLine(value, "skill", { allowEmpty: false }),
  );
  const files = parsed.includes.map((raw) => {
    oneLine(raw, "include", { allowEmpty: false });
    const includeFile = path.resolve(cwd, expandUserPath(raw, environment));
    let stats;
    try {
      stats = fs.statSync(includeFile);
    } catch {
      throw new ArtifactError(`missing include file: ${raw}`);
    }
    if (!stats.isFile()) {
      throw new ArtifactError(`missing include file: ${raw}`);
    }
    return { path: includeFile, sha256: sha256(includeFile), bytes: stats.size };
  });

  prepareArtifactTask(paths, parsed.taskId, clock);
  const recordedAt = timestampSeconds(clock);
  const bundleFile = artifactFile(paths, parsed.taskId, "prompt-bundle.json");
  const provenanceFile = artifactFile(paths, parsed.taskId, "provenance.md");
  atomicWriteJson(bundleFile, {
    bundle_id: bundleId,
    task_id: parsed.taskId,
    recorded_at: recordedAt,
    agent,
    files,
    skills,
  });
  const sourcesFile = artifactFile(paths, parsed.taskId, "sources.jsonl");
  const sourceNote = fs.existsSync(sourcesFile)
    ? "Source snapshots recorded at `sources.jsonl`."
    : "No source snapshots recorded yet.";
  const fileRows = [
    "| Path | SHA256 | Bytes |",
    "| --- | --- | --- |",
    ...files.map((row) => `| \`${row.path}\` | \`${row.sha256}\` | ${row.bytes} |`),
  ];
  const skillRows = skills.length ? skills.map((value) => `- ${value}`) : ["- None recorded."];
  atomicWriteFile(
    provenanceFile,
    [
      "# Provenance",
      "",
      `Updated: ${recordedAt}`,
      `Atlas task: ${parsed.taskId}`,
      "",
      "## Source Snapshots",
      "",
      sourceNote,
      "",
      "## Prompt Bundle",
      "",
      `- Bundle ID: \`${bundleId}\``,
      `- Agent: ${agent}`,
      "- Manifest: `prompt-bundle.json`",
      "",
      "### Included Files",
      "",
      ...fileRows,
      "",
      "### Skills",
      "",
      ...skillRows,
      "",
    ].join("\n"),
    { encoding: "utf8" },
  );
  const bundleRelative = relativeToCodeHome(paths, bundleFile);
  const provenanceRelative = relativeToCodeHome(paths, provenanceFile);
  updateArtifactTask(
    paths,
    parsed.taskId,
    {
      prompt_bundle: bundleRelative,
      provenance: provenanceRelative,
      prompt_bundle_id: bundleId,
    },
    {
      "provenance.prompt_bundle": bundleRelative,
      "provenance.file": provenanceRelative,
      "provenance.prompt_bundle_id": bundleId,
      "provenance.prompt_agent": agent,
    },
    clock,
  );
  appendLegacyRuntimeEvent(
    paths,
    parsed.taskId,
    "prompt-bundle",
    `${bundleId} for ${agent}`,
    clock,
  );
  return [
    `task_id: ${parsed.taskId}`,
    `bundle: ${bundleFile}`,
    `provenance: ${provenanceFile}`,
    `bundle_id: ${bundleId}`,
    `agent: ${agent}`,
    `files: ${files.length}`,
    `skills: ${skills.length}`,
  ];
}

module.exports = {
  PROMPT_USAGE,
  SOURCE_USAGE,
  VALID_AGENTS,
  VALID_AUTHORITIES,
  VALID_FRESHNESS,
  parsePromptArgs,
  parseSourceArgs,
  readJsonLines,
  sha256,
  writePromptBundle,
  writeSourceSnapshot,
};
