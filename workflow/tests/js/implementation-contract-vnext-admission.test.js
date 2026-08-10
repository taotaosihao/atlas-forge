"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const PLUGIN_ROOT = path.join(ROOT, "plugins/atlas-workflow");
const LINT_BIN = path.join(PLUGIN_ROOT, "scripts/codex-implementation-contract-lint");
const BRIEF_BIN = path.join(PLUGIN_ROOT, "scripts/codex-team-brief");
const CONTRACT_FIXTURE = path.join(
  ROOT,
  "test/fixtures/implementation-contract/valid/scope-admission-v5.md",
);
const INVALID_ENVELOPE_FIXTURE = path.join(
  ROOT,
  "test/fixtures/implementation-contract/invalid/v5-invalid-authoring-envelope.md",
);
const { validateBrief } = require(path.join(
  PLUGIN_ROOT,
  "contracts/team-sdd/validators/brief",
));
const { sha256Value } = require(path.join(
  PLUGIN_ROOT,
  "contracts/team-sdd/validators/execution-plan",
));
const { parseImplementationContract } = require(path.join(
  PLUGIN_ROOT,
  "contracts/team-sdd/validators/implementation-contract",
));
const { validateContractText } = require(LINT_BIN);
const { snapshotAuthoritySlices } = require(path.join(
  PLUGIN_ROOT,
  "contracts/team-sdd/validators/authority-slices",
));
const { resolvePaths, taskArtifactDir } = require(path.join(
  ROOT,
  "workflow/bin/lib/codex-workflow/core/paths",
));
const { taskEventFile } = require(path.join(
  ROOT,
  "workflow/bin/lib/codex-workflow/core/task-mutation",
));
const { admitTeamStart } = require(path.join(
  ROOT,
  "workflow/bin/lib/codex-workflow/team/admission",
));
const { createTask, startTask } = require(path.join(
  ROOT,
  "workflow/bin/lib/codex-workflow/task/lifecycle",
));
const { readJsonObject, taskStateFile } = require(path.join(
  ROOT,
  "workflow/bin/lib/codex-workflow/task/runtime",
));
const {
  parseAuthorizeArgs,
  parseReplanArgs,
  runAuthorize,
  runReplan,
} = require(path.join(
  ROOT,
  "workflow/bin/lib/codex-workflow/team/authority-commands",
));

const V5_DECOY_ENVELOPE = [
  "```text",
  "contract_semantics_version: 6",
  "work_type: implementation",
  "```",
  "<!--",
  "contract_semantics_version: 4",
  "work_type: review",
  "-->",
  "",
].join("\n");

