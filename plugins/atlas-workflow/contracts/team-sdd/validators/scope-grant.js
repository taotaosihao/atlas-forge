"use strict";

const crypto = require("crypto");
const {
  canonicalAuthoritySliceIdentities,
} = require("./authority-identity");

const SCOPE_GRANT_CAPABILITY = "atlas-scope-grant-vnext-1";
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const AUTHORITY_REF = /^(user-message|operator-input):[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const CANONICAL_UTC = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/;
const RELEASE_BINDING_KEYS = [
  "target_delivery_class", "intent_sha256", "profile_ref", "profile_sha256",
  "check_definition_set_sha256", "requirement_refs",
];
const RELEASE_REQUIREMENT_KEYS = [
  "profile_ref", "profile_sha256", "requirement_ref", "requirement_sha256",
  "dimension", "required", "waiver_policy", "definition_ref", "definition_sha256",
  "collector_adapter_ref", "collector_adapter_sha256", "fact_schema_ref",
  "fact_schema_sha256", "evaluator_ref", "evaluator_sha256", "pass_rule_sha256",
  "required_candidate_components",
];

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

function exact(value, keys, label) {
  object(value, label);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${label} missing required key: ${key}`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${label} unknown key: ${key}`);
}

function string(value, label) {
  if (typeof value !== "string" || !value.trim() || /[\r\n\t]/.test(value)) {
    fail(`${label} must be a non-empty single-line string`);
  }
  return value;
}

function safeId(value, label) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) fail(`${label} must be a safe identifier`);
  return value;
}

function digest(value, label) {
  if (typeof value !== "string" || !DIGEST.test(value)) {
    fail(`${label} must use sha256:<64 lowercase hex>`);
  }
  return value;
}

function parseAuthorityRef(value, label = "authorization ref") {
  if (typeof value !== "string" || !AUTHORITY_REF.test(value)) {
    fail(`${label} must be a controller-recordable user-message: or operator-input: ref`);
  }
  return { kind: value.slice(0, value.indexOf(":")), ref: value };
}

function canonicalUtc(value, label = "expires_at") {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)) {
    fail(`${label} must use canonical UTC YYYY-MM-DDTHH:mm:ssZ`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().replace(".000Z", "Z") !== value) {
    fail(`${label} must be a real canonical UTC timestamp`);
  }
  return value;
}

