"use strict";

const crypto = require("crypto");
const path = require("path");

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const AUTHORITY_REF = /^(user-message|operator-input):[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const CANONICAL_UTC = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/;
const ACTIVE_GRANT_STATES = new Set(["issued", "active"]);
const TERMINAL_GRANT_STATES = new Set(["completed", "revoked", "superseded"]);
const RELEASE_REQUIREMENT_KEYS = [
  "profile_ref", "profile_sha256", "requirement_ref", "requirement_sha256",
  "dimension", "required", "waiver_policy", "definition_ref", "definition_sha256",
  "collector_adapter_ref", "collector_adapter_sha256", "fact_schema_ref",
  "fact_schema_sha256", "evaluator_ref", "evaluator_sha256", "pass_rule_sha256",
  "required_candidate_components",
];
const DESIGN_HANDOFF_KEYS = [
  "status", "task_id", "designed_feature_target", "context_path", "context_sha256",
  "context_identity", "scenario_path", "scenario_sha256", "scenario_identity",
  "scenario_approval_ref", "flow_path", "flow_sha256", "flow_identity",
  "flow_approval_ref", "handoff_path", "handoff_sha256",
];
const FIRST_CODE_BINDING_KEYS = [
  "status", "contract_sha256", "first_code_slice_id", "verification_check_id",
  "stop_before_slice_id",
];

class ExecutionGrantError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExecutionGrantError";
  }
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256Canonical(value) {
  return `sha256:${crypto.createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ExecutionGrantError(`${label} must be an object`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw new ExecutionGrantError(`${label} is missing ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new ExecutionGrantError(`${label} has unknown key ${key}`);
  }
}

function canonicalUtc(value, label) {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString().replace(".000Z", "Z") !== value) {
    throw new ExecutionGrantError(`${label} must use canonical UTC YYYY-MM-DDTHH:mm:ssZ`);
  }
}

function nonEmpty(value, label) {
  if (typeof value !== "string" || !value.trim() || /[\r\n\t]/.test(value)) {
    throw new ExecutionGrantError(`${label} must be a non-empty single-line string`);
  }
  return value;
}

function canonicalPath(value, label, { allowGlob = true } = {}) {
  nonEmpty(value, label);
  if (value !== value.normalize("NFC") || /[^\x20-\x7e]/.test(value)
    || value.startsWith("/") || value.includes("\\") || value.includes("//")
    || value.startsWith("./") || value.endsWith("/")
    || value.split("/").some((part) => !part || part === "." || part === "..")
    || (!allowGlob && /[*?\[\]{}]/.test(value))) {
    throw new ExecutionGrantError(`${label} must be an exact canonical ASCII POSIX relative path`);
  }
  return value;
}

function canonicalSet(values, label, validator = nonEmpty) {
  if (!Array.isArray(values)) throw new ExecutionGrantError(`${label} must be an array`);
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    validator(value, `${label}[${index}]`);
    if (seen.has(value)) throw new ExecutionGrantError(`${label} contains duplicate value ${value}`);
    seen.add(value);
  }
  const sorted = [...values].sort();
  if (!same(values, sorted)) throw new ExecutionGrantError(`${label} is not in canonical set order`);
  return values;
}

function validateReleaseRequirement(value, label) {
  exactKeys(value, RELEASE_REQUIREMENT_KEYS, label);
  for (const field of ["profile_ref", "requirement_ref"]) {
    if (!SAFE_ID.test(value[field] || "")) {
      throw new ExecutionGrantError(`${label} ${field} is invalid`);
    }
  }
  for (const field of [
    "profile_sha256", "requirement_sha256", "definition_sha256",
    "collector_adapter_sha256", "fact_schema_sha256", "evaluator_sha256",
    "pass_rule_sha256",
  ]) {
    if (!DIGEST.test(value[field] || "")) {
      throw new ExecutionGrantError(`${label} ${field} digest is invalid`);
    }
  }
  for (const field of [
    "dimension", "definition_ref", "collector_adapter_ref", "fact_schema_ref", "evaluator_ref",
  ]) nonEmpty(value[field], `${label} ${field}`);
  if (value.required !== true || value.waiver_policy !== "never") {
    throw new ExecutionGrantError(`${label} must be required with waiver_policy never`);
  }
  canonicalSet(
    value.required_candidate_components,
    `${label} required_candidate_components`,
  );
  return value;
}

function validateAuthorityIdentities(values, taskId) {
  if (!Array.isArray(values) || values.length === 0 || values.length > 64) {
    throw new ExecutionGrantError("execution scope authority_slices must contain 1-64 identities");
  }
  let previous = "";
  for (const [index, value] of values.entries()) {
    const label = `execution scope authority_slices[${index}]`;
    exactKeys(value, [
      "path", "task_id", "slice_id", "brief_json_sha256", "brief_md_sha256",
      "evidence_manifest_sha256", "review_verdict_sha256",
      "controller_resolution_sha256", "global_constraints_sha256",
    ], label);
    if (typeof value.path !== "string" || !path.isAbsolute(value.path)
      || path.resolve(value.path) !== value.path || value.path !== value.path.normalize("NFC")
      || /[^\x20-\x7e]/.test(value.path) || value.path <= previous) {
      throw new ExecutionGrantError(`${label} path is not canonical, unique, and sorted`);
    }
    previous = value.path;
    if (value.task_id !== taskId || !SAFE_ID.test(value.slice_id || "")) {
      throw new ExecutionGrantError(`${label} task or slice identity is invalid`);
    }
    for (const field of ["brief_json_sha256", "brief_md_sha256"]) {
      if (!DIGEST.test(value[field] || "")) throw new ExecutionGrantError(`${label} ${field} is invalid`);
    }
    for (const field of [
      "evidence_manifest_sha256", "review_verdict_sha256",
      "controller_resolution_sha256", "global_constraints_sha256",
    ]) {
      if (value[field] !== null && !DIGEST.test(value[field] || "")) {
        throw new ExecutionGrantError(`${label} ${field} is invalid`);
      }
    }
    if ((value.review_verdict_sha256 === null) !== (value.controller_resolution_sha256 === null)) {
      throw new ExecutionGrantError(`${label} verdict/resolution presence is invalid`);
    }
  }
}

function validateDesignHandoffBinding(value, scope) {
  if (value === null) return null;
  if (value?.status === "not_applicable") {
    exactKeys(value, ["status", "reason", "contract_sha256"], "execution design_handoff");
    nonEmpty(value.reason, "execution design_handoff reason");
    if (value.contract_sha256 !== scope.contract.sha256) {
      throw new ExecutionGrantError("execution design_handoff not-applicable binding is stale");
    }
    return value;
  }
  exactKeys(value, DESIGN_HANDOFF_KEYS, "execution design_handoff");
  if (value.status !== "approved" || value.task_id !== scope.task_id
    || !new Set(["product_increment", "product_release"]).has(value.designed_feature_target)) {
    throw new ExecutionGrantError("execution design_handoff approved identity is invalid");
  }
  for (const field of ["context_path", "scenario_path", "flow_path", "handoff_path"]) {
    canonicalPath(value[field], `execution design_handoff ${field}`, { allowGlob: false });
  }
  for (const field of [
    "context_sha256", "context_identity", "scenario_sha256", "scenario_identity",
    "flow_sha256", "flow_identity", "handoff_sha256",
  ]) {
    if (!DIGEST.test(value[field] || "")) {
      throw new ExecutionGrantError(`execution design_handoff ${field} is invalid`);
    }
  }
  authorityRef(value.scenario_approval_ref, "execution design_handoff scenario approval");
  authorityRef(value.flow_approval_ref, "execution design_handoff flow approval");
  return value;
}

function dependsTransitively(slicesById, sliceId, dependencyId, visited = new Set()) {
  if (sliceId === dependencyId) return true;
  if (visited.has(sliceId)) return false;
  visited.add(sliceId);
  return (slicesById.get(sliceId)?.depends_on || [])
    .some((candidate) => dependsTransitively(slicesById, candidate, dependencyId, visited));
}

function validateFirstCodeBinding(value, scope) {
  if (value === null) return null;
  if (value?.status === "not_applicable") {
    exactKeys(value, ["status", "reason", "contract_sha256"], "execution first_code");
    nonEmpty(value.reason, "execution first_code reason");
    if (value.contract_sha256 !== scope.contract.sha256) {
      throw new ExecutionGrantError("execution first_code not-applicable binding is stale");
    }
    return value;
  }
  exactKeys(value, FIRST_CODE_BINDING_KEYS, "execution first_code");
  if (value.status !== "required" || value.contract_sha256 !== scope.contract.sha256) {
    throw new ExecutionGrantError("execution first_code required identity is invalid");
  }
  for (const field of [
    "first_code_slice_id", "verification_check_id", "stop_before_slice_id",
  ]) {
    if (!SAFE_ID.test(value[field] || "")) {
      throw new ExecutionGrantError(`execution first_code ${field} is invalid`);
    }
  }
  const slicesById = new Map(scope.required_slices.map((slice, index) => [
    slice.slice_id, { ...slice, index },
  ]));
  const first = slicesById.get(value.first_code_slice_id);
  if (!first || !first.checks.some((check) => check.check_id === value.verification_check_id)) {
    throw new ExecutionGrantError("execution first_code slice/check binding is invalid");
  }
  if (value.stop_before_slice_id !== "task-completion") {
    const stop = slicesById.get(value.stop_before_slice_id);
    if (!stop || stop.index <= first.index
      || !dependsTransitively(slicesById, stop.slice_id, first.slice_id)) {
      throw new ExecutionGrantError("execution first_code stop slice binding is invalid");
    }
  }
  return value;
}