function git(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function eventCount(paths, taskId) {
  return fs.readFileSync(taskEventFile(paths, taskId), "utf8")
    .split("\n")
    .filter((line) => line.trim()).length;
}

function writeAuthoritySlice(paths, taskId, repo, baseSha) {
  const sliceId = "authority-vnext";
  const sliceDir = path.join(
    taskArtifactDir(paths, taskId),
    "team/sdd/slices",
    sliceId,
  );
  fs.mkdirSync(sliceDir, { recursive: true });
  fs.writeFileSync(path.join(sliceDir, "brief.md"), "# Goal\n\n- REQ-1\n", "utf8");
  fs.writeFileSync(
    path.join(sliceDir, "brief.json"),
    `${JSON.stringify({
      schema_version: 2,
      task_id: taskId,
      slice_id: sliceId,
      repo,
      base_sha: baseSha,
      objective: "Provide canonical goal authority for vNext contract admission.",
      requirements_path: "brief.md",
      global_constraints_path: "../../global-constraints.md",
      owned_paths: ["plugins/atlas-workflow"],
      forbidden_paths: ["plugins/multica-sdlc"],
      acceptance_refs: ["REQ-1"],
      required_checks: ["node --test workflow/tests/js/implementation-contract-vnext-admission.test.js"],
      commit_policy: "logical_outcome",
      output_contract: "final_message_json_only",
    }, null, 2)}\n`,
    "utf8",
  );
  return sliceDir;
}

function forgeSchemaFourBrief({ authoritySlice, baseSha, contractPath, environment, paths, repo, taskId }) {
  const text = fs.readFileSync(contractPath, "utf8");
  const parsed = parseImplementationContract(text);
  const plan = parsed.executionPlan;
  const slice = plan.slices[0];
  const lint = validateContractText(text, {
    authoritySlices: [authoritySlice],
    expectedTaskId: taskId,
    newAuthoring: true,
    strict: true,
    workflowRoot: environment.CODEX_WORKFLOW_ROOT,
  });
  assert.equal(lint.ok, false);
  assert.ok(lint.authorityIdentities.length > 0);
  const brief = {
    schema_version: 4,
    task_id: taskId,
    slice_id: slice.slice_id,
    repo,
    base_sha: baseSha,
    objective: slice.objective,
    requirements_path: `team/sdd/slices/${slice.slice_id}/brief.md`,
    global_constraints_path: "team/sdd/global-constraints.md",
    contract: {
      path: contractPath,
      sha256: `sha256:${crypto.createHash("sha256").update(text).digest("hex")}`,
      semantics_version: 5,
      execution_plan_schema_version: 3,
      execution_plan_sha256: `sha256:${sha256Value(plan)}`,
      authority_slices: lint.authorityIdentities,
    },
    dependencies: [],
    keeper_outputs: slice.keeper_outputs,
    owned_paths: slice.owned_paths,
    forbidden_paths: slice.forbidden_paths || [],
    acceptance_refs: slice.acceptance_refs,
    risk_class: slice.risk_class,
    failure_domain: slice.failure_domain,
    rollback_boundary: slice.rollback_boundary,
    budget: slice.budget,
    checks: slice.checks,
    size_gate: {
      decision: "pass",
      policy_id: "atlas-slice-size-v2",
      estimate: slice.estimate,
      exception: null,
    },
    commit_policy: "logical_outcome",
    output_contract: "final_message_json_only",
  };
  assert.deepEqual(validateBrief(brief), []);
  const briefDir = path.join(taskArtifactDir(paths, taskId), "team/sdd/slices", slice.slice_id);
  fs.mkdirSync(briefDir, { recursive: true });
  fs.writeFileSync(path.join(briefDir, "brief.md"), "# Forged brief\n", "utf8");
  const briefPath = path.join(briefDir, "brief.json");
  fs.writeFileSync(briefPath, `${JSON.stringify(brief, null, 2)}\n`, "utf8");
  return { brief, briefPath };
}

test("semantics v5 passes the same full lint through brief compilation and execution admission", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-vnext-admission."));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const environment = {
    ...process.env,
    ATLAS_WORKFLOW_PLUGIN_ROOT: PLUGIN_ROOT,
    CODEX_HOME_ROOT: home,
    CODEX_WORKFLOW_ROOT: path.join(home, "workflow"),
  };
  const clock = () => new Date("2026-08-10T00:00:00Z");
  const paths = resolvePaths(environment);
  const taskId = createTask(
    "vNext implementation contract admission",
    "lint, compile, authorize, and admit one semantics-v5 slice",
    { clock, environment },
  );
  startTask(taskId, { clock, environment });

  const repo = path.join(home, "repo");
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "atlas@example.test"]);
  git(repo, ["config", "user.name", "Atlas Test"]);
  const contractName = `implementation-contract.${taskId}.final.md`;
  const contractPath = path.join(repo, contractName);
  const contract = `${V5_DECOY_ENVELOPE}${fs.readFileSync(CONTRACT_FIXTURE, "utf8")
    .replace(/^task_id: fixture$/m, `task_id: ${taskId}`)}`;
  const contractBytes = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(contract, "utf8"),
  ]);
  fs.writeFileSync(contractPath, contractBytes);
  git(repo, ["add", contractName]);
  git(repo, ["commit", "-qm", "test: add semantics-v5 implementation contract"]);
  const baseSha = git(repo, ["rev-parse", "HEAD"]);
  const authoritySlice = writeAuthoritySlice(paths, taskId, repo, baseSha);

  const lint = spawnSync("node", [
    LINT_BIN,
    "--strict",
    "--new-authoring",
    "--file", contractPath,
    "--authority-slice", authoritySlice,
  ], { cwd: repo, env: environment, encoding: "utf8" });
  assert.equal(lint.status, 0, lint.stderr);
  assert.match(lint.stdout, /^implementation_contract_lint: true$/m);
  assert.match(lint.stdout, /^semantics_version: 5$/m);

  const invalidContractBytes = Buffer.concat([contractBytes, Buffer.from([0xff])]);
  fs.writeFileSync(contractPath, invalidContractBytes);
  const invalidLint = spawnSync("node", [
    LINT_BIN,
    "--strict",
    "--new-authoring",
    "--file", contractPath,
    "--authority-slice", authoritySlice,
  ], { cwd: repo, env: environment, encoding: "utf8" });
  assert.equal(invalidLint.status, 2);
  assert.match(invalidLint.stderr, /INPUT_INVALID.*not readable UTF-8/s);
  const invalidCompile = spawnSync("node", [
    BRIEF_BIN,
    "--task", taskId,
    "--slice", "slice-vnext",
    "--repo", repo,
    "--base", baseSha,
    "--contract", contractPath,
    "--authority-slice", authoritySlice,
  ], { cwd: repo, env: environment, encoding: "utf8" });
  assert.equal(invalidCompile.status, 1);
  assert.match(invalidCompile.stderr, /not readable UTF-8/);
  assert.equal(fs.existsSync(path.join(
    taskArtifactDir(paths, taskId),
    "team/sdd/slices/slice-vnext/brief.json",
  )), false);
  fs.writeFileSync(contractPath, contractBytes);

  const compile = spawnSync("node", [
    BRIEF_BIN,
    "--task", taskId,
    "--slice", "slice-vnext",
    "--repo", repo,
    "--base", baseSha,
    "--contract", contractPath,
    "--authority-slice", authoritySlice,
  ], { cwd: repo, env: environment, encoding: "utf8" });
  assert.equal(compile.status, 0, compile.stderr);
  const briefPath = path.join(
    taskArtifactDir(paths, taskId),
    "team/sdd/slices/slice-vnext/brief.json",
  );
  const brief = JSON.parse(fs.readFileSync(briefPath, "utf8"));
  assert.equal(brief.schema_version, 4);
  assert.equal(brief.contract.semantics_version, 5);
  assert.equal(brief.contract.execution_plan_schema_version, 3);
  assert.equal(
    brief.contract.sha256,
    `sha256:${crypto.createHash("sha256").update(contractBytes).digest("hex")}`,
  );
  assert.equal(brief.contract.authority_slices.length, 1);
  assert.equal(brief.contract.authority_slices[0].path, authoritySlice);

  const authorizationRef = "user-message:v5-admission";
  const authorize = parseAuthorizeArgs([
    taskId,
    brief.objective,
    `--authorization-ref=${authorizationRef}`,
    `--brief=${briefPath}`,
    "--grant-id=v5-grant",
    "--operation-id=authorize-v5",
  ]);
  const beforeInvalidAuthorize = eventCount(paths, taskId);
  fs.writeFileSync(contractPath, invalidContractBytes);
  assert.throws(
    () => runAuthorize(authorize, { clock, cwd: repo, environment }),
    /not readable UTF-8/,
  );
  assert.equal(eventCount(paths, taskId), beforeInvalidAuthorize);
  assert.equal(readJsonObject(taskStateFile(paths, taskId)).execution_authority, undefined);
  fs.writeFileSync(contractPath, contractBytes);
  runAuthorize(authorize, { clock, cwd: repo, environment });
  const currentState = readJsonObject(taskStateFile(paths, taskId));
  const grant = currentState.execution_authority.grants[0];

  const admission = admitTeamStart({
    authorizationRef,
    briefPath,
    clock,
    cwd: repo,
    environment,
    currentState,
    expectedGrantId: grant.grant_id,
    expectedScopeDigest: grant.scope_digest,
    mode: "execute",
    objective: brief.objective,
    paths,
    taskId,
  });
  assert.equal(admission.mode, "execution-vnext");
  assert.equal(admission.brief.execution_plan_schema_version, 3);
  assert.equal(grant.scope.contract.semantics_version, 5);
  assert.equal(grant.scope.execution_plan.schema_version, 3);
  assert.deepEqual(grant.scope.contract.authority_slices, brief.contract.authority_slices);

  const afterAuthorizeEvents = eventCount(paths, taskId);
  fs.writeFileSync(contractPath, invalidContractBytes);
  assert.throws(() => admitTeamStart({
    authorizationRef,
    briefPath,
    clock,
    cwd: repo,
    environment,
    currentState,
    expectedGrantId: grant.grant_id,
    expectedScopeDigest: grant.scope_digest,
    mode: "execute",
    objective: brief.objective,
    paths,
    taskId,
  }), /not readable UTF-8/);
  assert.throws(
    () => runAuthorize(authorize, { clock, cwd: repo, environment }),
    /stale authorization replay.*not readable UTF-8/s,
  );
  const replan = parseReplanArgs([
    taskId,
    brief.objective,
    "--authorization-ref=operator-input:v5-invalid-utf8-replan",
    `--brief=${briefPath}`,
    "--grant-id=v5-grant-replanned",
    "--operation-id=replan-v5-invalid-utf8",
    "--evidence-policy=invalidate-incompatible",
    "--expected-delta=[]",
  ]);
  assert.throws(
    () => runReplan(replan, { clock, cwd: repo, environment }),
    /not readable UTF-8/,
  );
  assert.equal(eventCount(paths, taskId), afterAuthorizeEvents);
  fs.writeFileSync(contractPath, contractBytes);

  const authorityBriefMarkdown = path.join(authoritySlice, "brief.md");
  const originalAuthorityBrief = fs.readFileSync(authorityBriefMarkdown, "utf8");
  fs.appendFileSync(authorityBriefMarkdown, "\nDrift.\n", "utf8");
  assert.throws(() => admitTeamStart({
    authorizationRef,
    briefPath,
    clock,
    cwd: repo,
    environment,
    currentState,
    expectedGrantId: grant.grant_id,
    expectedScopeDigest: grant.scope_digest,
    mode: "execute",
    objective: brief.objective,
    paths,
    taskId,
  }), /authority slice identities do not match current stable artifacts/);
  fs.writeFileSync(authorityBriefMarkdown, originalAuthorityBrief, "utf8");
  fs.writeFileSync(
    path.join(authoritySlice, "evidence-manifest.json"),
    `${JSON.stringify({ contract_sha256: "sha256:" + "a".repeat(64) })}\n`,
    "utf8",
  );
  assert.throws(() => runAuthorize(parseAuthorizeArgs([
    taskId,
    brief.objective,
    `--authorization-ref=${authorizationRef}`,
    `--brief=${briefPath}`,
    "--grant-id=v5-grant",
    "--operation-id=authorize-v5",
  ]), { clock, cwd: repo, environment }), /authority slice identities do not match current stable artifacts/);
});

