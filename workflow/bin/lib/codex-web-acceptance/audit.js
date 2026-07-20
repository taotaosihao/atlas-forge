"use strict";

const fs = require("fs");
const path = require("path");

const TOOL = "codex-web-acceptance";
const SCHEMA_VERSION = 1;
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "playwright-report", "test-results"]);

class AuditError extends Error {}

const RULES = [
  {
    id: "AUTH_API_LOGIN",
    severity: "blocking",
    title: "API 登录绕过真实登录页",
    pattern: /(?:request\.(?:post|put)|fetch)\s*\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*?(?:auth\/login|login[^\w])(?:\\.|(?!\1)[\s\S])*?)\1/gi,
  },
  {
    id: "AUTH_COOKIE_INJECTION",
    severity: "blocking",
    title: "直接注入认证 Cookie 或 storage state",
    pattern: /\baddCookies\s*\(|\bstorageState\s*:/gi,
  },
  {
    id: "LOCATOR_NTH",
    severity: "blocking",
    title: "使用位置相关的 nth/first/last locator",
    pattern: /\.(?:nth\s*\([^)]*\)|first\s*\(\)|last\s*\(\))/g,
  },
  {
    id: "LOCATOR_DEEP_CSS",
    severity: "blocking",
    title: "使用脆弱的深层 CSS locator",
    pattern: /\.locator\s*\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g,
    accept: (match) => /(?:\s|[>+~])/.test(match[2]),
  },
  {
    id: "LOCATOR_FUZZY_TEXT",
    severity: "blocking",
    title: "文本 locator 未声明精确匹配",
    pattern: /\.getByText\s*\([\s\S]*?\)/g,
    accept: (match) => !/exact\s*:\s*true/.test(match[0]),
  },
  {
    id: "ACTION_FORCE",
    severity: "blocking",
    title: "使用 force 绕过 actionability",
    pattern: /\bforce\s*:\s*true\b/g,
  },
  {
    id: "WAIT_FIXED_TIMEOUT",
    severity: "blocking",
    title: "使用固定时长等待",
    pattern: /\.waitForTimeout\s*\(/g,
  },
  {
    id: "ROUTE_MOCK",
    severity: "blocking",
    title: "route fulfill/abort 改写真实后端链路",
    pattern: /(?:\bpage\.route|\broute\.(?:fulfill|abort))\s*\(/g,
  },
];

function usage(message) {
  const suffix = message ? `${message}\n` : "";
  process.stderr.write(
    `${suffix}usage: ${TOOL} audit --project <path> --playwright-config <path> ` +
      `[--source-root <path> ...] [--waiver-file <path>] [--format json|human]\n`,
  );
  process.exitCode = 1;
}

function parseArgs(argv) {
  if (argv.shift() !== "audit") throw new AuditError("首个参数必须是 audit");
  const options = { sourceRoots: [] };
  while (argv.length) {
    const argument = argv.shift();
    if (!argument.startsWith("--")) throw new AuditError(`意外的位置参数: ${argument}`);
    const equals = argument.indexOf("=");
    const key = argument.slice(2, equals === -1 ? undefined : equals);
    const value = equals === -1 ? argv.shift() : argument.slice(equals + 1);
    if (!value || value.startsWith("--")) throw new AuditError(`选项 --${key} 缺少值`);
    if (key === "source-root") options.sourceRoots.push(value);
    else if (["project", "playwright-config", "waiver-file", "format"].includes(key)) {
      const property = key.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
      if (options[property] !== undefined) throw new AuditError(`重复选项: --${key}`);
      options[property] = value;
    } else throw new AuditError(`未知选项: --${key}`);
  }
  if (!options.project) throw new AuditError("缺少必需选项: --project");
  if (!options.playwrightConfig) throw new AuditError("缺少必需选项: --playwright-config");
  options.format ||= "human";
  if (!new Set(["json", "human"]).has(options.format)) throw new AuditError("--format 必须是 json 或 human");
  return options;
}

function requireRegularFile(file, label) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (error) {
    throw new AuditError(`${label} 不存在: ${file}`);
  }
  if (!stat.isFile()) throw new AuditError(`${label} 不是文件: ${file}`);
}

