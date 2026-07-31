"use strict";

const fs = require("fs");
const path = require("path");
const { taskArtifactDir } = require("../core/paths");
const { readAuthoritativeEvents } = require("../core/event-store");
const { taskEventFile } = require("../core/task-mutation");
const {
  digestCanonical,
  sha256,
  stableValue,
  validateCapturedInput,
} = require("./identity");
const { validateReleaseProducerProvenance } = require("./release-provenance");

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const COMPONENTS = Object.freeze([
  "artifact", "surface_inventory", "config", "runtime", "data",
]);
const INTEGRATED_RELEASE_UNITS = Object.freeze([
  "web_ui", "api", "worker", "database", "external_integration",
]);
const MANIFEST_V1_KEYS = [
  "schema_version", "release_binding", "source", "components", "manifest_digest",
];
const MANIFEST_V2_KEYS = [
  "schema_version", "release_binding", "source", "components", "release_units",
  "deployment", "deployment_attestation", "performance_budget", "manifest_digest",
];
const RELEASE_BINDING_KEYS = [
  "target_delivery_class", "intent_sha256", "profile_ref", "profile_sha256",
  "check_definition_set_sha256", "requirement_refs",
];
const RELEASE_UNIT_KEYS = Object.freeze({
  web_ui: Object.freeze(["input_ref", "sha256", "artifact_digest", "build_id"]),
  api: Object.freeze([
    "input_ref", "sha256", "artifact_digest", "image_or_package_id", "contract_version",
  ]),
  worker: Object.freeze(["input_ref", "sha256", "artifact_digest", "image_or_package_id"]),
  database: Object.freeze([
    "input_ref", "sha256", "migration_bundle_sha256", "schema_head", "compatibility_window",
  ]),
  external_integration: Object.freeze([
    "input_ref", "sha256", "contract_version", "config_sha256", "credential_identity",
  ]),
});

class ReleaseCertificationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReleaseCertificationError";
  }
}

function same(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function exactKeys(value, keys, label, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label} must be an object`);
    return false;
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) errors.push(`${label} missing required key: ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) errors.push(`${label} unknown key: ${key}`);
  }
  return true;
}

function manifestBody(value) {
  const { manifest_digest: _digest, ...body } = value;
  return body;
}

function buildCandidateManifest(body) {
  const value = { ...stableValue(body) };
  value.manifest_digest = digestCanonical(value);
  return value;
}

