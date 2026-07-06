#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".pnpm-store",
  ".turbo",
  ".next",
  "dist",
  "build",
  "coverage",
]);

const TEXT_EXTENSIONS = new Set([
  "",
  ".bash",
  ".cjs",
  ".conf",
  ".env",
  ".example",
  ".json",
  ".jsonl",
  ".js",
  ".md",
  ".mjs",
  ".sh",
  ".toml",
  ".ts",
  ".txt",
  ".yaml",
  ".yml",
]);

function usage() {
  console.log(`usage: audit-private-paths.js --root <dir> --deny-private-home --allow-list <file> [--fail-on cats] [--report-only cats]

Options:
  --root <dir>              Repository root to scan.
  --deny-private-home       Detect user-specific home paths.
  --allow-list <file>       JSON allowlist. Entries must include path, pattern, categories, and reason.
  --fail-on <cats>          Comma-separated categories that fail on unallowed findings.
  --report-only <cats>      Comma-separated categories to report without failing.
  --format text|json        Output format. Defaults to text.
  --help                    Show this help.

Categories: runtime, instructions, tests, docs, history, other`);
}

function parseArgs(argv) {
  const options = {
    root: null,
    denyPrivateHome: false,
    allowList: null,
    failOn: new Set(),
    reportOnly: new Set(),
    format: "text",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--root") {
      options.root = argv[++i];
    } else if (arg.startsWith("--root=")) {
      options.root = arg.slice("--root=".length);
    } else if (arg === "--deny-private-home") {
      options.denyPrivateHome = true;
    } else if (arg === "--allow-list") {
      options.allowList = argv[++i];
    } else if (arg.startsWith("--allow-list=")) {
      options.allowList = arg.slice("--allow-list=".length);
    } else if (arg === "--fail-on") {
      options.failOn = parseCategories(argv[++i]);
    } else if (arg.startsWith("--fail-on=")) {
      options.failOn = parseCategories(arg.slice("--fail-on=".length));
    } else if (arg === "--report-only") {
      options.reportOnly = parseCategories(argv[++i]);
    } else if (arg.startsWith("--report-only=")) {
      options.reportOnly = parseCategories(arg.slice("--report-only=".length));
    } else if (arg === "--format") {
      options.format = argv[++i];
    } else if (arg.startsWith("--format=")) {
      options.format = arg.slice("--format=".length);
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }

  return options;
}

function parseCategories(value) {
  const categories = new Set();
  if (!value) {
    return categories;
  }
  for (const category of value.split(",")) {
    const trimmed = category.trim();
    if (trimmed) {
      categories.add(trimmed);
    }
  }
  return categories;
}

function validateOptions(options) {
  const validCategories = new Set(["runtime", "instructions", "tests", "docs", "history", "other", "all"]);
  for (const category of [...options.failOn, ...options.reportOnly]) {
    if (!validCategories.has(category)) {
      throw new Error(`invalid category: ${category}`);
    }
  }
  if (options.format !== "text" && options.format !== "json") {
    throw new Error(`invalid format: ${options.format}`);
  }
  if (!options.root) {
    throw new Error("--root is required");
  }
  if (!options.denyPrivateHome) {
    throw new Error("--deny-private-home is required for this audit");
  }
  if (!options.allowList) {
    throw new Error("--allow-list is required");
  }
}

function loadAllowList(file, root) {
  const absolute = path.resolve(root, file);
  if (!fs.existsSync(absolute)) {
    return [];
  }
  const parsed = JSON.parse(fs.readFileSync(absolute, "utf8"));
  const entries = Array.isArray(parsed) ? parsed : parsed.allow || parsed.allowlist || parsed.entries;
  if (!Array.isArray(entries)) {
    throw new Error(`allowlist must be an array or contain an entries array: ${file}`);
  }
  return entries.map((entry, index) => validateAllowEntry(entry, index));
}

function validateAllowEntry(entry, index) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`allowlist entry ${index} must be an object`);
  }
  for (const key of ["path", "pattern", "categories", "reason"]) {
    if (!(key in entry)) {
      throw new Error(`allowlist entry ${index} missing ${key}`);
    }
  }
  if (typeof entry.path !== "string" || entry.path.length === 0) {
    throw new Error(`allowlist entry ${index} path must be a non-empty string`);
  }
  if (typeof entry.pattern !== "string" || entry.pattern.length === 0) {
    throw new Error(`allowlist entry ${index} pattern must be a non-empty string`);
  }
  if (!Array.isArray(entry.categories) || entry.categories.length === 0) {
    throw new Error(`allowlist entry ${index} categories must be a non-empty array`);
  }
  if (typeof entry.reason !== "string" || entry.reason.trim().length === 0) {
    throw new Error(`allowlist entry ${index} reason must be a non-empty string`);
  }
  return {
    path: entry.path,
    pattern: entry.pattern,
    categories: new Set(entry.categories),
    reason: entry.reason,
  };
}

function listFiles(root) {
  const result = [];
  walk(root, root, result);
  return result;
}

function walk(root, current, result) {
  const entries = fs.readdirSync(current, { withFileTypes: true });
  for (const entry of entries) {
    if (DEFAULT_SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      walk(root, absolute, result);
    } else if (entry.isFile() && isLikelyText(absolute)) {
      result.push(absolute);
    }
  }
}