function canonicalPathPattern(value, label, { allowGlob = true } = {}) {
  string(value, label);
  if (value !== value.normalize("NFC") || /[^\x20-\x7e]/.test(value)) {
    fail(`${label} contains a Unicode or non-ASCII alias`);
  }
  if (value.startsWith("/") || value.includes("\\") || value.includes("//")
    || value.endsWith("/") || value.startsWith("./")) {
    fail(`${label} must already be a canonical POSIX repository-relative path`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    fail(`${label} must not contain empty, dot, or parent segments`);
  }
  if (!allowGlob && /[*?\[\]{}]/.test(value)) fail(`${label} must not contain glob syntax`);
  return value;
}

function uniqueStrings(values, label, { pathPatterns = false } = {}) {
  if (!Array.isArray(values)) fail(`${label} must be an array`);
  const seen = new Set();
  const output = values.map((value, index) => {
    const item = pathPatterns
      ? canonicalPathPattern(value, `${label}[${index}]`)
      : string(value, `${label}[${index}]`);
    if (seen.has(item)) fail(`${label} contains duplicate value: ${item}`);
    seen.add(item);
    return item;
  });
  return output.sort();
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

function canonicalReleaseBinding(value, label = "release_binding") {
  exact(value, RELEASE_BINDING_KEYS, label);
  if (value.target_delivery_class !== "product_release") {
    fail(`${label}.target_delivery_class must equal product_release`);
  }
  safeId(value.profile_ref, `${label}.profile_ref`);
  for (const field of ["intent_sha256", "profile_sha256", "check_definition_set_sha256"]) {
    digest(value[field], `${label}.${field}`);
  }
  return {
    target_delivery_class: "product_release",
    intent_sha256: value.intent_sha256,
    profile_ref: value.profile_ref,
    profile_sha256: value.profile_sha256,
    check_definition_set_sha256: value.check_definition_set_sha256,
    requirement_refs: uniqueStrings(value.requirement_refs, `${label}.requirement_refs`),
  };
}

function canonicalReleaseRequirement(value, label) {
  exact(value, RELEASE_REQUIREMENT_KEYS, label);
  for (const field of ["profile_ref", "requirement_ref"]) safeId(value[field], `${label}.${field}`);
  for (const field of [
    "profile_sha256", "requirement_sha256", "definition_sha256",
    "collector_adapter_sha256", "fact_schema_sha256", "evaluator_sha256",
    "pass_rule_sha256",
  ]) digest(value[field], `${label}.${field}`);
  for (const field of [
    "dimension", "definition_ref", "collector_adapter_ref", "fact_schema_ref", "evaluator_ref",
  ]) string(value[field], `${label}.${field}`);
  if (value.required !== true || value.waiver_policy !== "never") {
    fail(`${label} must be required with waiver_policy never`);
  }
  return {
    profile_ref: value.profile_ref,
    profile_sha256: value.profile_sha256,
    requirement_ref: value.requirement_ref,
    requirement_sha256: value.requirement_sha256,
    dimension: value.dimension,
    required: true,
    waiver_policy: "never",
    definition_ref: value.definition_ref,
    definition_sha256: value.definition_sha256,
    collector_adapter_ref: value.collector_adapter_ref,
    collector_adapter_sha256: value.collector_adapter_sha256,
    fact_schema_ref: value.fact_schema_ref,
    fact_schema_sha256: value.fact_schema_sha256,
    evaluator_ref: value.evaluator_ref,
    evaluator_sha256: value.evaluator_sha256,
    pass_rule_sha256: value.pass_rule_sha256,
    required_candidate_components: uniqueStrings(
      value.required_candidate_components,
      `${label}.required_candidate_components`,
    ),
  };
}

function canonicalCheck(value, location) {
  exact(value, [
    "check_id", "gate_class", "command", "final_only", "cache_policy", "release_requirement",
  ], location);
  safeId(value.check_id, `${location}.check_id`);
  string(value.gate_class, `${location}.gate_class`);
  string(value.command, `${location}.command`);
  if (typeof value.final_only !== "boolean") fail(`${location}.final_only must be a boolean`);
  string(value.cache_policy, `${location}.cache_policy`);
  const releaseRequirement = value.release_requirement === null
    ? null
    : canonicalReleaseRequirement(value.release_requirement, `${location}.release_requirement`);
  return {
    check_id: value.check_id,
    gate_class: value.gate_class,
    command: value.command,
    final_only: value.final_only,
    cache_policy: value.cache_policy,
    release_requirement: releaseRequirement,
  };
}

function canonicalSlice(value, index, globalCheckIds) {
  const location = `required_slices[${index}]`;
  exact(value, [
    "slice_id", "objective", "brief_path", "brief_sha256", "depends_on", "keeper_outputs",
    "owned_paths", "forbidden_paths", "acceptance_refs", "estimate", "budget", "checks",
  ], location);
  safeId(value.slice_id, `${location}.slice_id`);
  string(value.objective, `${location}.objective`);
  canonicalPathPattern(value.brief_path, `${location}.brief_path`, { allowGlob: false });
  digest(value.brief_sha256, `${location}.brief_sha256`);
  const dependsOn = uniqueStrings(value.depends_on, `${location}.depends_on`);
  const keeperOutputs = uniqueStrings(value.keeper_outputs, `${location}.keeper_outputs`);
  const ownedPaths = uniqueStrings(value.owned_paths, `${location}.owned_paths`, { pathPatterns: true });
  const forbiddenPaths = uniqueStrings(value.forbidden_paths, `${location}.forbidden_paths`, { pathPatterns: true });
  const acceptanceRefs = uniqueStrings(value.acceptance_refs, `${location}.acceptance_refs`);
  exact(value.estimate, [
    "estimated_changed_files", "estimated_net_loc", "target_p90_minutes",
    "serial_dependency_depth", "independent_vertical_count",
  ], `${location}.estimate`);
  exact(value.budget, [
    "max_changed_files", "max_loc", "max_wall_clock_minutes", "max_required_checks",
  ], `${location}.budget`);
  for (const [field, number] of Object.entries(value.estimate)) {
    if (!Number.isInteger(number) || number < (field === "serial_dependency_depth" ? 0 : 1)) {
      fail(`${location}.estimate.${field} must be a bounded integer`);
    }
  }
  for (const [field, number] of Object.entries(value.budget)) {
    if (!Number.isInteger(number) || number < 1) {
      fail(`${location}.budget.${field} must be a positive integer`);
    }
  }
  if (!Array.isArray(value.checks) || value.checks.length === 0) fail(`${location}.checks must be non-empty`);
  const checks = value.checks.map((check, checkIndex) => {
    const canonical = canonicalCheck(check, `${location}.checks[${checkIndex}]`);
    if (globalCheckIds.has(canonical.check_id)) fail(`duplicate required check: ${canonical.check_id}`);
    globalCheckIds.add(canonical.check_id);
    return canonical;
  });
  return {
    slice_id: value.slice_id,
    objective: value.objective,
    brief_path: value.brief_path,
    brief_sha256: value.brief_sha256,
    depends_on: dependsOn,
    keeper_outputs: keeperOutputs,
    owned_paths: ownedPaths,
    forbidden_paths: forbiddenPaths,
    acceptance_refs: acceptanceRefs,
    estimate: { ...value.estimate },
    budget: { ...value.budget },
    checks,
  };
}

function canonicalEvidencePolicy(value) {
  exact(value, ["mode", "retained_receipt_ids"], "evidence_policy");
  if (!new Set(["invalidate-incompatible", "retain-compatible"]).has(value.mode)) {
    fail("evidence_policy.mode must be invalidate-incompatible or retain-compatible");
  }
  const retained = uniqueStrings(value.retained_receipt_ids, "evidence_policy.retained_receipt_ids");
  if (value.mode === "invalidate-incompatible" && retained.length > 0) {
    fail("invalidate-incompatible evidence policy cannot retain receipts");
  }
  return { mode: value.mode, retained_receipt_ids: retained };
}

function canonicalSizeException(value, index, scope) {
  const location = `size_exceptions[${index}]`;
  exact(value, [
    "task_id", "slice_id", "grant_id", "scope_core_digest", "authority",
    "expires_at", "reason", "compensating_controls",
  ], location);
  if (value.task_id !== scope.task_id) fail(`${location}.task_id does not match scope task`);
  if (!scope.required_slices.some((slice) => slice.slice_id === value.slice_id)) {
    fail(`${location}.slice_id is not required by the scope`);
  }
  if (value.grant_id !== scope.grant_id) fail(`${location}.grant_id does not match scope grant`);
  digest(value.scope_core_digest, `${location}.scope_core_digest`);
  exact(value.authority, ["kind", "ref"], `${location}.authority`);
  const authority = parseAuthorityRef(value.authority.ref, `${location}.authority.ref`);
  if (authority.kind !== value.authority.kind) fail(`${location}.authority kind/ref mismatch`);
  canonicalUtc(value.expires_at, `${location}.expires_at`);
  string(value.reason, `${location}.reason`);
  return {
    task_id: value.task_id,
    slice_id: safeId(value.slice_id, `${location}.slice_id`),
    grant_id: safeId(value.grant_id, `${location}.grant_id`),
    scope_core_digest: value.scope_core_digest,
    authority,
    expires_at: value.expires_at,
    reason: value.reason,
    compensating_controls: uniqueStrings(
      value.compensating_controls,
      `${location}.compensating_controls`,
    ),
  };
}

function corePreimage(scope) {
  const value = { ...scope, size_exceptions: [] };
  delete value.scope_core_digest;
  return value;
}

function scopeCoreDigest(scope) {
  return sha256Canonical(corePreimage(scope));
}

function canonicalScopeVNext(value, options = {}) {
  exact(value, [
    "schema_version", "grant_id", "task_id", "repo", "objective", "contract",
    "execution_plan", "owned_paths", "forbidden_paths", "required_slices",
    "size_exceptions", "scope_core_digest", "authorization_provenance", "release_binding",
    "parent", "supersedes_grant_id", "evidence_policy", "design_handoff", "first_code",
  ], "scope");
  if (value.schema_version !== 1) fail("scope.schema_version must equal 1");
  safeId(value.grant_id, "scope.grant_id");
  safeId(value.task_id, "scope.task_id");
  exact(value.repo, ["realpath", "base_sha"], "scope.repo");
  if (typeof value.repo.realpath !== "string" || !value.repo.realpath.startsWith("/")) {
    fail("scope.repo.realpath must be an absolute canonical realpath");
  }
  if (value.repo.realpath !== value.repo.realpath.normalize("NFC")) {
    fail("scope.repo.realpath contains a Unicode normalization alias");
  }
  if (!/^[a-f0-9]{40}$/.test(value.repo.base_sha || "")) fail("scope.repo.base_sha must be a commit SHA");
  string(value.objective, "scope.objective");
  exact(value.contract, ["path", "sha256", "semantics_version", "authority_slices"], "scope.contract");
  canonicalPathPattern(value.contract.path, "scope.contract.path", { allowGlob: false });
  digest(value.contract.sha256, "scope.contract.sha256");
  if (!new Set([5, 6]).has(value.contract.semantics_version)) {
    fail("scope.contract.semantics_version must be vNext 5 or 6");
  }
  const authoritySlices = canonicalAuthoritySliceIdentities(value.contract.authority_slices);
  if (authoritySlices.some((identity) => identity.task_id !== value.task_id)) {
    fail("scope.contract.authority_slices task_id must equal scope task_id");
  }
  exact(value.execution_plan, ["schema_version", "sha256"], "scope.execution_plan");
  if (!new Set([3, 4]).has(value.execution_plan.schema_version)) {
    fail("scope.execution_plan.schema_version must be vNext 3 or 4");
  }
  const expectedPlanVersion = value.contract.semantics_version === 6 ? 4 : 3;
  if (value.execution_plan.schema_version !== expectedPlanVersion) {
    fail("scope contract/execution-plan version matrix is invalid");
  }
  digest(value.execution_plan.sha256, "scope.execution_plan.sha256");
  const checkIds = new Set();
  if (!Array.isArray(value.required_slices) || value.required_slices.length === 0) {
    fail("scope.required_slices must be non-empty");
  }
  const sliceIds = new Set();
  const requiredSlices = value.required_slices.map((slice, index) => {
    const canonical = canonicalSlice(slice, index, checkIds);
    if (sliceIds.has(canonical.slice_id)) fail(`duplicate required slice: ${canonical.slice_id}`);
    sliceIds.add(canonical.slice_id);
    return canonical;
  });
  for (const slice of requiredSlices) {
    for (const dependency of slice.depends_on) {
      if (!sliceIds.has(dependency) || dependency === slice.slice_id) {
        fail(`scope slice ${slice.slice_id} has invalid dependency: ${dependency}`);
      }
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const slicesById = new Map(requiredSlices.map((slice) => [slice.slice_id, slice]));
  function visitSlice(sliceId) {
    if (visiting.has(sliceId)) fail(`scope required_slices contains a dependency cycle at ${sliceId}`);
    if (visited.has(sliceId)) return;
    visiting.add(sliceId);
    for (const dependency of slicesById.get(sliceId).depends_on) visitSlice(dependency);
    visiting.delete(sliceId);
    visited.add(sliceId);
  }
  for (const slice of requiredSlices) visitSlice(slice.slice_id);
  const expectedOwnedPaths = [...new Set(requiredSlices.flatMap((slice) => slice.owned_paths))]
    .sort();
  const expectedForbiddenPaths = [...new Set(requiredSlices.flatMap((slice) => slice.forbidden_paths))]
    .sort();
  exact(value.authorization_provenance, ["kind", "ref"], "scope.authorization_provenance");
  const authorization = parseAuthorityRef(
    value.authorization_provenance.ref,
    "scope.authorization_provenance.ref",
  );
  if (authorization.kind !== value.authorization_provenance.kind) {
    fail("scope.authorization_provenance kind/ref mismatch");
  }
  const releaseBinding = value.release_binding === null
    ? null
    : canonicalReleaseBinding(value.release_binding, "scope.release_binding");
  if (value.parent !== null) {
    exact(value.parent, ["grant_id", "scope_digest"], "scope.parent");
    safeId(value.parent.grant_id, "scope.parent.grant_id");
    digest(value.parent.scope_digest, "scope.parent.scope_digest");
  }
  if (value.supersedes_grant_id !== null) {
    safeId(value.supersedes_grant_id, "scope.supersedes_grant_id");
  }
  if ((value.parent === null) !== (value.supersedes_grant_id === null)
    || (value.parent && value.parent.grant_id !== value.supersedes_grant_id)) {
    fail("scope parent and supersedes_grant_id must identify the same prior grant");
  }
  if (value.design_handoff !== null || value.first_code !== null) {
    fail("scope Design Handoff and first-code placeholders must remain null until their production schema is delivered");
  }
  const scope = {
    schema_version: 1,
    grant_id: value.grant_id,
    task_id: value.task_id,
    repo: { realpath: value.repo.realpath, base_sha: value.repo.base_sha },
    objective: value.objective,
    contract: {
      path: value.contract.path,
      sha256: value.contract.sha256,
      semantics_version: value.contract.semantics_version,
      authority_slices: authoritySlices,
    },
    execution_plan: {
      schema_version: value.execution_plan.schema_version,
      sha256: value.execution_plan.sha256,
    },
    owned_paths: uniqueStrings(value.owned_paths, "scope.owned_paths", { pathPatterns: true }),
    forbidden_paths: uniqueStrings(value.forbidden_paths, "scope.forbidden_paths", { pathPatterns: true }),
    required_slices: requiredSlices,
    size_exceptions: [],
    scope_core_digest: value.scope_core_digest,
    authorization_provenance: authorization,
    release_binding: releaseBinding,
    parent: value.parent === null ? null : { ...value.parent },
    supersedes_grant_id: value.supersedes_grant_id,
    evidence_policy: canonicalEvidencePolicy(value.evidence_policy),
    design_handoff: null,
    first_code: null,
  };
  if ((scope.contract.semantics_version === 6) !== Boolean(scope.release_binding)) {
    fail("scope release_binding must be present exactly for contract semantics version 6");
  }
  const releaseRequirements = requiredSlices.flatMap((slice) => (
    slice.checks.flatMap((check) => check.release_requirement ? [check.release_requirement] : [])
  ));
  if (!scope.release_binding && releaseRequirements.length > 0) {
    fail("ordinary semantics-v5 scope cannot carry release requirements");
  }
  if (scope.release_binding) {
    const requirementRefs = releaseRequirements.map((requirement) => {
      if (requirement.profile_ref !== scope.release_binding.profile_ref
        || requirement.profile_sha256 !== scope.release_binding.profile_sha256) {
        fail("scope release requirement does not match its Profile binding");
      }
      return requirement.requirement_ref;
    });
    if (new Set(requirementRefs).size !== requirementRefs.length) {
      fail("scope release requirements contain duplicate requirement refs");
    }
    requirementRefs.sort();
    if (canonicalJson(requirementRefs) !== canonicalJson(scope.release_binding.requirement_refs)) {
      fail("scope release requirements do not exactly cover release_binding.requirement_refs");
    }
  }
  if (canonicalJson(scope.owned_paths) !== canonicalJson(expectedOwnedPaths)
    || canonicalJson(scope.forbidden_paths) !== canonicalJson(expectedForbiddenPaths)) {
    fail("scope top-level owned/forbidden paths must equal the canonical required-slice union");
  }
  digest(value.scope_core_digest, "scope.scope_core_digest");
  const expectedCore = scopeCoreDigest(scope);
  if (!options.skipCoreDigestCheck && value.scope_core_digest !== expectedCore) {
    fail("scope.scope_core_digest does not match its canonical core");
  }
  if (!Array.isArray(value.size_exceptions)) fail("scope.size_exceptions must be an array");
  const exceptionSlices = new Set();
  scope.size_exceptions = value.size_exceptions.map((exception, index) => {
    const canonical = canonicalSizeException(exception, index, scope);
    if (canonical.scope_core_digest !== expectedCore) {
      fail(`size_exceptions[${index}].scope_core_digest does not match scope core`);
    }
    if (exceptionSlices.has(canonical.slice_id)) fail(`duplicate size exception for ${canonical.slice_id}`);
    exceptionSlices.add(canonical.slice_id);
    return canonical;
  }).sort((left, right) => (
    left.slice_id < right.slice_id ? -1 : left.slice_id > right.slice_id ? 1 : 0
  ));
  return scope;
}

function scopeDigest(value) {
  return sha256Canonical(canonicalScopeVNext(value));
}

function scopeDelta(left, right) {
  const before = canonicalScopeVNext(left);
  const after = canonicalScopeVNext(right);
  const changes = [];
  function visit(path, oldValue, newValue) {
    if (canonicalJson(oldValue) === canonicalJson(newValue)) return;
    const oldObject = oldValue && typeof oldValue === "object";
    const newObject = newValue && typeof newValue === "object";
    if (Array.isArray(oldValue) && Array.isArray(newValue)) {
      const length = Math.max(oldValue.length, newValue.length);
      for (let index = 0; index < length; index += 1) {
        visit(`${path}[${index}]`, oldValue[index], newValue[index]);
      }
      return;
    }
    if (oldObject && newObject && !Array.isArray(oldValue) && !Array.isArray(newValue)) {
      const keys = [...new Set([...Object.keys(oldValue), ...Object.keys(newValue)])].sort();
      for (const key of keys) visit(path ? `${path}.${key}` : key, oldValue[key], newValue[key]);
      return;
    }
    changes.push({
      path,
      before: oldValue === undefined ? null : stableValue(oldValue),
      after: newValue === undefined ? null : stableValue(newValue),
    });
  }
  visit("", before, after);
  return changes;
}

module.exports = {
  AUTHORITY_REF,
  CANONICAL_UTC,
  DIGEST,
  SCOPE_GRANT_CAPABILITY,
  canonicalJson,
  canonicalPathPattern,
  canonicalScopeVNext,
  canonicalUtc,
  parseAuthorityRef,
  scopeCoreDigest,
  scopeDelta,
  scopeDigest,
  sha256Canonical,
  stableValue,
};