function validateCandidateManifest(value, options = {}) {
  const errors = [];
  const schemaVersion = value?.schema_version;
  const manifestKeys = schemaVersion === 2 ? MANIFEST_V2_KEYS : MANIFEST_V1_KEYS;
  if (!exactKeys(value, manifestKeys, "candidate manifest", errors)) return errors;
  if (![1, 2].includes(schemaVersion)) {
    errors.push("candidate manifest schema_version must equal 1 or 2");
  }
  if (!SHA256.test(value.manifest_digest || "")
    || value.manifest_digest !== digestCanonical(manifestBody(value))) {
    errors.push("candidate manifest digest does not match its canonical content");
  }
  if (!exactKeys(value.release_binding, RELEASE_BINDING_KEYS, "candidate manifest release_binding", errors)) {
    return errors;
  }
  if (options.releaseBinding && !same(value.release_binding, options.releaseBinding)) {
    errors.push("candidate manifest release_binding does not match execution authority");
  }
  const profileRef = value.release_binding?.profile_ref;
  if (schemaVersion === 1 && profileRef && profileRef !== "web-ui-v1") {
    errors.push("candidate manifest schema_version 1 requires release profile web-ui-v1");
  }
  if (schemaVersion === 2 && profileRef !== "integrated-app-v1") {
    errors.push("candidate manifest schema_version 2 requires release profile integrated-app-v1");
  }
  if (!exactKeys(value.source, ["repo_realpath", "head_sha", "tree_oid"], "candidate manifest source", errors)) {
    return errors;
  }
  if (typeof value.source.repo_realpath !== "string" || !path.isAbsolute(value.source.repo_realpath)
    || !/^[a-f0-9]{40}$/.test(value.source.head_sha || "")
    || !/^[a-f0-9]{40}$/.test(value.source.tree_oid || "")) {
    errors.push("candidate manifest source identity is invalid");
  }
  if (options.repo && value.source.repo_realpath !== options.repo) {
    errors.push("candidate manifest source repository does not match the admitted repository");
  }
  if (options.snapshot && (value.source.head_sha !== options.snapshot.head_sha
    || value.source.tree_oid !== options.snapshot.tree_oid)) {
    errors.push("candidate manifest source does not match the final repository snapshot");
  }
  if (!exactKeys(value.components, COMPONENTS, "candidate manifest components", errors)) return errors;
  const refs = [];
  for (const component of COMPONENTS) {
    const item = value.components[component];
    const keys = component === "surface_inventory"
      ? ["authority_ref", "input_ref", "sha256"]
      : ["input_ref", "sha256"];
    if (!exactKeys(item, keys, `candidate manifest components.${component}`, errors)) continue;
    if (typeof item.input_ref !== "string" || !item.input_ref.trim()) {
      errors.push(`candidate manifest components.${component}.input_ref must be non-empty`);
    } else {
      refs.push(item.input_ref);
    }
    if (!SHA256.test(item.sha256 || "")) {
      errors.push(`candidate manifest components.${component}.sha256 is invalid`);
    }
    if (component === "surface_inventory"
      && (typeof item.authority_ref !== "string" || !item.authority_ref.trim())) {
      errors.push("candidate manifest surface_inventory.authority_ref must be non-empty");
    }
  }
  if (new Set(refs).size !== refs.length) {
    errors.push("candidate manifest component input_ref values must be unique");
  }
  if (schemaVersion === 2) {
    if (exactKeys(
      value.release_units,
      INTEGRATED_RELEASE_UNITS,
      "candidate manifest release_units",
      errors,
    )) {
      for (const unit of INTEGRATED_RELEASE_UNITS) {
        const item = value.release_units[unit];
        const keys = RELEASE_UNIT_KEYS[unit];
        if (!exactKeys(item, keys, `candidate manifest release_units.${unit}`, errors)) continue;
        if (typeof item.input_ref !== "string" || !item.input_ref.trim()) {
          errors.push(`candidate manifest release_units.${unit}.input_ref must be non-empty`);
        } else {
          refs.push(item.input_ref);
        }
        if (!SHA256.test(item.sha256 || "")) {
          errors.push(`candidate manifest release_units.${unit}.sha256 is invalid`);
        }
        for (const digestKey of keys.filter((key) => key.endsWith("_digest") || key.endsWith("_sha256"))) {
          if (!SHA256.test(item[digestKey] || "")) {
            errors.push(`candidate manifest release_units.${unit}.${digestKey} is invalid`);
          }
        }
        for (const identityKey of keys.filter((key) => ![
          "input_ref", "sha256", "artifact_digest", "migration_bundle_sha256", "config_sha256",
        ].includes(key))) {
          if (typeof item[identityKey] !== "string" || !item[identityKey].trim()) {
            errors.push(`candidate manifest release_units.${unit}.${identityKey} must be non-empty`);
          }
        }
      }
    }
    if (new Set(refs).size !== refs.length) {
      errors.push("candidate manifest component and release-unit input_ref values must be unique");
    }
    if (exactKeys(
      value.deployment,
      ["deployment_id", "environment_class", "unit_set_sha256"],
      "candidate manifest deployment",
      errors,
    )) {
      for (const field of ["deployment_id", "environment_class"]) {
        if (typeof value.deployment[field] !== "string" || !value.deployment[field].trim()) {
          errors.push(`candidate manifest deployment.${field} must be non-empty`);
        }
      }
      if (!SHA256.test(value.deployment.unit_set_sha256 || "")
        || value.deployment.unit_set_sha256 !== digestCanonical(value.release_units)) {
        errors.push("candidate manifest deployment.unit_set_sha256 does not match release_units");
      }
    }
    if (exactKeys(
      value.deployment_attestation,
      [
        "input_ref", "sha256", "deployment_id", "environment_class",
        "observed_unit_set_sha256",
      ],
      "candidate manifest deployment_attestation",
      errors,
    )) {
      const attestation = value.deployment_attestation;
      if (typeof attestation.input_ref !== "string" || !attestation.input_ref.trim()) {
        errors.push("candidate manifest deployment_attestation.input_ref must be non-empty");
      } else {
        refs.push(attestation.input_ref);
      }
      for (const field of ["sha256", "observed_unit_set_sha256"]) {
        if (!SHA256.test(attestation[field] || "")) {
          errors.push(`candidate manifest deployment_attestation.${field} is invalid`);
        }
      }
      if (attestation.deployment_id !== value.deployment?.deployment_id
        || attestation.environment_class !== value.deployment?.environment_class
        || attestation.observed_unit_set_sha256 !== value.deployment?.unit_set_sha256) {
        errors.push("candidate manifest deployment_attestation does not match deployment identity");
      }
    }
    if (exactKeys(
      value.performance_budget,
      ["input_ref", "sha256", "load_profile"],
      "candidate manifest performance_budget",
      errors,
    )) {
      const budget = value.performance_budget;
      if (typeof budget.input_ref !== "string" || !budget.input_ref.trim()) {
        errors.push("candidate manifest performance_budget.input_ref must be non-empty");
      } else {
        refs.push(budget.input_ref);
      }
      if (!SHA256.test(budget.sha256 || "")) {
        errors.push("candidate manifest performance_budget.sha256 is invalid");
      }
      if (typeof budget.load_profile !== "string" || !budget.load_profile.trim()) {
        errors.push("candidate manifest performance_budget.load_profile must be non-empty");
      }
    }
    if (new Set(refs).size !== refs.length) {
      errors.push("candidate manifest component, release-unit, and semantic input_ref values must be unique");
    }
  }
  if (options.releaseIntent) {
    const actual = value.components.surface_inventory;
    const expected = options.releaseIntent.surface_inventory;
    if (actual?.authority_ref !== expected?.ref || actual?.sha256 !== expected?.sha256) {
      errors.push("candidate manifest surface inventory does not match the release intent");
    }
  }
  return errors;
}