function requireDirectory(directory, label) {
  let stat;
  try {
    stat = fs.statSync(directory);
  } catch (error) {
    throw new AuditError(`${label} 不存在: ${directory}`);
  }
  if (!stat.isDirectory()) throw new AuditError(`${label} 不是目录: ${directory}`);
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function relativePath(root, file) {
  return path.relative(root, file).split(path.sep).join("/") || ".";
}

function collectFiles(directory, files = []) {
  const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"));
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) collectFiles(file, files);
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(file);
  }
  return files;
}

function loadWaivers(file, projectRoot) {
  if (!file) return [];
  const resolved = path.resolve(projectRoot, file);
  requireRegularFile(resolved, "waiver 文件");
  let value;
  try {
    value = JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (error) {
    throw new AuditError(`waiver 文件不是合法 JSON: ${resolved}`);
  }
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "schema_version,waivers" || value.schema_version !== 1 || !Array.isArray(value.waivers)) {
    throw new AuditError("waiver 文件必须只包含 schema_version=1 和 waivers 数组");
  }
  return value.waivers.map((waiver, index) => {
    const waiverKeys = waiver && typeof waiver === "object" ? Object.keys(waiver).sort() : [];
    if (waiverKeys.join(",") !== "path,reason,rule_id") throw new AuditError(`waivers[${index}] 字段无效`);
    if (![waiver.path, waiver.reason, waiver.rule_id].every((item) => typeof item === "string" && item.trim())) {
      throw new AuditError(`waivers[${index}] 的 path、reason 和 rule_id 必须是非空字符串`);
    }
    if (!RULES.some((rule) => rule.id === waiver.rule_id) && !["ASSERTION_WEAK_POSTCONDITION", "CONFIG_RETRY_RISK", "CONFIG_TRACE_RETRY_ONLY"].includes(waiver.rule_id)) {
      throw new AuditError(`waivers[${index}] 使用未知 rule_id: ${waiver.rule_id}`);
    }
    return { path: waiver.path.split(path.sep).join("/"), reason: waiver.reason.trim(), rule_id: waiver.rule_id };
  });
}

function addFinding(findings, waivers, finding) {
  const waiver = waivers.find((item) => item.rule_id === finding.rule_id && (item.path === finding.path || item.path === "*"));
  findings.push(waiver ? { ...finding, category: "approved_waiver", waiver_reason: waiver.reason } : { ...finding, category: finding.severity });
}

