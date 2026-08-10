"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const {
  authoritativeEventDigest,
  readAuthoritativeEvents,
} = require(path.join(ROOT, "workflow/bin/lib/codex-workflow/core/event-store"));
const { resolvePaths } = require(path.join(
  ROOT, "workflow/bin/lib/codex-workflow/core/paths",
));
const { mutateTaskRuntime, taskEventFile } = require(path.join(
  ROOT, "workflow/bin/lib/codex-workflow/core/task-mutation",
));
const { createTask, startTask } = require(path.join(
  ROOT, "workflow/bin/lib/codex-workflow/task/lifecycle",
));
const {
  applyAuthorityTransition,
  sha256Canonical,
} = require(path.join(ROOT, "workflow/bin/lib/codex-workflow/team/execution-grant"));

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;

function requiredSlice(sliceId, dependsOn) {
  return {
    slice_id: sliceId,
    objective: `Implement ${sliceId}.`,
    brief_path: `team/sdd/slices/${sliceId}/brief.json`,
    brief_sha256: DIGEST_A,
    depends_on: dependsOn,
    keeper_outputs: [`keeper:${sliceId}`],
    owned_paths: [`src/${sliceId}.js`],
    forbidden_paths: ["forbidden/**"],
    acceptance_refs: [`AC-${sliceId.toUpperCase()}`],
    estimate: {
      estimated_changed_files: 1,
      estimated_net_loc: 10,
      target_p90_minutes: 10,
      serial_dependency_depth: dependsOn.length > 0 ? 1 : 0,
      independent_vertical_count: 1,
    },
    budget: {
      max_changed_files: 2,
      max_loc: 20,
      max_wall_clock_minutes: 20,
      max_required_checks: 1,
    },
    checks: [{
      check_id: `check-${sliceId}`,
      gate_class: "contract",
      command: `node --check src/${sliceId}.js`,
      final_only: false,
      cache_policy: "identity-bound",
      release_requirement: null,
    }],
  };
}

function executionScope(taskId, { cyclic = false } = {}) {
  const scope = {
    schema_version: 1,
    grant_id: "grant-cycle",
    task_id: taskId,
    repo: { realpath: "/tmp/atlas-cycle-repo", base_sha: "c".repeat(40) },
    objective: "Implement a.",
    contract: {
      path: "implementation-contract.task-cycle.final.md",
      sha256: DIGEST_A,
      semantics_version: 5,
      authority_slices: [{
        path: "/tmp/atlas-cycle-authority/slice-a",
        task_id: taskId,
        slice_id: "authority-a",
        brief_json_sha256: DIGEST_A,
        brief_md_sha256: DIGEST_B,
        evidence_manifest_sha256: null,
        review_verdict_sha256: null,
        controller_resolution_sha256: null,
        global_constraints_sha256: null,
      }],
    },
    execution_plan: { schema_version: 3, sha256: DIGEST_B },
    owned_paths: ["src/a.js", "src/b.js"],
    forbidden_paths: ["forbidden/**"],
    required_slices: [
      requiredSlice("a", cyclic ? ["b"] : []),
      requiredSlice("b", ["a"]),
    ],
    size_exceptions: [],
    scope_core_digest: "",
    authorization_provenance: {
      kind: "user-message",
      ref: "user-message:cycle-grant",
    },
    release_binding: null,
    parent: null,
    supersedes_grant_id: null,
    evidence_policy: { mode: "invalidate-incompatible", retained_receipt_ids: [] },
    design_handoff: null,
    first_code: null,
  };
  const core = { ...scope, size_exceptions: [] };
  delete core.scope_core_digest;
  scope.scope_core_digest = sha256Canonical(core);
  return scope;
}

function temporaryWorkflow(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-grant-reducer."));
  const root = path.join(home, "workflow");
  const environment = {
    ...process.env,
    CODEX_HOME_ROOT: home,
    CODEX_WORKFLOW_ROOT: root,
    TMPDIR: path.join(home, "tmp"),
  };
  fs.mkdirSync(path.join(root, "templates"), { recursive: true });
  fs.copyFileSync(
    path.join(ROOT, "workflow/templates/task.md"),
    path.join(root, "templates/task.md"),
  );
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return { environment, home, paths: resolvePaths(environment) };
}

function issueSyntheticGrant(environment, paths, taskId) {
  const scope = executionScope(taskId);
  const grant = {
    schema_version: 1,
    grant_id: scope.grant_id,
    status: "active",
    scope_digest: sha256Canonical(scope),
    scope,
    evidence_epoch: 1,
    authorization_provenance: { ...scope.authorization_provenance },
    issued_at: "2026-08-10T00:00:02Z",
    issued_revision: 3,
    terminal: null,
  };
  const authorityTransition = {
    schema_version: 1,
    type: "grant-issued",
    revision: 3,
    grant,
    delivery_authority: null,
  };
  const data = {
    authorization_ref: grant.authorization_provenance.ref,
    brief_path: path.join(
      paths.artifactsDir, taskId, scope.required_slices[0].brief_path,
    ),
    grant_id: grant.grant_id,
    objective: grant.scope.objective,
    expected_scope_digest: "",
  };
  return mutateTaskRuntime(
    paths,
    taskId,
    { kind: "authority.grant.issued", operationId: "authorize-cycle", data },
    ({ currentProjection }) => ({
      authorityTransition,
      projection: {
        task_content: currentProjection.task_content,
        state: {
          ...currentProjection.state,
          execution_authority: applyAuthorityTransition(null, authorityTransition),
        },
      },
      result: {
        grant,
        grant_id: grant.grant_id,
        scope_digest: grant.scope_digest,
        evidence_epoch: grant.evidence_epoch,
      },
      legacy: [],
    }),
    {
      clock: () => new Date("2026-08-10T00:00:02.000Z"),
      environment,
    },
  );
}

test("authoritative event replay accepts a DAG and rejects a digest-correct multi-slice cycle", (t) => {
  const { environment, home, paths } = temporaryWorkflow(t);
  const taskId = createTask("Grant reducer cycle", "reject cyclic execution scope", {
    clock: () => new Date("2026-08-10T00:00:00.000Z"),
    environment,
  });
  startTask(taskId, {
    clock: () => new Date("2026-08-10T00:00:01.000Z"),
    environment,
  });
  issueSyntheticGrant(environment, paths, taskId);
  const valid = readAuthoritativeEvents(
    taskEventFile(paths, taskId),
    taskId,
  );
  assert.equal(valid.length, 3);

  const cyclic = structuredClone(valid);
  const event = cyclic.at(-1);
  const grant = event.authority_transition.grant;
  grant.scope.required_slices[0].depends_on = ["b"];
  const core = { ...grant.scope, size_exceptions: [] };
  delete core.scope_core_digest;
  grant.scope.scope_core_digest = sha256Canonical(core);
  grant.scope_digest = sha256Canonical(grant.scope);
  event.projection.state.execution_authority.grants = [structuredClone(grant)];
  event.result.grant = structuredClone(grant);
  event.result.scope_digest = grant.scope_digest;
  event.event_digest = authoritativeEventDigest(event);
  const file = path.join(home, "cyclic-events-v2.jsonl");
  fs.writeFileSync(file, `${cyclic.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  assert.throws(
    () => readAuthoritativeEvents(file, taskId),
    /required_slices contains a dependency cycle/,
  );
});