function pluginCandidates(environment, paths) {
  return [
    environment?.ATLAS_WORKFLOW_PLUGIN_ROOT,
    paths?.codeHome && path.join(paths.codeHome, "plugins", "atlas-workflow"),
    path.join(path.resolve(__dirname, "../../../../.."), "plugins", "atlas-workflow"),
  ].filter(Boolean);
}

function loadReleaseContracts(environment, paths) {
  for (const root of pluginCandidates(environment, paths)) {
    const evidence = path.join(root, "contracts/release-certification/validators/evidence.js");
    const intent = path.join(root, "contracts/release-certification/validators/release-intent.js");
    const profile = path.join(root, "contracts/release-certification/validators/profile.js");
    const plan = path.join(root, "contracts/team-sdd/validators/execution-plan.js");
    const adapters = {
      "business-acceptance-v2@2": path.join(
        root, "contracts/release-certification/adapters/business-acceptance-v2.js",
      ),
      "formal-web-ui-v1@1": path.join(
        root, "contracts/release-certification/adapters/formal-web-ui-v1.js",
      ),
      "integrated-app-v1@1": path.join(
        root, "contracts/release-certification/adapters/integrated-app-v1.js",
      ),
      "release-data-v1@1": path.join(
        root, "contracts/release-certification/adapters/release-data-v1.js",
      ),
      "release-operability-v1@1": path.join(
        root, "contracts/release-certification/adapters/release-operability-v1.js",
      ),
    };
    if ([evidence, intent, profile, plan, ...Object.values(adapters)].every(fs.existsSync)) {
      const integratedAdapter = require(adapters["integrated-app-v1@1"]);
      return {
        ...require(evidence),
        ...require(intent),
        ...require(profile),
        ...require(plan),
        collectors: {
          "business-acceptance-v2@2": require(adapters["business-acceptance-v2@2"])
            .collectBusinessAcceptance,
          "formal-web-ui-v1@1": require(adapters["formal-web-ui-v1@1"])
            .collectFormalWebUi,
          "integrated-app-v1@1": require(adapters["integrated-app-v1@1"])
            .collectIntegratedApp,
          "release-data-v1@1": require(adapters["release-data-v1@1"])
            .collectReleaseData,
          "release-operability-v1@1": require(adapters["release-operability-v1@1"])
            .collectReleaseOperability,
        },
        integratedEvidenceRecordForRef: integratedAdapter.evidenceRecordForRef,
      };
    }
  }
  throw new ReleaseCertificationError("canonical release certification contracts are unavailable");
}