test("authorize rejects a digest-correct schema-v4 brief whose v5 contract fails full authoring lint", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-vnext-invalid-authorize."));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const environment = {
    ...process.env,
    ATLAS_WORKFLOW_PLUGIN_ROOT: PLUGIN_ROOT,
    CODEX_HOME_ROOT: home,
    CODEX_WORKFLOW_ROOT: path.join(home, "workflow"),
  };
  const clock = () => new Date("2026-08-10T00:00:00Z");
  const paths = resolvePaths(environment);
  const taskId = createTask("invalid v5 admission", "reject forged schema-v4 authority", {
    clock,
    environment,
  });
  startTask(taskId, { clock, environment });
  const repo = path.join(home, "repo");
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "atlas@example.test"]);
  git(repo, ["config", "user.name", "Atlas Test"]);
  const contractPath = path.join(repo, `implementation-contract.${taskId}.final.md`);
  fs.writeFileSync(
    contractPath,
    fs.readFileSync(INVALID_ENVELOPE_FIXTURE, "utf8")
      .replace(/^task_id: fixture$/m, `task_id: ${taskId}`),
    "utf8",
  );
  git(repo, ["add", path.basename(contractPath)]);
  git(repo, ["commit", "-qm", "test: add invalid semantics-v5 implementation contract"]);
  const baseSha = git(repo, ["rev-parse", "HEAD"]);
  const authoritySlice = writeAuthoritySlice(paths, taskId, repo, baseSha);
  const { brief, briefPath } = forgeSchemaFourBrief({
    authoritySlice,
    baseSha,
    contractPath,
    environment,
    paths,
    repo,
    taskId,
  });
  const before = readJsonObject(taskStateFile(paths, taskId));
  assert.throws(() => runAuthorize(parseAuthorizeArgs([
    taskId,
    brief.objective,
    "--authorization-ref=user-message:invalid-v5",
    `--brief=${briefPath}`,
    "--grant-id=invalid-v5-grant",
    "--operation-id=authorize-invalid-v5",
  ]), { clock, cwd: repo, environment }), /full semantic validation failed.*REQUIRED_FIELD_MISSING/s);
  const after = readJsonObject(taskStateFile(paths, taskId));
  assert.deepEqual(after.execution_authority, before.execution_authority);

  const validContractPath = path.join(repo, `implementation-contract.${taskId}.valid.md`);
  fs.writeFileSync(
    validContractPath,
    fs.readFileSync(CONTRACT_FIXTURE, "utf8").replace(/^task_id: fixture$/m, `task_id: ${taskId}`),
    "utf8",
  );
  git(repo, ["add", path.basename(validContractPath)]);
  git(repo, ["commit", "-qm", "test: add valid semantics-v5 implementation contract"]);
  const validBase = git(repo, ["rev-parse", "HEAD"]);
  const compile = spawnSync("node", [
    BRIEF_BIN,
    "--task", taskId,
    "--slice", "slice-vnext",
    "--repo", repo,
    "--base", validBase,
    "--contract", validContractPath,
    "--authority-slice", authoritySlice,
  ], { cwd: repo, env: environment, encoding: "utf8" });
  assert.equal(compile.status, 0, compile.stderr);
  const validBriefPath = path.join(
    taskArtifactDir(paths, taskId),
    "team/sdd/slices/slice-vnext/brief.json",
  );
  const validBrief = JSON.parse(fs.readFileSync(validBriefPath, "utf8"));
  runAuthorize(parseAuthorizeArgs([
    taskId,
    validBrief.objective,
    "--authorization-ref=user-message:valid-v5",
    `--brief=${validBriefPath}`,
    "--grant-id=valid-v5-grant",
    "--operation-id=authorize-valid-v5",
  ]), { clock, cwd: repo, environment });
  const activeState = readJsonObject(taskStateFile(paths, taskId));
  const grant = activeState.execution_authority.grants[0];
  assert.throws(() => admitTeamStart({
    authorizationRef: "user-message:valid-v5",
    briefPath,
    clock,
    cwd: repo,
    environment,
    currentState: activeState,
    expectedGrantId: grant.grant_id,
    expectedScopeDigest: grant.scope_digest,
    mode: "execute",
    objective: brief.objective,
    paths,
    taskId,
  }), /full semantic validation failed.*REQUIRED_FIELD_MISSING/s);
});