function scanFile(projectRoot, file, waivers, findings) {
  const source = fs.readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/);
  const displayPath = relativePath(projectRoot, file);
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (let match = rule.pattern.exec(source); match; match = rule.pattern.exec(source)) {
      if (rule.accept && !rule.accept(match)) continue;
      const before = source.slice(0, match.index);
      const line = before.split(/\r?\n/).length;
      const lastNewline = Math.max(before.lastIndexOf("\n"), before.lastIndexOf("\r"));
      addFinding(findings, waivers, {
        rule_id: rule.id,
        severity: rule.severity,
        title: rule.title,
        path: displayPath,
        line,
        column: match.index - lastNewline,
      });
      if (match[0].length === 0) rule.pattern.lastIndex += 1;
    }
  }
  lines.forEach((line, index) => {
    if (/\.(?:click|fill|press|check|uncheck|selectOption|dragTo)\s*\(/.test(line)) {
      const following = lines.slice(index + 1, index + 7).join("\n");
      if (!/\bexpect\s*\(/.test(following)) {
        addFinding(findings, waivers, {
          rule_id: "ASSERTION_WEAK_POSTCONDITION",
          severity: "warning",
          title: "关键动作附近缺少可观察后置断言",
          path: displayPath,
          line: index + 1,
          column: Math.max(1, line.search(/\S|$/) + 1),
        });
      }
    }
  });
}

function scanRetryRisk(projectRoot, configFile, waivers, findings) {
  const lines = fs.readFileSync(configFile, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const retryValue = /\bretries\s*:\s*([^,;}]+)/.exec(line)?.[1].trim();
    if (!retryValue || /^(?:0|false)$/.test(retryValue)) return;
    addFinding(findings, waivers, {
      rule_id: "CONFIG_RETRY_RISK",
      severity: "warning",
      title: "Playwright retry 可能掩盖首试失败",
      path: relativePath(projectRoot, configFile),
      line: index + 1,
      column: Math.max(1, line.search(/\bretries\b/) + 1),
    });
    return;
  });
  lines.forEach((line, index) => {
    if (!/\btrace\s*:\s*(["'])on-first-retry\1/.test(line)) return;
    addFinding(findings, waivers, {
      rule_id: "CONFIG_TRACE_RETRY_ONLY",
      severity: "warning",
      title: "Trace 仅在 retry 时保留，无法证明首试通过",
      path: relativePath(projectRoot, configFile),
      line: index + 1,
      column: Math.max(1, line.search(/\btrace\b/) + 1),
    });
  });
}

function summarize(findings) {
  const count = (category) => findings.filter((finding) => finding.category === category).length;
  return { blocking: count("blocking"), warning: count("warning"), approved_waiver: count("approved_waiver"), total: findings.length };
}

function humanSummary(result) {
  const lines = [
    "Atlas Web UI 静态审计",
    `项目: ${result.project}`,
    `扫描文件: ${result.files_scanned}`,
    `阻断: ${result.summary.blocking}，警告: ${result.summary.warning}，已批准豁免: ${result.summary.approved_waiver}`,
  ];
  for (const finding of result.findings) {
    const waiver = finding.category === "approved_waiver" ? `（豁免：${finding.waiver_reason}）` : "";
    lines.push(`[${finding.category}] ${finding.rule_id} ${finding.path}:${finding.line}:${finding.column} ${finding.title}${waiver}`);
  }
  if (!result.findings.length) lines.push("未发现已登记风险。");
  return `${lines.join("\n")}\n`;
}

function audit(options) {
  const projectRoot = path.resolve(options.project);
  requireDirectory(projectRoot, "项目目录");
  const configFile = path.resolve(projectRoot, options.playwrightConfig);
  if (!isInside(projectRoot, configFile)) throw new AuditError("Playwright 配置必须位于项目目录内");
  requireRegularFile(configFile, "Playwright 配置");

  let roots = options.sourceRoots.map((root) => path.resolve(projectRoot, root));
  if (!roots.length) {
    const conventionalRoot = path.join(path.dirname(configFile), "e2e");
    roots = [fs.existsSync(conventionalRoot) ? conventionalRoot : path.dirname(configFile)];
  }
  for (const root of roots) {
    if (!isInside(projectRoot, root)) throw new AuditError("source root 必须位于项目目录内");
    requireDirectory(root, "source root");
  }

  const waivers = loadWaivers(options.waiverFile, projectRoot);
  const files = [...new Set(roots.flatMap((root) => collectFiles(root)))].sort();
  const findings = [];
  for (const file of files) scanFile(projectRoot, file, waivers, findings);
  scanRetryRisk(projectRoot, configFile, waivers, findings);
  findings.sort((left, right) =>
    left.path.localeCompare(right.path, "en") || left.line - right.line || left.column - right.column || left.rule_id.localeCompare(right.rule_id, "en"),
  );
  const summary = summarize(findings);
  return {
    schema_version: SCHEMA_VERSION,
    tool: TOOL,
    command: "audit",
    ok: summary.blocking === 0,
    project: projectRoot,
    playwright_config: relativePath(projectRoot, configFile),
    files_scanned: files.length,
    summary,
    findings,
  };
}

function main(argv) {
  let options;
  try {
    options = parseArgs([...argv]);
    const result = audit(options);
    const summary = humanSummary(result);
    if (options.format === "json") {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.stderr.write(summary);
    } else process.stdout.write(summary);
    process.exitCode = result.ok ? 0 : 2;
  } catch (error) {
    if (error instanceof AuditError) usage(error.message);
    else {
      process.stderr.write(`${TOOL}: 内部错误: ${error.message}\n`);
      process.exitCode = 1;
    }
  }
}

module.exports = { audit, main };