function resolveValidatedReleaseIntent({ contractMarkdown, environment, paths, releaseBinding }) {
  const contracts = loadReleaseContracts(environment, paths);
  const intent = contracts.extractReleaseIntent(contractMarkdown);
  if (!same(contracts.releasePlanBinding(intent), releaseBinding)) {
    throw new ReleaseCertificationError("release intent no longer matches execution authority");
  }
  return { contracts, intent };
}

function readJsonFile(file, label) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (error) {
    throw new ReleaseCertificationError(`${label} is unavailable: ${error.message}`);
  }
  if (stat.size > 4 * 1024 * 1024) throw new ReleaseCertificationError(`${label} exceeds 4 MiB`);
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("expected an object");
    return value;
  } catch (error) {
    throw new ReleaseCertificationError(`${label} is invalid JSON: ${error.message}`);
  }
}

function resolveIdentityRecord(paths, taskId, receipt) {
  if (!receipt?.identity_record) throw new ReleaseCertificationError("release receipt is missing identity_record");
  const file = path.isAbsolute(receipt.identity_record)
    ? receipt.identity_record
    : path.resolve(paths.codeHome, receipt.identity_record);
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    throw new ReleaseCertificationError(`release receipt identity record is unavailable: ${error.message}`);
  }
  const verificationRoot = path.join(taskArtifactDir(paths, taskId), "verification");
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(file) !== file
    || !inside(verificationRoot, file)) {
    throw new ReleaseCertificationError("release receipt identity record must be a canonical task verification artifact");
  }
  const record = readJsonFile(file, "release receipt identity record");
  if (record.record_id !== receipt.record_id || record.identity_digest !== receipt.identity_digest) {
    throw new ReleaseCertificationError("release receipt summary does not match its identity record");
  }
  const revision = Number(receipt.verification_revision || receipt.event_revision || 0);
  const events = readAuthoritativeEvents(taskEventFile(paths, taskId), taskId);
  const event = events.find((candidate) => (
    candidate.revision === revision
    && (!receipt.verification_event_id || candidate.event_id === receipt.verification_event_id)
  ));
  if (!event || event.kind !== "verification.recorded"
    || event.data?.record_id !== record.record_id
    || event.data?.identity_digest !== record.identity_digest
    || event.data?.required_gate?.check_id !== record.required_gate?.check_id) {
    throw new ReleaseCertificationError("release receipt is not bound to its authoritative verification event");
  }
  return record;
}

function validatedInputs(record) {
  if (!Array.isArray(record.identity?.inputs)) {
    throw new ReleaseCertificationError("release receipt identity is missing inputs");
  }
  const inputs = new Map();
  for (const entry of record.identity.inputs) {
    validateCapturedInput(entry);
    if (inputs.has(entry.requested)) {
      throw new ReleaseCertificationError(`release receipt contains duplicate input reference: ${entry.requested}`);
    }
    inputs.set(entry.requested, entry);
  }
  return inputs;
}

function jsonInputs(inputs) {
  const values = [];
  for (const entry of inputs.values()) {
    try {
      values.push({ entry, value: readJsonFile(entry.path, `release input ${entry.requested}`) });
    } catch {
      // Binary evidence and other non-JSON inputs remain valid content-addressed evidence.
    }
  }
  return values;
}