test("brief compilation rejects contract task mismatch before creating an executable brief", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-vnext-task-mismatch."));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const environment = {
    ...process.env,
    ATLAS_WORKFLOW_PLUGIN_ROOT: PLUGIN_ROOT,
    CODEX_HOME_ROOT: home,
    CODEX_WORKFLOW_ROOT: path.join(home, "workflow"),
  };
  const clock = () => new Date("2026-08-10T00:00:00Z");
  const paths = resolvePaths(environment);
  const taskId = createTask("task mismatch", "reject a foreign contract task", { clock, environment });
  startTask(taskId, { clock, environment });
  const repo = path.join(home, "repo");
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "atlas@example.test"]);
  git(repo, ["config", "user.name", "Atlas Test"]);
  const contractPath = path.join(repo, "implementation-contract.foreign.final.md");
  fs.copyFileSync(CONTRACT_FIXTURE, contractPath);
  git(repo, ["add", path.basename(contractPath)]);
  git(repo, ["commit", "-qm", "test: add foreign-task contract"]);
  const baseSha = git(repo, ["rev-parse", "HEAD"]);
  const authoritySlice = writeAuthoritySlice(paths, taskId, repo, baseSha);
  const compile = spawnSync("node", [
    BRIEF_BIN,
    "--task", taskId,
    "--slice", "slice-vnext",
    "--repo", repo,
    "--base", baseSha,
    "--contract", contractPath,
    "--authority-slice", authoritySlice,
  ], { cwd: repo, env: environment, encoding: "utf8" });
  assert.equal(compile.status, 1);
  assert.match(compile.stderr, /TASK_ID_MISMATCH|contract task_id does not match/);
  assert.equal(fs.existsSync(path.join(
    taskArtifactDir(paths, taskId), "team/sdd/slices/slice-vnext/brief.json",
  )), false);
  const { brief, briefPath } = forgeSchemaFourBrief({
    authoritySlice,
    baseSha,
    contractPath,
    environment,
    paths,
    repo,
    taskId,
  });
  assert.throws(() => runAuthorize(parseAuthorizeArgs([
    taskId,
    brief.objective,
    "--authorization-ref=user-message:foreign-task",
    `--brief=${briefPath}`,
    "--grant-id=foreign-task-grant",
    "--operation-id=authorize-foreign-task",
  ]), { clock, cwd: repo, environment }), /full semantic validation failed.*TASK_ID_MISMATCH/s);
  assert.equal(readJsonObject(taskStateFile(paths, taskId)).execution_authority, undefined);
});