function isLikelyText(file) {
  if (TEXT_EXTENSIONS.has(path.extname(file))) {
    return true;
  }
  const base = path.basename(file);
  return base === "README" || base === "LICENSE" || base.includes("instructions");
}

function classify(relativePath) {
  const normalized = toPosix(relativePath);
  if (
    normalized.startsWith("plugins/atlas-workflow/skills/") ||
    normalized.startsWith("plugins/multica-sdlc/instructions/") ||
    normalized.startsWith("plugins/multica-sdlc/generated/") ||
    normalized.startsWith(".agents/multica-sdlc/instructions/") ||
    normalized.startsWith(".agents/multica-sdlc/generated/") ||
    normalized.startsWith(".agents/skills/") ||
    normalized.endsWith("/SKILL.md")
  ) {
    return "instructions";
  }
  if (
    normalized.startsWith("workflow/bin/") ||
    normalized.startsWith("scripts/") ||
    normalized.startsWith("plugins/atlas-workflow/scripts/") ||
    normalized.startsWith("plugins/multica-sdlc/scripts/") ||
    normalized.startsWith(".agents/bin/")
  ) {
    return "runtime";
  }
  if (
    normalized.startsWith("workflow/tests/") ||
    normalized.startsWith("test/") ||
    normalized.startsWith("tests/") ||
    normalized.includes("/fixtures/")
  ) {
    return "tests";
  }
  if (
    normalized === "README.md" ||
    normalized.startsWith("docs/") ||
    normalized.startsWith("plugins/multica-sdlc/docs/")
  ) {
    return "docs";
  }
  if (
    normalized.startsWith("workflow/artifacts/") ||
    normalized.startsWith(".agents/multica-sdlc/") ||
    normalized.includes("history") ||
    normalized.includes("archive")
  ) {
    return "history";
  }
  return "other";
}

function findPrivatePaths(text) {
  const patterns = [
    /\/home\/gewu(?:\/[A-Za-z0-9._~+@:%=-]+)*/g,
    /\/Users\/(?!Shared\b)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._~+@:%=-]+)*/g,
    /C:\\Users\\[A-Za-z0-9._-]+(?:\\[A-Za-z0-9._~+@:%=-]+)*/g,
  ];
  const matches = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      matches.push({ value: match[0], index: match.index || 0 });
    }
  }
  return matches;
}

function lineAndColumn(text, index) {
  const prefix = text.slice(0, index);
  const lines = prefix.split(/\n/);
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

function isAllowed(finding, allowList) {
  return allowList.some((entry) => {
    if (!categoryMatches(entry.categories, finding.category)) {
      return false;
    }
    if (!pathMatches(entry.path, finding.path)) {
      return false;
    }
    return finding.match.includes(entry.pattern) || new RegExp(entry.pattern).test(finding.match);
  });
}

function categoryMatches(categories, category) {
  return categories.has("all") || categories.has(category);
}

function pathMatches(pattern, relativePath) {
  if (pattern === "*" || pattern === relativePath) {
    return true;
  }
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
  }
  if (pattern.includes("*")) {
    const escaped = pattern.split("*").map(escapeRegExp).join(".*");
    return new RegExp(`^${escaped}$`).test(relativePath);
  }
  return false;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function categorySelected(set, category) {
  return set.has("all") || set.has(category);
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function audit(options) {
  const root = path.resolve(options.root);
  const allowList = loadAllowList(options.allowList, root);
  const findings = [];

  for (const file of listFiles(root)) {
    const relativePath = toPosix(path.relative(root, file));
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (_error) {
      continue;
    }
    const category = classify(relativePath);
    for (const match of findPrivatePaths(text)) {
      const location = lineAndColumn(text, match.index);
      const finding = {
        path: relativePath,
        category,
        line: location.line,
        column: location.column,
        match: match.value,
      };
      finding.allowed = isAllowed(finding, allowList);
      findings.push(finding);
    }
  }

  const selectedFindings = findings.filter((finding) => {
    return categorySelected(options.failOn, finding.category) || categorySelected(options.reportOnly, finding.category);
  });
  const failingFindings = findings.filter((finding) => {
    return !finding.allowed && categorySelected(options.failOn, finding.category);
  });

  return { findings, selectedFindings, failingFindings };
}

function renderText(result) {
  const byCategory = new Map();
  for (const finding of result.findings) {
    const existing = byCategory.get(finding.category) || { total: 0, allowed: 0, unallowed: 0 };
    existing.total += 1;
    if (finding.allowed) {
      existing.allowed += 1;
    } else {
      existing.unallowed += 1;
    }
    byCategory.set(finding.category, existing);
  }

  console.log("# Private Path Audit");
  for (const category of [...byCategory.keys()].sort()) {
    const counts = byCategory.get(category);
    console.log(`${category}: total=${counts.total} allowed=${counts.allowed} unallowed=${counts.unallowed}`);
  }
  if (result.selectedFindings.length > 0) {
    console.log("\n## Findings");
    for (const finding of result.selectedFindings) {
      const status = finding.allowed ? "allowed" : "unallowed";
      console.log(`${status}\t${finding.category}\t${finding.path}:${finding.line}:${finding.column}\t${finding.match}`);
    }
  }
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      usage();
      return;
    }
    validateOptions(options);
    const result = audit(options);
    if (options.format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      renderText(result);
    }
    if (result.failingFindings.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`audit-private-paths: ${error.message}`);
    process.exitCode = 2;
  }
}

main();