function inside(directory, file) {
  const relative = path.relative(directory, file);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function contentInput(inputs, ref, digest, label) {
  const entry = inputs.get(ref);
  if (!entry || entry.sha256 !== digest) {
    throw new ReleaseCertificationError(`${label} is not bound to a matching verification input`);
  }
  return entry;
}

function deriveReleaseDecision(releaseBinding, manifestDigest, facts) {
  const results = releaseBinding.requirement_refs.map((requirementRef) => {
    const fact = facts.get(requirementRef);
    const body = {
      requirement_ref: requirementRef,
      fact_id: fact.fact_id,
      submitted_outcome: fact.submitted_outcome,
      outcome: fact.outcome,
      reason_codes: [...fact.reason_codes],
    };
    return { ...body, result_id: digestCanonical(body) };
  });
  const status = results.some((result) => result.outcome === "failed")
    ? "denied"
    : results.some((result) => result.outcome === "cannot_verify")
      ? "cannot_verify"
      : "certified";
  const body = {
    schema_version: 1,
    authority: "derived-from-final-release-sweep",
    status,
    target_delivery_class: "product_release",
    intent_sha256: releaseBinding.intent_sha256,
    profile_ref: releaseBinding.profile_ref,
    profile_sha256: releaseBinding.profile_sha256,
    candidate_manifest_digest: manifestDigest,
    requirement_results: results,
  };
  return { ...body, decision_id: digestCanonical(body) };
}

function recomputeFact(contracts, input, fact, policyBindings) {
  const policy = fact.policy_binding;
  const collector = contracts.collectors[policy.collector_adapter_ref];
  if (!collector) throw new ReleaseCertificationError(`unsupported collector: ${policy.collector_adapter_ref}`);
  const options = {
    candidateManifestDigest: fact.candidate_manifest_digest,
    evaluatedAt: fact.evaluated_at,
    policyBinding: policy,
  };
  const multiFactCollectors = new Set(["formal-web-ui-v1@1", "integrated-app-v1@1"]);
  const output = multiFactCollectors.has(policy.collector_adapter_ref)
    ? collector(input, {
      ...options,
      policyBindings: policyBindings.filter((item) => (
        item.collector_adapter_ref === policy.collector_adapter_ref
      )),
    })
    : collector(input, options);
  const selected = Array.isArray(output)
    ? output.find((item) => item.policy_binding.requirement_ref === policy.requirement_ref)
    : output;
  if (!selected || !same(selected, fact)) {
    throw new ReleaseCertificationError(
      `typed fact does not match the immutable collector result: ${policy.requirement_ref}`,
    );
  }
}

function integratedCandidateEvidenceErrors(input, manifest) {
  const errors = [];
  const record = (dimension, control) => input.evidence_records?.find((item) => (
    item?.record?.dimension === dimension && item?.record?.control_id === control
  ))?.record;
  const migration = record("data-integrity", "schema_migration")?.observations;
  if (migration?.migration_bundle_sha256
    !== manifest.release_units.database.migration_bundle_sha256) {
    errors.push("schema migration evidence does not match the candidate migration bundle");
  }
  const restore = record("data-integrity", "backup_restore")?.observations;
  if (restore?.restored_schema_head !== manifest.release_units.database.schema_head) {
    errors.push("backup restore evidence does not match the candidate schema head");
  }
  const sharedContract = record("api-contract", "shared_contract")?.observations;
  if (sharedContract?.contract_version !== manifest.release_units.api.contract_version
    || sharedContract?.api_artifact_digest !== manifest.release_units.api.artifact_digest) {
    errors.push("API contract evidence does not match the candidate API release unit");
  }
  const contract = record("external-integration", "contract_binding")?.observations;
  if (contract?.contract_version !== manifest.release_units.external_integration.contract_version
    || contract?.config_sha256 !== manifest.release_units.external_integration.config_sha256) {
    errors.push("external contract evidence does not match the candidate contract or config identity");
  }
  const identity = record(
    "external-integration", "identity_credentials_rotation_revocation",
  )?.observations;
  if (identity?.credential_identity
    !== manifest.release_units.external_integration.credential_identity) {
    errors.push("external credential evidence does not match the candidate credential identity");
  }
  const declaredBudget = record("performance-resilience", "declared_budget")?.observations;
  if (declaredBudget?.thresholds_sha256 !== manifest.performance_budget.sha256
    || declaredBudget?.load_profile !== manifest.performance_budget.load_profile) {
    errors.push("performance evidence does not match the candidate performance budget");
  }
  return errors;
}

function evaluateReleaseSweep({
  contractMarkdown,
  environment = process.env,
  paths,
  receipts,
  releaseBinding,
  repo,
  snapshot,
  taskId,
  workType,
}) {
  const reasons = [];
  const summaries = [];
  try {
    const resolved = resolveValidatedReleaseIntent({
      contractMarkdown, environment, paths, releaseBinding,
    });
    const { contracts, intent } = resolved;
    const contractWorkType = contracts.extractContractWorkType(contractMarkdown);
    if (workType !== "implementation" || contractWorkType !== workType) {
      throw new ReleaseCertificationError(
        "release certification requires hash-bound work_type implementation",
      );
    }
    const profile = contracts.loadBundledProfile(releaseBinding.profile_ref);
    if (contracts.profileBinding(profile).profile_sha256 !== releaseBinding.profile_sha256) {
      throw new ReleaseCertificationError("release Profile no longer matches execution authority");
    }
    const expectedRefs = new Set(releaseBinding.requirement_refs);
    const selected = [];
    for (const receipt of receipts || []) {
      const record = resolveIdentityRecord(paths, taskId, receipt);
      if (!record.required_gate?.release_requirement) continue;
      selected.push({ record, summary: receipt });
    }
    if (selected.length !== expectedRefs.size) {
      throw new ReleaseCertificationError("final release sweep does not contain exactly one receipt per Profile requirement");
    }
    const policyBindings = selected.map(({ record }) => record.required_gate.release_requirement);

    const facts = new Map();
    const atomicCollectorSources = new Map();
    let sharedManifest = null;
    let sharedManifestPath = "";
    const releaseRoot = path.join(taskArtifactDir(paths, taskId), "release");
    for (const { record, summary } of selected) {
      const gate = record.required_gate;
      const requirement = gate.release_requirement;
      const requirementRef = requirement.requirement_ref;
      const withoutId = { ...record };
      delete withoutId.record_id;
      if (record.schema_version !== 3 || record.task_id !== taskId
        || record.record_id !== digestCanonical(withoutId)
        || record.identity_digest !== digestCanonical(record.identity || {})
        || record.outcome !== "passed" || record.verdict !== "passed"
        || record.provenance !== "fresh-executed" || record.snapshot_stable !== true
        || gate.final_only !== true || gate.cache_policy !== "fresh-executed") {
        throw new ReleaseCertificationError(`release receipt is not a stable final pass: ${requirementRef || "unknown"}`);
      }
      if (!expectedRefs.has(requirementRef) || facts.has(requirementRef)) {
        throw new ReleaseCertificationError(`release receipt requirement is missing, duplicate, or unexpected: ${requirementRef || "unknown"}`);
      }
      if (record.identity?.repo_root_realpath !== repo || record.identity?.head_commit !== snapshot.head_sha
        || record.identity?.worktree?.tree_oid !== snapshot.tree_oid) {
        throw new ReleaseCertificationError(`release receipt was not executed against the final candidate: ${requirementRef}`);
      }
      const inputs = validatedInputs(record);
      const json = jsonInputs(inputs);
      const manifests = json.filter(({ value }) => (
        [1, 2].includes(value.schema_version)
        && value.components && value.source && value.manifest_digest
      ));
      const releaseFacts = json.filter(({ value }) => (
        value.schema_version === 1 && value.policy_binding && value.fact_id
      ));
      if (manifests.length !== 1 || releaseFacts.length !== 1) {
        throw new ReleaseCertificationError(`release receipt must bind exactly one candidate manifest and one typed fact: ${requirementRef}`);
      }
      const manifestEntry = manifests[0].entry;
      const manifest = manifests[0].value;
      if (!inside(releaseRoot, manifestEntry.path)) {
        throw new ReleaseCertificationError("candidate manifest must be a canonical task release artifact");
      }
      const manifestErrors = validateCandidateManifest(manifest, {
        releaseBinding, releaseIntent: intent, repo, snapshot,
      });
      if (manifestErrors.length > 0) throw new ReleaseCertificationError(manifestErrors.join("; "));
      if (sharedManifest && (!same(sharedManifest, manifest) || sharedManifestPath !== manifestEntry.path)) {
        throw new ReleaseCertificationError("release receipts do not bind one identical candidate manifest");
      }
      sharedManifest = manifest;
      sharedManifestPath = manifestEntry.path;
      for (const component of COMPONENTS) {
        const item = manifest.components[component];
        contentInput(inputs, item.input_ref, item.sha256, `candidate component ${component}`);
      }
      if (manifest.schema_version === 2) {
        for (const unit of INTEGRATED_RELEASE_UNITS) {
          const item = manifest.release_units[unit];
          contentInput(inputs, item.input_ref, item.sha256, `candidate release unit ${unit}`);
        }
        const attestationEntry = contentInput(
          inputs,
          manifest.deployment_attestation.input_ref,
          manifest.deployment_attestation.sha256,
          "candidate deployment attestation",
        );
        const attestationValue = readJsonFile(
          attestationEntry.path,
          "candidate deployment attestation",
        );
        if (!same(attestationValue, {
          deployment_id: manifest.deployment_attestation.deployment_id,
          environment_class: manifest.deployment_attestation.environment_class,
          observed_unit_set_sha256: manifest.deployment_attestation.observed_unit_set_sha256,
        })) {
          throw new ReleaseCertificationError(
            "deployment attestation content does not match the candidate deployment identity",
          );
        }
        const budgetEntry = contentInput(
          inputs,
          manifest.performance_budget.input_ref,
          manifest.performance_budget.sha256,
          "candidate performance budget",
        );
        const budgetValue = readJsonFile(budgetEntry.path, "candidate performance budget");
        if (budgetValue.load_profile !== manifest.performance_budget.load_profile) {
          throw new ReleaseCertificationError(
            "performance budget content does not match the candidate load profile",
          );
        }
      }

      const factEntry = releaseFacts[0].entry;
      const fact = releaseFacts[0].value;
      if (!inside(releaseRoot, factEntry.path)
        || !(record.result?.evidence_refs || []).includes(factEntry.requested)) {
        throw new ReleaseCertificationError(`typed fact is not a declared task release artifact: ${requirementRef}`);
      }
      const factErrors = contracts.validateReleaseFact(fact, {
        expectedPolicyBinding: requirement,
        candidateManifestDigest: manifest.manifest_digest,
      });
      if (factErrors.length > 0) throw new ReleaseCertificationError(factErrors.join("; "));
      if (fact.evaluated_at !== record.created_at) {
        throw new ReleaseCertificationError(`typed fact timestamp does not match its receipt: ${requirementRef}`);
      }
      const sourceInputs = json.filter(({ entry, value }) => (
        entry.path !== manifestEntry.path
        && entry.path !== factEntry.path
        && digestCanonical(value) === fact.source.sha256
      ));
      if (sourceInputs.length !== 1) {
        throw new ReleaseCertificationError(`typed fact must bind exactly one raw collector input: ${requirementRef}`);
      }
      const rawInput = sourceInputs[0].value;
      if (["formal-web-ui-v1@1", "integrated-app-v1@1"].includes(
        requirement.collector_adapter_ref,
      )) {
        const sourceEntry = sourceInputs[0].entry;
        const sourceIdentity = {
          path: fs.realpathSync(sourceEntry.path),
          sha256: sourceEntry.sha256,
          canonical_source_sha256: fact.source.sha256,
          review_id: rawInput.review_id,
          evidence_set_id: rawInput.evidence_set_id || null,
          run_id: rawInput.run_id || null,
        };
        const previous = atomicCollectorSources.get(requirement.collector_adapter_ref);
        if (previous && !same(previous, sourceIdentity)) {
          throw new ReleaseCertificationError(
            `multi-fact collector receipts must bind one atomic raw review: ${requirement.collector_adapter_ref}`,
          );
        }
        atomicCollectorSources.set(requirement.collector_adapter_ref, sourceIdentity);
      }
      if (requirement.collector_adapter_ref === "integrated-app-v1@1") {
        const expectedComponents = Object.fromEntries(INTEGRATED_RELEASE_UNITS.map((unit) => [
          unit, manifest.release_units?.[unit]?.sha256,
        ]));
        if (manifest.schema_version !== 2
          || rawInput.deployment_id !== manifest.deployment?.deployment_id
          || rawInput.observed_unit_set_sha256
            !== manifest.deployment_attestation?.observed_unit_set_sha256
          || !same(rawInput.candidate_components, expectedComponents)) {
          throw new ReleaseCertificationError(
            `integrated collector input does not bind the candidate release units: ${requirementRef}`,
          );
        }
        const candidateEvidenceErrors = integratedCandidateEvidenceErrors(rawInput, manifest);
        if (candidateEvidenceErrors.length > 0) {
          throw new ReleaseCertificationError(candidateEvidenceErrors.join("; "));
        }
      }
      recomputeFact(contracts, rawInput, fact, policyBindings);
      for (const evidence of fact.evidence_refs) {
        const entry = contentInput(
          inputs, evidence.ref, evidence.sha256, `typed fact evidence ${evidence.ref}`,
        );
        if (evidence.kind === "integrated_control_evidence") {
          const embedded = contracts.integratedEvidenceRecordForRef(rawInput, evidence.ref);
          if (!embedded || !same(readJsonFile(entry.path, `integrated evidence ${evidence.ref}`), embedded)) {
            throw new ReleaseCertificationError(
              `integrated evidence content does not match its typed collector record: ${evidence.ref}`,
            );
          }
        }
      }
      let effectiveFact = { ...fact, submitted_outcome: fact.outcome };
      if (fact.outcome === "passed") {
        const provenance = record.result?.producer_provenance;
        const provenanceErrors = validateReleaseProducerProvenance(provenance, {
          candidateManifestDigest: manifest.manifest_digest,
          identity: record.identity,
          requirementRef,
          sourceEntry: sourceInputs[0].entry,
        });
        if (provenanceErrors.length > 0) {
          effectiveFact = {
            ...effectiveFact,
            outcome: "cannot_verify",
            reason_codes: [provenance
              ? "TRUSTED_PRODUCER_PROVENANCE_INVALID"
              : "TRUSTED_PRODUCER_PROVENANCE_MISSING"],
            summary: "The submitted fact is structurally consistent, but no trusted workflow producer proves the underlying observation.",
          };
        }
      }
      facts.set(requirementRef, effectiveFact);
      summaries.push({
        check_id: gate.check_id,
        requirement_ref: requirementRef,
        record_id: record.record_id,
        fact_id: fact.fact_id,
        submitted_outcome: fact.outcome,
        outcome: effectiveFact.outcome,
        reason_codes: [...effectiveFact.reason_codes],
        candidate_manifest_digest: manifest.manifest_digest,
        identity_record: summary.identity_record || "",
      });
    }
    if (!sharedManifest || facts.size !== expectedRefs.size) {
      throw new ReleaseCertificationError("final release sweep coverage is incomplete");
    }
    return {
      admissible: true,
      decision: deriveReleaseDecision(releaseBinding, sharedManifest.manifest_digest, facts),
      reasons: [],
      receiptSummaries: summaries,
    };
  } catch (error) {
    reasons.push(error.message || String(error));
    return { admissible: false, decision: null, reasons, receiptSummaries: [] };
  }
}

module.exports = {
  COMPONENTS,
  INTEGRATED_RELEASE_UNITS,
  ReleaseCertificationError,
  buildCandidateManifest,
  deriveReleaseDecision,
  evaluateReleaseSweep,
  resolveValidatedReleaseIntent,
  validateCandidateManifest,
};