test("brief compilation stable recheck emits no artifacts when authority changes", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-vnext-builder-recheck."));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const environment = {
    ...process.env,
    ATLAS_WORKFLOW_PLUGIN_ROOT: PLUGIN_ROOT,
    CODEX_HOME_ROOT: home,
    CODEX_WORKFLOW_ROOT: path.join(home, "workflow"),
  };
  const clock = () => new Date("2026-08-10T00:00:00Z");
  const paths = resolvePaths(environment);
  const taskId = createTask("builder stable recheck", "reject changed authority before output", {
    clock,
    environment,
  });
  const repo = path.join(home, "repo");
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "atlas@example.test"]);
  git(repo, ["config", "user.name", "Atlas Test"]);
  const contractPath = path.join(repo, `implementation-contract.${taskId}.final.md`);
  fs.writeFileSync(
    contractPath,
    fs.readFileSync(CONTRACT_FIXTURE, "utf8").replace(/^task_id: fixture$/m, `task_id: ${taskId}`),
    "utf8",
  );
  git(repo, ["add", path.basename(contractPath)]);
  git(repo, ["commit", "-qm", "test: add valid contract for stable recheck"]);
  const baseSha = git(repo, ["rev-parse", "HEAD"]);
  const authoritySlice = writeAuthoritySlice(paths, taskId, repo, baseSha);
  const authorityBrief = path.join(authoritySlice, "brief.md");
  const preload = path.join(home, "inject-authority-drift.cjs");
  fs.writeFileSync(preload, [
    '"use strict";',
    'const fs = require("fs");',
    'const path = require("path");',
    'const target = path.resolve(process.env.ATLAS_TEST_AUTHORITY_BRIEF);',
    'const original = fs.openSync;',
    'let reads = 0;',
    'let changed = false;',
    'fs.openSync = function patchedOpen(file, ...args) {',
    '  if (path.resolve(file) === target) {',
    '    reads += 1;',
    '    if (reads === 2 && !changed) {',
    '      changed = true;',
    '      fs.appendFileSync(target, "\\nchanged between validation passes\\n", "utf8");',
    '    }',
    '  }',
    '  return original.call(this, file, ...args);',
    '};',
    '',
  ].join("\n"), "utf8");
  const compile = spawnSync("node", [
    BRIEF_BIN,
    "--task", taskId,
    "--slice", "slice-vnext",
    "--repo", repo,
    "--base", baseSha,
    "--contract", contractPath,
    "--authority-slice", authoritySlice,
  ], {
    cwd: repo,
    env: {
      ...environment,
      ATLAS_TEST_AUTHORITY_BRIEF: authorityBrief,
      NODE_OPTIONS: `--require=${preload}`,
    },
    encoding: "utf8",
  });
  assert.equal(compile.status, 1);
  assert.equal(compile.stdout, "");
  assert.match(compile.stderr, /authority slice identities changed before brief output/);
  assert.equal(fs.existsSync(path.join(
    taskArtifactDir(paths, taskId), "team/sdd/slices/slice-vnext",
  )), false);
});