function validateScope(scope, grantId) {
  exactKeys(scope, [
    "schema_version", "grant_id", "task_id", "repo", "objective", "contract",
    "execution_plan", "owned_paths", "forbidden_paths", "required_slices",
    "size_exceptions", "scope_core_digest", "authorization_provenance", "release_binding",
    "parent", "supersedes_grant_id", "evidence_policy", "design_handoff", "first_code",
  ], "execution scope");
  if (scope.schema_version !== 1 || scope.grant_id !== grantId || !SAFE_ID.test(scope.task_id || "")) {
    throw new ExecutionGrantError("execution scope identity is invalid");
  }
  exactKeys(scope.repo, ["realpath", "base_sha"], "execution scope repo");
  if (typeof scope.repo.realpath !== "string" || !scope.repo.realpath.startsWith("/")
    || scope.repo.realpath !== scope.repo.realpath.normalize("NFC")
    || !/^[a-f0-9]{40}$/.test(scope.repo.base_sha || "")) {
    throw new ExecutionGrantError("execution scope repository identity is invalid");
  }
  nonEmpty(scope.objective, "execution scope objective");
  exactKeys(scope.contract, ["path", "sha256", "semantics_version", "authority_slices"], "execution scope contract");
  canonicalPath(scope.contract.path, "execution scope contract path", { allowGlob: false });
  if (!DIGEST.test(scope.contract.sha256 || "")
    || !new Set([5, 6]).has(scope.contract.semantics_version)) {
    throw new ExecutionGrantError("execution scope contract identity is invalid");
  }
  validateAuthorityIdentities(scope.contract.authority_slices, scope.task_id);
  exactKeys(scope.execution_plan, ["schema_version", "sha256"], "execution scope plan");
  const expectedPlanVersion = scope.contract.semantics_version === 6 ? 4 : 3;
  if (scope.execution_plan.schema_version !== expectedPlanVersion
    || !DIGEST.test(scope.execution_plan.sha256 || "")) {
    throw new ExecutionGrantError("execution scope contract/plan version matrix is invalid");
  }
  canonicalSet(scope.owned_paths, "execution scope owned_paths", canonicalPath);
  canonicalSet(scope.forbidden_paths, "execution scope forbidden_paths", canonicalPath);
  if (!Array.isArray(scope.required_slices) || scope.required_slices.length === 0) {
    throw new ExecutionGrantError("execution scope required_slices must be non-empty");
  }
  const sliceIds = new Set();
  const checkIds = new Set();
  const releaseRequirements = [];
  for (const [sliceIndex, slice] of scope.required_slices.entries()) {
    const label = `execution scope required_slices[${sliceIndex}]`;
    exactKeys(slice, [
      "slice_id", "objective", "brief_path", "brief_sha256", "depends_on",
      "keeper_outputs", "owned_paths", "forbidden_paths", "acceptance_refs",
      "estimate", "budget", "checks",
    ], label);
    if (!SAFE_ID.test(slice.slice_id || "") || sliceIds.has(slice.slice_id)) {
      throw new ExecutionGrantError(`${label} slice_id is invalid or duplicate`);
    }
    sliceIds.add(slice.slice_id);
    nonEmpty(slice.objective, `${label} objective`);
    canonicalPath(slice.brief_path, `${label} brief_path`, { allowGlob: false });
    if (!DIGEST.test(slice.brief_sha256 || "")) {
      throw new ExecutionGrantError(`${label} brief digest is invalid`);
    }
    canonicalSet(slice.depends_on, `${label} depends_on`);
    canonicalSet(slice.keeper_outputs, `${label} keeper_outputs`);
    canonicalSet(slice.owned_paths, `${label} owned_paths`, canonicalPath);
    canonicalSet(slice.forbidden_paths, `${label} forbidden_paths`, canonicalPath);
    canonicalSet(slice.acceptance_refs, `${label} acceptance_refs`);
    exactKeys(slice.estimate, [
      "estimated_changed_files", "estimated_net_loc", "target_p90_minutes",
      "serial_dependency_depth", "independent_vertical_count",
    ], `${label} estimate`);
    exactKeys(slice.budget, [
      "max_changed_files", "max_loc", "max_wall_clock_minutes", "max_required_checks",
    ], `${label} budget`);
    for (const [field, value] of Object.entries(slice.estimate)) {
      if (!Number.isInteger(value) || value < (field === "serial_dependency_depth" ? 0 : 1)) {
        throw new ExecutionGrantError(`${label} estimate ${field} is invalid`);
      }
    }
    for (const [field, value] of Object.entries(slice.budget)) {
      if (!Number.isInteger(value) || value < 1) {
        throw new ExecutionGrantError(`${label} budget ${field} is invalid`);
      }
    }
    if (!Array.isArray(slice.checks) || slice.checks.length === 0) {
      throw new ExecutionGrantError(`${label} checks must be non-empty`);
    }
    for (const [checkIndex, check] of slice.checks.entries()) {
      const checkLabel = `${label} checks[${checkIndex}]`;
      exactKeys(check, [
        "check_id", "gate_class", "command", "final_only", "cache_policy",
        "release_requirement",
      ], checkLabel);
      if (!SAFE_ID.test(check.check_id || "") || checkIds.has(check.check_id)) {
        throw new ExecutionGrantError(`${checkLabel} check_id is invalid or duplicate`);
      }
      checkIds.add(check.check_id);
      nonEmpty(check.gate_class, `${checkLabel} gate_class`);
      nonEmpty(check.command, `${checkLabel} command`);
      nonEmpty(check.cache_policy, `${checkLabel} cache_policy`);
      if (typeof check.final_only !== "boolean") {
        throw new ExecutionGrantError(`${checkLabel} is invalid`);
      }
      if (check.release_requirement !== null) {
        validateReleaseRequirement(check.release_requirement, `${checkLabel} release_requirement`);
        releaseRequirements.push(check.release_requirement);
      }
    }
  }
  for (const slice of scope.required_slices) {
    if (slice.depends_on.some((dependency) => (
      dependency === slice.slice_id || !sliceIds.has(dependency)
    ))) {
      throw new ExecutionGrantError(`execution scope slice ${slice.slice_id} has an invalid dependency`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const slicesById = new Map(scope.required_slices.map((slice) => [slice.slice_id, slice]));
  function visitSlice(sliceId) {
    if (visiting.has(sliceId)) {
      throw new ExecutionGrantError(`execution scope required_slices contains a dependency cycle at ${sliceId}`);
    }
    if (visited.has(sliceId)) return;
    visiting.add(sliceId);
    for (const dependency of slicesById.get(sliceId).depends_on) visitSlice(dependency);
    visiting.delete(sliceId);
    visited.add(sliceId);
  }
  for (const slice of scope.required_slices) visitSlice(slice.slice_id);
  const ownedUnion = [...new Set(scope.required_slices.flatMap((slice) => slice.owned_paths))]
    .sort();
  const forbiddenUnion = [...new Set(scope.required_slices.flatMap((slice) => slice.forbidden_paths))]
    .sort();
  if (!same(scope.owned_paths, ownedUnion) || !same(scope.forbidden_paths, forbiddenUnion)) {
    throw new ExecutionGrantError("execution scope top-level paths do not equal the slice union");
  }
  const provenance = authorityRef(
    scope.authorization_provenance?.ref,
    "execution scope authorization provenance",
  );
  if (!same(provenance, scope.authorization_provenance)) {
    throw new ExecutionGrantError("execution scope authorization provenance is invalid");
  }
  if (scope.release_binding !== null
    && (!scope.release_binding || typeof scope.release_binding !== "object"
      || Array.isArray(scope.release_binding))) {
    throw new ExecutionGrantError("execution scope release binding is invalid");
  }
  if (scope.release_binding) {
    exactKeys(scope.release_binding, [
      "target_delivery_class", "intent_sha256", "profile_ref", "profile_sha256",
      "check_definition_set_sha256", "requirement_refs",
    ], "execution scope release binding");
    if (scope.release_binding.target_delivery_class !== "product_release"
      || !SAFE_ID.test(scope.release_binding.profile_ref || "")
      || !DIGEST.test(scope.release_binding.intent_sha256 || "")
      || !DIGEST.test(scope.release_binding.profile_sha256 || "")
      || !DIGEST.test(scope.release_binding.check_definition_set_sha256 || "")) {
      throw new ExecutionGrantError("execution scope release binding fields are invalid");
    }
    canonicalSet(
      scope.release_binding.requirement_refs,
      "execution scope release requirement refs",
    );
  }
  if (scope.contract.semantics_version === 6 !== Boolean(scope.release_binding)) {
    throw new ExecutionGrantError("execution scope release binding does not match contract semantics");
  }
  if (scope.contract.semantics_version === 5 && releaseRequirements.length > 0) {
    throw new ExecutionGrantError("ordinary execution scope cannot carry release requirements");
  }
  if (scope.release_binding) {
    const requirementRefs = [];
    for (const requirement of releaseRequirements) {
      if (requirement.profile_ref !== scope.release_binding.profile_ref
        || requirement.profile_sha256 !== scope.release_binding.profile_sha256) {
        throw new ExecutionGrantError("release requirement does not match the scope Profile binding");
      }
      requirementRefs.push(requirement.requirement_ref);
    }
    canonicalSet(
      requirementRefs.sort(),
      "execution scope projected release requirement refs",
    );
    if (!same(requirementRefs, scope.release_binding.requirement_refs)) {
      throw new ExecutionGrantError(
        "execution scope release requirements do not exactly cover the release binding",
      );
    }
  }
  if (scope.parent === null || scope.supersedes_grant_id === null) {
    if (scope.parent !== null || scope.supersedes_grant_id !== null) {
      throw new ExecutionGrantError("execution scope parent and supersedes must both be null or present");
    }
  } else {
    exactKeys(scope.parent, ["grant_id", "scope_digest"], "execution scope parent");
    if (!SAFE_ID.test(scope.parent.grant_id || "") || !DIGEST.test(scope.parent.scope_digest || "")
      || scope.parent.grant_id !== scope.supersedes_grant_id) {
      throw new ExecutionGrantError("execution scope parent/supersedes identity is invalid");
    }
  }
  exactKeys(scope.evidence_policy, ["mode", "retained_receipt_ids"], "execution evidence policy");
  if (!new Set(["invalidate-incompatible", "retain-compatible"]).has(scope.evidence_policy.mode)) {
    throw new ExecutionGrantError("execution evidence policy mode is invalid");
  }
  canonicalSet(scope.evidence_policy.retained_receipt_ids, "execution evidence retained receipts");
  if (scope.evidence_policy.mode === "invalidate-incompatible"
    && scope.evidence_policy.retained_receipt_ids.length > 0) {
    throw new ExecutionGrantError("invalidate-incompatible scope cannot retain evidence");
  }
  validateDesignHandoffBinding(scope.design_handoff, scope);
  validateFirstCodeBinding(scope.first_code, scope);
  if (scope.release_binding && (scope.design_handoff?.status !== "approved"
    || scope.design_handoff.designed_feature_target !== "product_release")) {
    throw new ExecutionGrantError(
      "product_release scope requires an approved product_release Design Handoff",
    );
  }
  if (!scope.release_binding && scope.design_handoff?.status === "approved"
    && scope.design_handoff.designed_feature_target !== "product_increment") {
    throw new ExecutionGrantError(
      "ordinary execution scope may only bind a product_increment Design Handoff",
    );
  }
  if (!DIGEST.test(scope.scope_core_digest || "")) {
    throw new ExecutionGrantError("execution scope core digest is invalid");
  }
  const core = { ...scope, size_exceptions: [] };
  delete core.scope_core_digest;
  if (scope.scope_core_digest !== sha256Canonical(core)) {
    throw new ExecutionGrantError("execution scope core digest does not match its canonical preimage");
  }
  if (!Array.isArray(scope.size_exceptions)) {
    throw new ExecutionGrantError("execution scope size_exceptions must be an array");
  }
  let previousSlice = "";
  for (const [index, exception] of scope.size_exceptions.entries()) {
    const label = `execution scope size_exceptions[${index}]`;
    exactKeys(exception, [
      "task_id", "slice_id", "grant_id", "scope_core_digest", "authority",
      "expires_at", "reason", "compensating_controls",
    ], label);
    if (exception.task_id !== scope.task_id || exception.grant_id !== grantId
      || !sliceIds.has(exception.slice_id) || exception.scope_core_digest !== scope.scope_core_digest
      || (previousSlice && previousSlice >= exception.slice_id)) {
      throw new ExecutionGrantError(`${label} binding or canonical order is invalid`);
    }
    previousSlice = exception.slice_id;
    if (!same(exception.authority, provenance)) {
      throw new ExecutionGrantError(`${label} authority binding is invalid`);
    }
    canonicalUtc(exception.expires_at, `${label} expires_at`);
    nonEmpty(exception.reason, `${label} reason`);
    canonicalSet(exception.compensating_controls, `${label} compensating_controls`);
  }
  return scope;
}

function scopeDelta(left, right) {
  const changes = [];
  function visit(location, before, after) {
    if (same(before, after)) return;
    const beforeObject = before && typeof before === "object";
    const afterObject = after && typeof after === "object";
    if (Array.isArray(before) && Array.isArray(after)) {
      const length = Math.max(before.length, after.length);
      for (let index = 0; index < length; index += 1) {
        visit(`${location}[${index}]`, before[index], after[index]);
      }
      return;
    }
    if (beforeObject && afterObject && !Array.isArray(before) && !Array.isArray(after)) {
      const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
      for (const key of keys) visit(location ? `${location}.${key}` : key, before[key], after[key]);
      return;
    }
    changes.push({
      path: location,
      before: before === undefined ? null : clone(before),
      after: after === undefined ? null : clone(after),
    });
  }
  visit("", left, right);
  return changes;
}

function authorityRef(value, label) {
  if (typeof value !== "string" || !AUTHORITY_REF.test(value)) {
    throw new ExecutionGrantError(`${label} must be a controller-recordable user-message: or operator-input: ref`);
  }
  return { kind: value.slice(0, value.indexOf(":")), ref: value };
}

function validateGrant(grant, { initial = false } = {}) {
  if (!grant || typeof grant !== "object" || Array.isArray(grant) || grant.schema_version !== 1) {
    throw new ExecutionGrantError("execution grant schema version 1 is required");
  }
  if (!SAFE_ID.test(grant.grant_id || "")) throw new ExecutionGrantError("execution grant_id is invalid");
  exactKeys(grant, [
    "schema_version", "grant_id", "status", "scope_digest", "scope", "evidence_epoch",
    "authorization_provenance", "issued_at", "issued_revision", "terminal",
  ], "execution grant");
  if (!new Set([...ACTIVE_GRANT_STATES, ...TERMINAL_GRANT_STATES]).has(grant.status)) {
    throw new ExecutionGrantError(`execution grant status is invalid: ${grant.status || "missing"}`);
  }
  if (initial && !ACTIVE_GRANT_STATES.has(grant.status)) {
    throw new ExecutionGrantError("new execution grants must be issued or active at controller issuance");
  }
  if (!DIGEST.test(grant.scope_digest || "") || !grant.scope || typeof grant.scope !== "object") {
    throw new ExecutionGrantError("execution grant scope identity is invalid");
  }
  if (grant.scope_digest !== sha256Canonical(grant.scope)) {
    throw new ExecutionGrantError("execution grant scope digest does not match its canonical JSON");
  }
  validateScope(grant.scope, grant.grant_id);
  if (grant.scope.grant_id !== grant.grant_id) {
    throw new ExecutionGrantError("execution grant scope grant_id mismatch");
  }
  if (!Number.isInteger(grant.evidence_epoch) || grant.evidence_epoch < 1) {
    throw new ExecutionGrantError("execution grant evidence_epoch is invalid");
  }
  const provenance = authorityRef(grant.authorization_provenance?.ref, "execution grant authorization");
  if (provenance.kind !== grant.authorization_provenance?.kind
    || !same(provenance, grant.scope.authorization_provenance)) {
    throw new ExecutionGrantError("execution grant authorization provenance mismatch");
  }
  if (!Number.isInteger(grant.issued_revision) || grant.issued_revision < 1) {
    throw new ExecutionGrantError("execution grant issuance provenance is invalid");
  }
  canonicalUtc(grant.issued_at, "execution grant issued_at");
  if (ACTIVE_GRANT_STATES.has(grant.status) && grant.terminal !== null) {
    throw new ExecutionGrantError("active execution grant cannot carry terminal provenance");
  }
  if (TERMINAL_GRANT_STATES.has(grant.status)
    && (!grant.terminal || grant.terminal.status !== grant.status)) {
    throw new ExecutionGrantError("terminal execution grant is missing matching provenance");
  }
  if (grant.terminal) {
    exactKeys(grant.terminal, [
      "status", "occurred_at", "revision", "reason", "outcome", "superseded_by",
    ], "execution grant terminal provenance");
    canonicalUtc(grant.terminal.occurred_at, "execution grant terminal occurred_at");
    if (!Number.isInteger(grant.terminal.revision) || grant.terminal.revision < grant.issued_revision
      || !TERMINAL_GRANT_STATES.has(grant.terminal.status)
      || typeof grant.terminal.reason !== "string" || typeof grant.terminal.outcome !== "string"
      || typeof grant.terminal.superseded_by !== "string") {
      throw new ExecutionGrantError("execution grant terminal provenance is invalid");
    }
    if ((grant.status === "superseded"
      && !SAFE_ID.test(grant.terminal.superseded_by))
      || (grant.status !== "superseded" && grant.terminal.superseded_by !== "")) {
      throw new ExecutionGrantError("execution grant terminal supersedes provenance is invalid");
    }
  }
  return grant;
}

function initialFirstCodeState(grant) {
  if (grant.scope.first_code?.status !== "required") return null;
  return {
    schema_version: 1,
    grant_id: grant.grant_id,
    scope_digest: grant.scope_digest,
    evidence_epoch: grant.evidence_epoch,
    status: "active",
    receipt: null,
    pause: null,
  };
}

function validateFirstCodeState(authority) {
  const state = authority.first_code;
  const current = currentGrant(authority);
  const binding = current?.scope?.first_code;
  if (!state) {
    if (binding?.status === "required") {
      throw new ExecutionGrantError("execution authority is missing first-code runtime state");
    }
    return null;
  }
  exactKeys(state, [
    "schema_version", "grant_id", "scope_digest", "evidence_epoch", "status",
    "receipt", "pause",
  ], "first-code runtime state");
  const grant = (authority.grants || []).find((candidate) => candidate.grant_id === state.grant_id);
  if (state.schema_version !== 1 || !grant || grant.scope.first_code?.status !== "required"
    || state.scope_digest !== grant.scope_digest || state.evidence_epoch !== grant.evidence_epoch
    || (current && current.grant_id !== grant.grant_id)
    || !new Set(["active", "satisfied", "paused-replan-required"]).has(state.status)) {
    throw new ExecutionGrantError("first-code runtime state identity is invalid");
  }
  if (state.status === "active") {
    if (state.receipt !== null || state.pause !== null) {
      throw new ExecutionGrantError("active first-code state cannot carry a terminal receipt");
    }
  } else if (state.status === "satisfied") {
    exactKeys(state.receipt, [
      "acceptance_operation_id", "accepted_revision", "verification_record_id",
      "verification_revision",
    ], "first-code satisfaction receipt");
    if (!SAFE_ID.test(state.receipt.acceptance_operation_id || "")
      || !Number.isInteger(state.receipt.accepted_revision)
      || state.receipt.accepted_revision < 1
      || !DIGEST.test(state.receipt.verification_record_id || "")
      || !Number.isInteger(state.receipt.verification_revision)
      || state.receipt.verification_revision >= state.receipt.accepted_revision
      || state.pause !== null) {
      throw new ExecutionGrantError("first-code satisfaction receipt is invalid");
    }
  } else {
    exactKeys(state.pause, ["operation_id", "revision", "target", "reason"], "first-code pause");
    if (!SAFE_ID.test(state.pause.operation_id || "")
      || !Number.isInteger(state.pause.revision) || state.pause.revision < grant.issued_revision
      || !SAFE_ID.test(state.pause.target || "") || !state.pause.reason
      || state.receipt !== null) {
      throw new ExecutionGrantError("first-code pause receipt is invalid");
    }
  }
  return state;
}

function replannedFirstCodeState(authority, transition) {
  const next = initialFirstCodeState(transition.new_grant);
  if (!next) return null;
  const previous = authority.first_code;
  const retained = new Set(transition.evidence.retained.map((item) => item.receipt_id));
  if (previous?.status === "satisfied"
    && same(currentGrant(authority)?.scope.first_code, transition.new_grant.scope.first_code)
    && retained.has(previous.receipt.acceptance_operation_id)) {
    return {
      ...next,
      status: "satisfied",
      receipt: clone(previous.receipt),
    };
  }
  return next;
}

function firstCodeBoundary(authority, target) {
  const grant = currentGrant(authority);
  const binding = grant?.scope?.first_code;
  if (!grant || binding?.status !== "required") return { blocked: false };
  const state = validateFirstCodeState(authority);
  if (state.status === "satisfied") return { blocked: false, grant, state };
  if (state.status === "paused-replan-required") {
    return { blocked: true, appendPause: false, grant, state };
  }
  if (target === "task-completion") {
    return { blocked: true, appendPause: true, grant, state };
  }
  const targetIndex = grant.scope.required_slices.findIndex((slice) => slice.slice_id === target);
  if (targetIndex < 0) throw new ExecutionGrantError(`first-code target is outside scope: ${target}`);
  if (binding.stop_before_slice_id === "task-completion") {
    return { blocked: false, grant, state };
  }
  const stopIndex = grant.scope.required_slices.findIndex(
    (slice) => slice.slice_id === binding.stop_before_slice_id,
  );
  return {
    blocked: targetIndex >= stopIndex,
    appendPause: targetIndex >= stopIndex,
    grant,
    state,
  };
}

function applyFirstCodeEvent(current, event) {
  if (!current) return current;
  const authority = clone(current);
  const state = authority.first_code;
  if (!state) {
    if (event.kind === "authority.first-code.paused") {
      throw new ExecutionGrantError("first-code pause event lacks a required binding");
    }
    return validateAuthorityEnvelope(authority);
  }
  const grant = (authority.grants || []).find((candidate) => candidate.grant_id === state.grant_id);
  const binding = grant.scope.first_code;
  if (event.kind === "slice.accepted"
    && event.result?.accepted?.slice_id === binding.first_code_slice_id) {
    if (!new Set(["active", "satisfied"]).has(state.status)) {
      throw new ExecutionGrantError("first-code acceptance requires executable first-code state");
    }
    const accepted = event.result.accepted;
    const verification = (accepted.verification_records || []).find(
      (record) => record.check_id === binding.verification_check_id,
    );
    if (!verification || verification.outcome !== "passed"
      || !DIGEST.test(verification.record_id || "")
      || !Number.isInteger(verification.verification_revision)
      || accepted.operation_id !== event.operation_id || accepted.revision !== event.revision) {
      throw new ExecutionGrantError("first-code acceptance lacks its designated passed verification");
    }
    authority.first_code = {
      ...state,
      status: "satisfied",
      receipt: {
        acceptance_operation_id: accepted.operation_id,
        accepted_revision: event.revision,
        verification_record_id: verification.record_id,
        verification_revision: verification.verification_revision,
      },
    };
  } else if (event.kind === "slice.superseded"
    && event.data?.slice_id === binding.first_code_slice_id) {
    if (state.status !== "satisfied") {
      throw new ExecutionGrantError("first-code supersession requires a satisfied acceptance");
    }
    authority.first_code = {
      ...state,
      status: "paused-replan-required",
      receipt: null,
      pause: {
        operation_id: event.operation_id,
        revision: event.revision,
        target: binding.first_code_slice_id,
        reason: "first-code-acceptance-superseded",
      },
    };
  } else if (event.kind === "authority.first-code.paused") {
    exactKeys(event.data, [
      "grant_id", "scope_digest", "evidence_epoch", "first_code_slice_id",
      "stop_before_slice_id", "target", "reason",
    ], "authority.first-code.paused data");
    if (state.status !== "active" || event.data.grant_id !== state.grant_id
      || event.data.scope_digest !== state.scope_digest
      || event.data.evidence_epoch !== state.evidence_epoch
      || event.data.first_code_slice_id !== binding.first_code_slice_id
      || event.data.stop_before_slice_id !== binding.stop_before_slice_id
      || !firstCodeBoundary(authority, event.data.target).blocked
      || !event.data.reason) {
      throw new ExecutionGrantError("authority.first-code.paused does not match its active boundary");
    }
    authority.first_code = {
      ...state,
      status: "paused-replan-required",
      pause: {
        operation_id: event.operation_id,
        revision: event.revision,
        target: event.data.target,
        reason: event.data.reason,
      },
    };
    const expected = { first_code: authority.first_code };
    if (event.result !== undefined && !same(event.result, expected)) {
      throw new ExecutionGrantError("authority.first-code.paused result differs from its projection");
    }
  }
  return validateAuthorityEnvelope(authority);
}

function transitionFirstCodeState(state, event) {
  state.execution_authority = applyFirstCodeEvent(state.execution_authority, event);
  return state.execution_authority?.first_code || null;
}

function emptyAuthority(grant, deliveryAuthority) {
  const release = grant.scope.release_binding !== null;
  if (release && !deliveryAuthority) {
    throw new ExecutionGrantError("product_release grant requires immutable delivery authority");
  }
  if (!release && deliveryAuthority) {
    throw new ExecutionGrantError("ordinary execution grant cannot carry release delivery authority");
  }
  const firstCode = initialFirstCodeState(grant);
  return {
    schema_version: 2,
    formal_execution: true,
    formal_product_release: release,
    current_grant_id: grant.grant_id,
    grants: [clone(grant)],
    delivery_authority: deliveryAuthority ? clone(deliveryAuthority) : null,
    ...(firstCode ? { first_code: firstCode } : {}),
  };
}

function currentGrant(authority) {
  if (!authority || authority.schema_version !== 2 || !authority.current_grant_id) return null;
  return (authority.grants || []).find((grant) => grant.grant_id === authority.current_grant_id) || null;
}

function terminalGrant(grant, transition) {
  if (!ACTIVE_GRANT_STATES.has(grant.status)) {
    throw new ExecutionGrantError(`terminal grant cannot transition: ${grant.grant_id}=${grant.status}`);
  }
  if (!TERMINAL_GRANT_STATES.has(transition.status)) {
    throw new ExecutionGrantError(`invalid terminal grant transition: ${transition.status}`);
  }
  return {
    ...clone(grant),
    status: transition.status,
    terminal: {
      status: transition.status,
      occurred_at: transition.occurred_at,
      revision: transition.revision,
      reason: transition.reason || "",
      outcome: transition.outcome || "",
      superseded_by: transition.superseded_by || "",
    },
  };
}

function validateAuthorityEnvelope(authority) {
  if (!authority || authority.schema_version !== 2 || authority.formal_execution !== true
    || !Array.isArray(authority.grants) || authority.grants.length === 0
    || typeof authority.formal_product_release !== "boolean") {
    throw new ExecutionGrantError("execution authority schema version 2 is invalid");
  }
  const authorityKeys = [
    "schema_version", "formal_execution", "formal_product_release", "current_grant_id",
    "grants", "delivery_authority",
  ];
  for (const key of authorityKeys) {
    if (!Object.hasOwn(authority, key)) {
      throw new ExecutionGrantError(`execution authority is missing ${key}`);
    }
  }
  for (const key of Object.keys(authority)) {
    if (![...authorityKeys, "first_code"].includes(key)) {
      throw new ExecutionGrantError(`execution authority has unknown key ${key}`);
    }
  }
  const ids = new Set();
  const refs = new Set();
  let active = 0;
  for (const grant of authority.grants) {
    validateGrant(grant);
    if (ids.has(grant.grant_id)) throw new ExecutionGrantError(`duplicate execution grant: ${grant.grant_id}`);
    if (refs.has(grant.authorization_provenance.ref)) {
      throw new ExecutionGrantError(`execution authorization ref was reused: ${grant.authorization_provenance.ref}`);
    }
    ids.add(grant.grant_id);
    refs.add(grant.authorization_provenance.ref);
    if (ACTIVE_GRANT_STATES.has(grant.status)) active += 1;
  }
  if (authority.current_grant_id) {
    const current = currentGrant(authority);
    if (!current || !ACTIVE_GRANT_STATES.has(current.status) || active !== 1) {
      throw new ExecutionGrantError("execution authority current grant pointer is invalid");
    }
  } else if (active !== 0) {
    throw new ExecutionGrantError("execution authority has an unpointed active grant");
  }
  if (authority.formal_product_release !== Boolean(authority.grants[0].scope.release_binding)) {
    throw new ExecutionGrantError("execution authority release marker changed");
  }
  if (authority.formal_product_release && !authority.delivery_authority) {
    throw new ExecutionGrantError("execution authority is missing immutable delivery provenance");
  }
  if (!authority.formal_product_release && authority.delivery_authority !== null) {
    throw new ExecutionGrantError("ordinary execution authority carries release delivery provenance");
  }
  if (authority.delivery_authority) {
    exactKeys(authority.delivery_authority, [
      "kind", "ref", "established_revision", "contract_sha256",
      "execution_plan_sha256", "release_binding",
    ], "release delivery authority");
    const initial = authority.grants[0];
    const deliveryRef = authorityRef(authority.delivery_authority.ref, "release delivery authority");
    if (deliveryRef.kind !== authority.delivery_authority.kind
      || authority.delivery_authority.ref !== initial.authorization_provenance.ref
      || authority.delivery_authority.established_revision !== initial.issued_revision
      || authority.delivery_authority.contract_sha256 !== initial.scope.contract.sha256
      || authority.delivery_authority.execution_plan_sha256 !== initial.scope.execution_plan.sha256
      || !same(authority.delivery_authority.release_binding, initial.scope.release_binding)) {
      throw new ExecutionGrantError("release delivery authority is not immutable or exactly bound");
    }
  }
  validateFirstCodeState(authority);
  return authority;
}

function validateReplanEvidenceShape(transition) {
  exactKeys(transition.evidence, ["retained", "invalidated"], "replan evidence decisions");
  const decisions = [];
  for (const [disposition, expectedReason] of [
    ["retained", "explicit-compatible-retention"],
    ["invalidated", "grant-or-scope-superseded"],
  ]) {
    const values = transition.evidence[disposition];
    if (!Array.isArray(values)) {
      throw new ExecutionGrantError(`replan evidence ${disposition} decisions must be an array`);
    }
    for (const [index, decision] of values.entries()) {
      const label = `replan evidence ${disposition}[${index}]`;
      exactKeys(decision, ["receipt_id", "type", "reason"], label);
      nonEmpty(decision.receipt_id, `${label} receipt_id`);
      if (!new Set(["verification", "slice"]).has(decision.type)
        || decision.reason !== expectedReason) {
        throw new ExecutionGrantError(`${label} type or reason is invalid`);
      }
      decisions.push({ ...decision, disposition });
    }
  }
  const ids = decisions.map((decision) => decision.receipt_id);
  if (new Set(ids).size !== ids.length) {
    throw new ExecutionGrantError("replan evidence decisions contain a duplicate receipt");
  }
  const retainedIds = transition.evidence.retained
    .map((decision) => decision.receipt_id)
    .sort();
  if (!same(retainedIds, transition.evidence_policy.retained_receipt_ids)) {
    throw new ExecutionGrantError(
      "replan retained evidence decisions do not equal the canonical evidence policy",
    );
  }
  return decisions;
}

function projectedEvidenceReceipts(state) {
  const receipts = new Map();
  for (const gate of Object.values(state?.verification?.required_gates || {})) {
    if (gate?.record_id) receipts.set(gate.record_id, { type: "verification", value: gate });
  }
  for (const accepted of Object.values(state?.slice_acceptances || {})) {
    if (accepted?.operation_id && accepted.status === "accepted") {
      receipts.set(accepted.operation_id, { type: "slice", value: accepted });
    }
  }
  return receipts;
}

function sha256Text(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function compatibleRetainedGate(receipt, oldGrant, newGrant) {
  if (receipt.grant_id !== oldGrant.grant_id || receipt.scope_digest !== oldGrant.scope_digest
    || receipt.evidence_epoch !== oldGrant.evidence_epoch) return false;
  const oldSlice = oldGrant.scope.required_slices.find(
    (slice) => slice.slice_id === receipt.slice_id,
  );
  const newSlice = newGrant.scope.required_slices.find(
    (slice) => slice.slice_id === receipt.slice_id,
  );
  if (!oldSlice || !newSlice || !same(oldSlice, newSlice)) return false;
  const check = newSlice.checks.find((candidate) => candidate.check_id === receipt.check_id);
  return Boolean(check
    && receipt.brief_sha256 === newSlice.brief_sha256
    && receipt.contract_sha256 === newGrant.scope.contract.sha256
    && receipt.execution_plan_sha256 === newGrant.scope.execution_plan.sha256
    && receipt.gate_class === check.gate_class
    && receipt.command_digest === sha256Text(check.command)
    && receipt.cache_policy === check.cache_policy
    && receipt.final_only === check.final_only
    && same(receipt.release_requirement || null, check.release_requirement || null));
}

function compatibleRetainedSlice(receipt, oldGrant, newGrant, retainedIds) {
  if (receipt.grant_id !== oldGrant.grant_id || receipt.scope_digest !== oldGrant.scope_digest
    || receipt.evidence_epoch !== oldGrant.evidence_epoch) return false;
  const oldSlice = oldGrant.scope.required_slices.find(
    (slice) => slice.slice_id === receipt.slice_id,
  );
  const newSlice = newGrant.scope.required_slices.find(
    (slice) => slice.slice_id === receipt.slice_id,
  );
  if (!oldSlice || !newSlice || !same(oldSlice, newSlice)
    || receipt.brief_sha256 !== newSlice.brief_sha256
    || receipt.contract_sha256 !== newGrant.scope.contract.sha256
    || receipt.execution_plan_sha256 !== newGrant.scope.execution_plan.sha256) return false;
  return Array.isArray(receipt.verification_records)
    && receipt.verification_records.every((record) => (
      retainedIds.has(record.record_id)
      && compatibleRetainedGate(record, oldGrant, newGrant)
    ));
}

function reboundReceipt(receipt, oldGrant, newGrant, revision) {
  const source = {
    grant_id: oldGrant.grant_id,
    scope_digest: oldGrant.scope_digest,
    evidence_epoch: oldGrant.evidence_epoch,
  };
  const rebound = {
    ...clone(receipt),
    grant_id: newGrant.grant_id,
    scope_digest: newGrant.scope_digest,
    evidence_epoch: newGrant.evidence_epoch,
    origin_binding: clone(receipt.origin_binding || receipt.retained_from || source),
    retained_from: source,
    retention_history: [
      ...(receipt.retention_history || []),
      { ...source, retention_revision: revision },
    ],
    retention_revision: revision,
  };
  if (Array.isArray(rebound.verification_records)) {
    rebound.verification_records = rebound.verification_records.map((record) => (
      reboundReceipt(record, oldGrant, newGrant, revision)
    ));
  }
  return rebound;
}

function validateReplanRetentionCompatibility(previous, transition) {
  const oldAuthority = validateAuthorityEnvelope(previous.execution_authority);
  const oldGrant = currentGrant(oldAuthority);
  if (!oldGrant || oldGrant.grant_id !== transition.old_grant_id
    || oldGrant.scope_digest !== transition.old_scope_digest
    || oldGrant.evidence_epoch !== transition.old_evidence_epoch) {
    throw new ExecutionGrantError("replan prior grant identity is unavailable for evidence validation");
  }
  const retainedIds = new Set(
    transition.evidence.retained.map((decision) => decision.receipt_id),
  );
  for (const decision of transition.evidence.retained) {
    const receipt = projectedEvidenceReceipts(previous).get(decision.receipt_id);
    const compatible = decision.type === "verification"
      ? compatibleRetainedGate(receipt?.value || {}, oldGrant, transition.new_grant)
      : compatibleRetainedSlice(
        receipt?.value || {}, oldGrant, transition.new_grant, retainedIds,
      );
    if (!compatible) {
      throw new ExecutionGrantError(
        `replan retained evidence is incompatible with the new scope: ${decision.receipt_id}`,
      );
    }
  }
  const acceptedBySlice = new Map([...projectedEvidenceReceipts(previous)].flatMap(
    ([receiptId, receipt]) => receipt.type === "slice"
      ? [[receipt.value.slice_id, receiptId]]
      : [],
  ));
  for (const decision of transition.evidence.retained.filter((item) => item.type === "slice")) {
    const sliceId = projectedEvidenceReceipts(previous).get(decision.receipt_id).value.slice_id;
    const slice = transition.new_grant.scope.required_slices.find(
      (candidate) => candidate.slice_id === sliceId,
    );
    for (const dependency of slice.depends_on) {
      const dependencyReceipt = acceptedBySlice.get(dependency);
      if (!dependencyReceipt || !retainedIds.has(dependencyReceipt)) {
        throw new ExecutionGrantError(
          `replan retained slice ${sliceId} lacks retained transitive dependency ${dependency}`,
        );
      }
    }
  }
  return oldGrant;
}

function validateReplanEvidenceProjection(previousState, projectedState, transition) {
  const previous = projectedEvidenceReceipts(previousState);
  const decisions = validateReplanEvidenceShape(transition);
  const expectedIds = [...previous.keys()].sort();
  const decisionIds = decisions.map((decision) => decision.receipt_id)
    .sort();
  if (!same(expectedIds, decisionIds)) {
    throw new ExecutionGrantError(
      "replan evidence decisions do not cover the complete prior receipt set",
    );
  }
  for (const decision of decisions) {
    if (previous.get(decision.receipt_id)?.type !== decision.type) {
      throw new ExecutionGrantError(`replan evidence receipt type mismatch: ${decision.receipt_id}`);
    }
  }
  const oldGrant = validateReplanRetentionCompatibility(previousState, transition);
  const retained = new Set(transition.evidence.retained.map((decision) => decision.receipt_id));
  const indeterminateBindings = (previousState.verification?.operation_claims || [])
    .filter((claim) => claim?.status === "indeterminate"
      && claim.authority_identity?.grant_id === oldGrant.grant_id
      && claim.authority_identity?.scope_digest === oldGrant.scope_digest
      && claim.authority_identity?.evidence_epoch === oldGrant.evidence_epoch)
    .map((claim) => ({
      check_id: claim.required_check_binding?.check_id || "",
      slice_id: claim.required_check_binding?.slice_id || claim.authority_identity?.slice_id || "",
    }));
  const taintedCheckIds = new Set(indeterminateBindings.map((binding) => binding.check_id));
  const taintedSliceIds = new Set(indeterminateBindings.map((binding) => binding.slice_id));
  for (const receiptId of retained) {
    const receipt = previous.get(receiptId);
    const tainted = receipt?.type === "verification"
      ? taintedCheckIds.has(receipt.value.check_id)
      : taintedSliceIds.has(receipt?.value?.slice_id)
        || (receipt?.value?.verification_records || [])
          .some((record) => taintedCheckIds.has(record.check_id));
    if (tainted) {
      throw new ExecutionGrantError(
        `indeterminate verification evidence cannot be retained: ${receiptId}`,
      );
    }
  }
  const projected = projectedEvidenceReceipts(projectedState);
  const projectedIds = [...projected.keys()].sort();
  const retainedIds = [...retained].sort();
  if (!same(projectedIds, retainedIds)) {
    throw new ExecutionGrantError(
      "replan evidence projection does not contain exactly the retained receipts",
    );
  }
  for (const [receiptId, receipt] of projected) {
    if (receipt.value.grant_id !== transition.new_grant.grant_id
      || receipt.value.scope_digest !== transition.new_grant.scope_digest
      || receipt.value.evidence_epoch !== transition.new_grant.evidence_epoch) {
      throw new ExecutionGrantError(`retained evidence binding is stale: ${receiptId}`);
    }
    const expected = reboundReceipt(
      previous.get(receiptId).value,
      oldGrant,
      transition.new_grant,
      transition.revision,
    );
    if (!same(receipt.value, expected)) {
      throw new ExecutionGrantError(`retained evidence audit projection is invalid: ${receiptId}`);
    }
  }
  const histories = projectedState?.execution_evidence_history;
  const priorHistories = previousState?.execution_evidence_history || [];
  if (!Array.isArray(histories) || histories.length !== priorHistories.length + 1) {
    throw new ExecutionGrantError("replan evidence audit history was not appended exactly once");
  }
  if (!same(histories.slice(0, -1), priorHistories)) {
    throw new ExecutionGrantError("replan evidence audit history changed its prior prefix");
  }
  const history = histories.at(-1);
  exactKeys(history, [
    "schema_version", "old_grant_id", "new_grant_id", "revision", "receipts",
  ], "replan evidence audit history");
  if (history.schema_version !== 1
    || history.old_grant_id !== transition.old_grant_id
    || history.new_grant_id !== transition.new_grant.grant_id
    || history.revision !== transition.revision
    || !Array.isArray(history.receipts)) {
    throw new ExecutionGrantError("replan evidence audit history identity is invalid");
  }
  const audited = new Map();
  for (const [index, receipt] of history.receipts.entries()) {
    exactKeys(receipt, ["receipt_id", "type", "value"], `replan evidence audit receipt[${index}]`);
    if (audited.has(receipt.receipt_id)) {
      throw new ExecutionGrantError(`duplicate replan evidence audit receipt: ${receipt.receipt_id}`);
    }
    audited.set(receipt.receipt_id, receipt);
  }
  if (!same([...audited.keys()].sort(), expectedIds)) {
    throw new ExecutionGrantError("replan evidence audit history does not cover prior receipts");
  }
  for (const [receiptId, receipt] of previous) {
    const auditedReceipt = audited.get(receiptId);
    if (auditedReceipt.type !== receipt.type || !same(auditedReceipt.value, receipt.value)) {
      throw new ExecutionGrantError(`replan evidence audit value mismatch: ${receiptId}`);
    }
  }
}

function applyAuthorityTransition(current, transition) {
  if (!transition || transition.schema_version !== 1 || typeof transition.type !== "string") {
    throw new ExecutionGrantError("authority transition schema version 1 is required");
  }
  if (transition.type === "grant-issued") {
    exactKeys(transition, [
      "schema_version", "type", "revision", "grant", "delivery_authority",
    ], "grant-issued transition");
    if (current) throw new ExecutionGrantError("execution authority already exists; explicit replan is required");
    validateGrant(transition.grant, { initial: true });
    if (transition.grant.issued_revision !== transition.revision) {
      throw new ExecutionGrantError("execution grant issuance revision mismatch");
    }
    return validateAuthorityEnvelope(emptyAuthority(transition.grant, transition.delivery_authority));
  }
  const authority = validateAuthorityEnvelope(clone(current));
  const active = currentGrant(authority);
  if (!active) throw new ExecutionGrantError(`authority transition ${transition.type} requires an active grant`);
  if (active.grant_id !== transition.old_grant_id
    || active.scope_digest !== transition.old_scope_digest
    || active.evidence_epoch !== transition.old_evidence_epoch) {
    throw new ExecutionGrantError(`authority transition ${transition.type} old grant identity mismatch`);
  }
  if (transition.type === "grant-replanned") {
    exactKeys(transition, [
      "schema_version", "type", "revision", "occurred_at", "old_grant_id",
      "old_scope_digest", "old_evidence_epoch", "new_grant", "scope_delta",
      "evidence_policy", "evidence",
    ], "grant-replanned transition");
    canonicalUtc(transition.occurred_at, "grant-replanned occurred_at");
    validateGrant(transition.new_grant, { initial: true });
    if (transition.new_grant.issued_revision !== transition.revision
      || transition.new_grant.evidence_epoch !== active.evidence_epoch + 1) {
      throw new ExecutionGrantError("replan grant revision or evidence epoch mismatch");
    }
    if (transition.new_grant.scope.parent?.grant_id !== active.grant_id
      || transition.new_grant.scope.parent?.scope_digest !== active.scope_digest
      || transition.new_grant.scope.supersedes_grant_id !== active.grant_id) {
      throw new ExecutionGrantError("replan scope parent/supersedes binding mismatch");
    }
    if (!same(active.scope.release_binding, transition.new_grant.scope.release_binding)) {
      throw new ExecutionGrantError("replan cannot change immutable release binding");
    }
    if (active.scope.task_id !== transition.new_grant.scope.task_id
      || active.scope.repo.realpath !== transition.new_grant.scope.repo.realpath) {
      throw new ExecutionGrantError("same-task replan cannot change task or repository identity");
    }
    if (!Array.isArray(transition.scope_delta)
      || !transition.evidence || !Array.isArray(transition.evidence.retained)
      || !Array.isArray(transition.evidence.invalidated)) {
      throw new ExecutionGrantError("replan transition is missing scope delta or evidence decisions");
    }
    validateReplanEvidenceShape(transition);
    if (!same(transition.scope_delta, scopeDelta(active.scope, transition.new_grant.scope))) {
      throw new ExecutionGrantError("replan scope delta is not the complete machine-computed delta");
    }
    if (!same(transition.evidence_policy, transition.new_grant.scope.evidence_policy)) {
      throw new ExecutionGrantError("replan evidence policy does not match the new canonical scope");
    }
    const nextFirstCode = replannedFirstCodeState(authority, transition);
    const superseded = terminalGrant(active, {
      occurred_at: transition.occurred_at,
      revision: transition.revision,
      status: "superseded",
      reason: "explicit-replan",
      superseded_by: transition.new_grant.grant_id,
    });
    authority.grants = authority.grants.map((grant) => (
      grant.grant_id === active.grant_id ? superseded : grant
    ));
    authority.grants.push(clone(transition.new_grant));
    authority.current_grant_id = transition.new_grant.grant_id;
    if (nextFirstCode) authority.first_code = nextFirstCode;
    else delete authority.first_code;
    return validateAuthorityEnvelope(authority);
  }
  if (transition.type === "grant-completed" || transition.type === "grant-revoked") {
    exactKeys(transition, [
      "schema_version", "type", "revision", "occurred_at", "old_grant_id",
      "old_scope_digest", "old_evidence_epoch", "outcome", "reason",
    ], `${transition.type} transition`);
    canonicalUtc(transition.occurred_at, `${transition.type} occurred_at`);
    const status = transition.type === "grant-completed" ? "completed" : "revoked";
    const terminal = terminalGrant(active, {
      occurred_at: transition.occurred_at,
      revision: transition.revision,
      status,
      reason: transition.reason || "",
      outcome: transition.outcome || "",
    });
    authority.grants = authority.grants.map((grant) => (
      grant.grant_id === active.grant_id ? terminal : grant
    ));
    authority.current_grant_id = null;
    return validateAuthorityEnvelope(authority);
  }
  throw new ExecutionGrantError(`unknown authority transition: ${transition.type}`);
}

function transitionAuthorityState(state, transition) {
  const current = state.execution_authority?.schema_version === 2
    ? state.execution_authority
    : null;
  state.execution_authority = applyAuthorityTransition(current, transition);
  return state.execution_authority;
}

function eventSeconds(event) {
  const value = event?.occurred_at;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value) {
    throw new ExecutionGrantError("authority event occurred_at must be canonical ISO UTC");
  }
  return value.replace(/\.\d{3}Z$/, "Z");
}

function validateBriefEnvelope(data, grant, label) {
  if (typeof data.brief_path !== "string" || !path.isAbsolute(data.brief_path)
    || path.normalize(data.brief_path) !== data.brief_path) {
    throw new ExecutionGrantError(`${label} brief_path must be canonical and absolute`);
  }
  const matches = grant.scope.required_slices.filter((slice) => (
    data.brief_path.endsWith(`${path.sep}${slice.brief_path.split("/").join(path.sep)}`)
      && slice.objective === data.objective
  ));
  if (matches.length !== 1) {
    throw new ExecutionGrantError(`${label} brief_path does not identify exactly one scope slice`);
  }
}

function validateIssuedEvent(event, previousState, transition) {
  exactKeys(event.data, [
    "authorization_ref", "brief_path", "grant_id", "objective", "expected_scope_digest",
  ], "authority.grant.issued data");
  const grant = transition.grant;
  if (previousState?.status !== "doing" || event.projection?.state?.status !== "doing"
    || grant.status !== "active" || grant.evidence_epoch !== 1
    || grant.scope.task_id !== event.task_id || grant.scope.parent !== null
    || grant.scope.supersedes_grant_id !== null
    || !same(grant.scope.evidence_policy, {
      mode: "invalidate-incompatible", retained_receipt_ids: [],
    })
    || grant.issued_revision !== event.revision || grant.issued_at !== eventSeconds(event)
    || event.data.authorization_ref !== grant.authorization_provenance.ref
    || event.data.grant_id !== grant.grant_id || event.data.objective !== grant.scope.objective
    || (event.data.expected_scope_digest
      && event.data.expected_scope_digest !== grant.scope_digest)) {
    throw new ExecutionGrantError("authority.grant.issued envelope differs from its grant");
  }
  validateBriefEnvelope(event.data, grant, "authority.grant.issued");
  const expectedResult = {
    grant,
    grant_id: grant.grant_id,
    scope_digest: grant.scope_digest,
    evidence_epoch: grant.evidence_epoch,
  };
  if (!same(event.result, expectedResult)) {
    throw new ExecutionGrantError("authority.grant.issued result differs from its grant");
  }
}

function validateReplannedEvent(event, previousState, previousAuthority, transition) {
  exactKeys(event.data, [
    "authorization_ref", "brief_path", "evidence_policy", "expected_delta",
    "expected_scope_digest", "grant_id", "objective", "retained_receipt_ids",
  ], "authority.replanned data");
  const oldGrant = currentGrant(previousAuthority);
  const grant = transition.new_grant;
  const retained = [...event.data.retained_receipt_ids].sort();
  if (previousState?.status !== "doing" || event.projection?.state?.status !== "doing"
    || oldGrant?.status !== "active" || grant.status !== "active"
    || grant.scope.task_id !== event.task_id
    || transition.occurred_at !== eventSeconds(event) || grant.issued_at !== eventSeconds(event)
    || event.data.authorization_ref !== grant.authorization_provenance.ref
    || event.data.grant_id !== grant.grant_id || event.data.objective !== grant.scope.objective
    || event.data.evidence_policy !== transition.evidence_policy.mode
    || !same(event.data.expected_delta, transition.scope_delta)
    || (event.data.expected_scope_digest
      && event.data.expected_scope_digest !== grant.scope_digest)
    || !same(retained, transition.evidence_policy.retained_receipt_ids)) {
    throw new ExecutionGrantError("authority.replanned envelope differs from its transition");
  }
  validateBriefEnvelope(event.data, grant, "authority.replanned");
  const expectedResult = {
    grant,
    grant_id: grant.grant_id,
    scope_digest: grant.scope_digest,
    evidence_epoch: grant.evidence_epoch,
    scope_delta: transition.scope_delta,
    evidence: transition.evidence,
  };
  if (!same(event.result, expectedResult)) {
    throw new ExecutionGrantError("authority.replanned result differs from its transition");
  }
}

function validateCompletedEvent(event, previousState, previousAuthority, transition) {
  exactKeys(event.data, [
    "from", "to", "outcome", "authority_ref", "evidence_refs", "no_verify_reason",
  ], "task.completion.closed data");
  const oldGrant = currentGrant(previousAuthority);
  const completion = event.projection?.state?.completion;
  if (previousState?.status !== "doing" || event.projection?.state?.status !== "done"
    || oldGrant?.status !== "active" || event.data.from !== "doing" || event.data.to !== "done"
    || !new Set(["succeeded", "failed", "cancelled"]).has(event.data.outcome)
    || !Array.isArray(event.data.evidence_refs)
    || transition.outcome !== event.data.outcome
    || transition.reason !== `task-completion:${event.data.outcome}`
    || transition.occurred_at !== eventSeconds(event)
    || (event.data.outcome === "succeeded"
      && previousAuthority?.first_code
      && previousAuthority.first_code.status !== "satisfied")
    || (event.data.outcome !== "succeeded"
      && (!event.data.authority_ref || event.data.evidence_refs.length === 0))
    || (event.data.no_verify_reason && event.data.outcome === "succeeded")
    || completion?.schema_version !== 1 || completion.outcome !== event.data.outcome
    || completion.authority_ref !== event.data.authority_ref
    || !same(completion.evidence_refs, event.data.evidence_refs)
    || completion.grant_id !== transition.old_grant_id
    || completion.scope_digest !== transition.old_scope_digest
    || completion.evidence_epoch !== transition.old_evidence_epoch
    || completion.closed_at !== eventSeconds(event)) {
    throw new ExecutionGrantError("task.completion.closed envelope differs from its grant transition");
  }
  const expectedResult = {
    outcome: transition.outcome,
    grant_id: transition.old_grant_id,
    scope_digest: transition.old_scope_digest,
    evidence_epoch: transition.old_evidence_epoch,
  };
  if (!same(event.result, expectedResult)) {
    throw new ExecutionGrantError("task.completion.closed result differs from its grant transition");
  }
}

function validateAuthorityEventEnvelope(event, previousState, previousAuthority, transition) {
  const expectedType = event.kind === "authority.grant.issued"
    ? "grant-issued"
    : event.kind === "authority.replanned"
      ? "grant-replanned"
      : event.kind === "task.completion.closed" && currentGrant(previousAuthority)
        ? "grant-completed"
        : null;
  if (expectedType && transition?.type !== expectedType) {
    throw new ExecutionGrantError(`${event.kind} requires ${expectedType} authority transition`);
  }
  if (!transition) return;
  const expectedKind = {
    "grant-issued": "authority.grant.issued",
    "grant-replanned": "authority.replanned",
    "grant-completed": "task.completion.closed",
  }[transition.type];
  if (!expectedKind || transition.type === "grant-revoked" || event.kind !== expectedKind) {
    throw new ExecutionGrantError(
      `authority transition ${transition.type} has no matching authoritative event writer`,
    );
  }
  if (transition.type === "grant-issued") validateIssuedEvent(event, previousState, transition);
  if (transition.type === "grant-replanned") {
    validateReplannedEvent(event, previousState, previousAuthority, transition);
  }
  if (transition.type === "grant-completed") {
    validateCompletedEvent(event, previousState, previousAuthority, transition);
  }
}

function validateAuthorityEventProjection(events) {
  let reduced = null;
  let vNextSeen = false;
  let previousState = null;
  for (const event of events) {
    const transition = event.authority_transition === undefined
      ? null
      : event.authority_transition;
    const previousAuthority = reduced;
    if (transition !== null) {
      if (transition.revision !== event.revision) {
        throw new ExecutionGrantError(
          `authority transition revision mismatch at revision ${event.revision}`,
        );
      }
      reduced = applyAuthorityTransition(reduced, transition);
      if (transition.type === "grant-replanned") {
        validateReplanEvidenceProjection(
          previousState || {},
          event.projection?.state || {},
          transition,
        );
      }
      vNextSeen = true;
    }
    if (reduced) reduced = applyFirstCodeEvent(reduced, event);
    validateAuthorityEventEnvelope(event, previousState, previousAuthority, transition);
    const projected = event.projection?.state?.execution_authority;
    if (!vNextSeen) {
      if (projected?.schema_version === 2) {
        throw new ExecutionGrantError(
          `unexplained vNext execution authority at revision ${event.revision}`,
        );
      }
      previousState = event.projection?.state || null;
      continue;
    }
    if (!same(projected, reduced)) {
      throw new ExecutionGrantError(
        `execution authority projection diverges from reducer at revision ${event.revision}`,
      );
    }
    previousState = event.projection?.state || null;
  }
  return reduced;
}

function nowDate(clock) {
  const value = (clock || (() => new Date()))();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new ExecutionGrantError("authority clock is invalid");
  return date;
}

function assertSizeExceptionValidity(grant, options = {}) {
  const scope = grant.scope;
  const exceptions = scope.size_exceptions || [];
  const selected = options.all
    ? exceptions
    : exceptions.filter((exception) => exception.slice_id === options.sliceId);
  const now = nowDate(options.clock);
  for (const exception of selected) {
    if (exception.task_id !== scope.task_id || exception.grant_id !== grant.grant_id
      || exception.scope_core_digest !== scope.scope_core_digest
      || exception.authority?.ref !== grant.authorization_provenance.ref
      || exception.authority?.kind !== grant.authorization_provenance.kind) {
      throw new ExecutionGrantError(`size exception binding is stale for ${exception.slice_id}`);
    }
    if (Date.parse(exception.expires_at) <= now.getTime()) {
      throw new ExecutionGrantError(`size exception has expired for ${exception.slice_id}`);
    }
  }
  return true;
}

function assertActiveExecutionGrant(state, expected = {}, options = {}) {
  const authority = validateAuthorityEnvelope(state.execution_authority);
  const grant = currentGrant(authority);
  if (!grant || grant.status !== "active") throw new ExecutionGrantError("current active execution grant is required");
  if (grant.scope.design_handoff === null || grant.scope.first_code === null) {
    throw new ExecutionGrantError(
      "legacy execution grant is read-only; explicit replan to production governance bindings is required",
    );
  }
  if (expected.grantId && grant.grant_id !== expected.grantId) {
    throw new ExecutionGrantError("execution grant_id does not match current authority");
  }
  if (expected.scopeDigest && grant.scope_digest !== expected.scopeDigest) {
    throw new ExecutionGrantError("execution scope digest does not match current authority");
  }
  if (expected.evidenceEpoch && grant.evidence_epoch !== expected.evidenceEpoch) {
    throw new ExecutionGrantError("execution evidence epoch does not match current authority");
  }
  const slice = expected.sliceId
    ? grant.scope.required_slices.find((candidate) => candidate.slice_id === expected.sliceId)
    : null;
  if (expected.sliceId && !slice) {
    throw new ExecutionGrantError(`slice is outside the current execution grant: ${expected.sliceId}`);
  }
  if (slice && expected.objective && slice.objective !== expected.objective) {
    throw new ExecutionGrantError("execute objective does not equal the canonical current slice objective");
  }
  if (slice && expected.briefSha256 && slice.brief_sha256 !== expected.briefSha256) {
    throw new ExecutionGrantError("execute brief does not equal the canonical current slice brief");
  }
  if (options.requireUnexpired) {
    assertSizeExceptionValidity(grant, {
      all: options.allExceptions,
      clock: options.clock,
      sliceId: expected.sliceId,
    });
  }
  return grant;
}

function executionHistoryRequired(events) {
  return events.some((event) => (
    event.authority_transition
    || event.kind === "authority.grant.issued"
    || event.kind === "authority.replanned"
    || (event.kind === "team.started" && event.data?.mode === "execute")
    || (event.kind === "team.promoted" && event.data?.target === "execute")
    || event.projection?.state?.execution_authority
    || event.projection?.state?.completion?.release_decision
  ));
}

function authorityReplayPostcondition(expected = {}) {
  return ({ currentProjection, events, existing }) => {
    let grant;
    try {
      grant = assertActiveExecutionGrant(currentProjection.state, {
        evidenceEpoch: expected.evidenceEpoch || existing.result?.evidence_epoch,
        grantId: expected.grantId || existing.result?.grant_id
          || existing.result?.grant?.grant_id || existing.result?.team?.grant_id,
        scopeDigest: expected.scopeDigest || existing.result?.scope_digest
          || existing.result?.grant?.scope_digest || existing.result?.team?.scope_digest,
        sliceId: expected.sliceId || existing.result?.team?.slice_id
          || existing.result?.accepted?.slice_id,
      }, {
        allExceptions: Boolean(expected.allExceptions),
        clock: expected.clock,
        requireUnexpired: Boolean(expected.requireUnexpired),
      });
      if (typeof expected.validateCurrent === "function") {
        expected.validateCurrent({
          currentProjection,
          events,
          existing,
          grant,
        });
      }
    } catch (error) {
      throw new ExecutionGrantError(`stale authorization replay: ${existing.operation_id}: ${error.message}`);
    }
    const expectedRunId = expected.teamRunId || existing.result?.team?.team_run_id
      || existing.result?.accepted?.team_run_id;
    if (expectedRunId && currentProjection.state.active_team?.team_run_id !== expectedRunId) {
      throw new ExecutionGrantError(`stale authorization replay: ${existing.operation_id}: Team run is no longer current`);
    }
    return grant;
  };
}

function terminalAuthorityReplayPostcondition(expectedStatus, options = {}) {
  return ({ currentProjection, events, existing }) => {
    const transition = existing.authority_transition;
    const authority = currentProjection?.state?.execution_authority;
    const grant = (authority?.grants || []).find(
      (candidate) => candidate.grant_id === transition?.old_grant_id,
    );
    if (!transition || !grant || grant.status !== expectedStatus
      || grant.scope_digest !== transition.old_scope_digest
      || grant.evidence_epoch !== transition.old_evidence_epoch
      || grant.terminal?.revision !== existing.revision) {
      throw new ExecutionGrantError(
        `stale authorization replay: ${existing.operation_id}: terminal grant postcondition is no longer exact`,
      );
    }
    if (options.requireUnexpired) {
      try {
        assertSizeExceptionValidity(grant, { all: true, clock: options.clock });
      } catch (error) {
        throw new ExecutionGrantError(
          `stale authorization replay: ${existing.operation_id}: ${error.message}`,
        );
      }
    }
    if (typeof options.validateCurrent === "function") {
      try {
        options.validateCurrent({ currentProjection, events, existing, grant });
      } catch (error) {
        throw new ExecutionGrantError(
          `stale authorization replay: ${existing.operation_id}: ${error.message}`,
        );
      }
    }
    return grant;
  };
}

module.exports = {
  ACTIVE_GRANT_STATES,
  ExecutionGrantError,
  TERMINAL_GRANT_STATES,
  applyAuthorityTransition,
  applyFirstCodeEvent,
  assertActiveExecutionGrant,
  assertSizeExceptionValidity,
  authorityRef,
  authorityReplayPostcondition,
  canonicalJson,
  currentGrant,
  executionHistoryRequired,
  firstCodeBoundary,
  sha256Canonical,
  terminalAuthorityReplayPostcondition,
  transitionAuthorityState,
  transitionFirstCodeState,
  validateAuthorityEnvelope,
  validateAuthorityEventProjection,
  validateGrant,
};