test("authority snapshot rejects duplicate paths, relative roots, and optional absence that appears", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-authority-snapshot."));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const environment = {
    ...process.env,
    CODEX_HOME_ROOT: home,
    CODEX_WORKFLOW_ROOT: path.join(home, "workflow"),
  };
  const clock = () => new Date("2026-08-10T00:00:00Z");
  const paths = resolvePaths(environment);
  const taskId = createTask("authority snapshot", "close optional existence identity", {
    clock,
    environment,
  });
  const repo = path.join(home, "repo");
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "atlas@example.test"]);
  git(repo, ["config", "user.name", "Atlas Test"]);
  fs.writeFileSync(path.join(repo, "README.md"), "test\n", "utf8");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-qm", "test: initialize repository"]);
  const authoritySlice = writeAuthoritySlice(paths, taskId, repo, git(repo, ["rev-parse", "HEAD"]));
  assert.throws(() => snapshotAuthoritySlices([authoritySlice, authoritySlice], {
    workflowRoot: environment.CODEX_WORKFLOW_ROOT,
    expectedTaskId: taskId,
  }), /duplicate canonical directories/);
  assert.throws(() => snapshotAuthoritySlices([authoritySlice], {
    workflowRoot: "relative-workflow-root",
    expectedTaskId: taskId,
  }), /absolute canonical directory/);
  const relativeRootLint = validateContractText(
    fs.readFileSync(CONTRACT_FIXTURE, "utf8").replace(/^task_id: fixture$/m, `task_id: ${taskId}`),
    {
      authoritySlices: [authoritySlice],
      expectedTaskId: taskId,
      newAuthoring: true,
      strict: true,
      workflowRoot: "relative-workflow-root",
    },
  );
  assert.equal(relativeRootLint.ok, false);
  assert.ok(relativeRootLint.diagnostics.some((item) => (
    item.code === "AUTHORITY_SLICE_INVALID" && /absolute canonical directory/.test(item.message)
  )));

  const briefMarkdown = path.join(authoritySlice, "brief.md");
  const regularBriefMarkdown = path.join(authoritySlice, "brief.real.md");
  fs.renameSync(briefMarkdown, regularBriefMarkdown);
  fs.symlinkSync("brief.real.md", briefMarkdown);
  try {
    assert.throws(() => snapshotAuthoritySlices([authoritySlice], {
      workflowRoot: environment.CODEX_WORKFLOW_ROOT,
      expectedTaskId: taskId,
    }), /brief\.md is missing or cannot be opened safely|non-symlink/);
  } finally {
    fs.unlinkSync(briefMarkdown);
    fs.renameSync(regularBriefMarkdown, briefMarkdown);
  }
  fs.renameSync(briefMarkdown, regularBriefMarkdown);
  try {
    assert.throws(() => snapshotAuthoritySlices([authoritySlice], {
      workflowRoot: environment.CODEX_WORKFLOW_ROOT,
      expectedTaskId: taskId,
    }), /brief\.md is missing/);
  } finally {
    fs.renameSync(regularBriefMarkdown, briefMarkdown);
  }

  const constraintsPath = path.join(
    taskArtifactDir(paths, taskId), "team/sdd/global-constraints.md",
  );
  const originalLstat = fs.lstatSync;
  let injected = false;
  fs.lstatSync = function lstatWithAppearance(file, ...args) {
    if (!injected && path.resolve(file) === constraintsPath) {
      injected = true;
      fs.writeFileSync(constraintsPath, "# Appeared during validation\n", "utf8");
    }
    return originalLstat.call(this, file, ...args);
  };
  try {
    assert.throws(() => snapshotAuthoritySlices([authoritySlice], {
      workflowRoot: environment.CODEX_WORKFLOW_ROOT,
      expectedTaskId: taskId,
    }), /global-constraints\.md appeared while authority was being validated/);
  } finally {
    fs.lstatSync = originalLstat;
  }
});
