"use strict";

const crypto = require("crypto");
const childProcess = require("child_process");
const path = require("path");
const { isDeepStrictEqual } = require("util");
const {
  validateReleaseProducerProvenance,
} = require("../verification/release-provenance");
const { currentGrant } = require("./execution-grant");
const { teamClosureIssues } = require("./lane-registry");

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort())) {
    const actual = value && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value).sort().join(",")
      : typeof value;
    throw new Error(`${label} has invalid fields: ${actual}`);
  }
}

function seconds(event) {
  const value = event?.occurred_at;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value) {
    throw new Error("evidence event occurred_at must be canonical ISO UTC");
  }
  return value.replace(/\.\d{3}Z$/, "Z");
}

function acceptances(state) {
  const value = state?.slice_acceptances;
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function histories(state) {
  return Array.isArray(state?.execution_evidence_history)
    ? state.execution_evidence_history
    : [];
}

function requiredGates(state) {
  const value = state?.verification?.required_gates;
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
}

function digestCanonical(value) {
  return sha256(JSON.stringify(stableValue(value)));
}

function sourceIdentityRecord(source) {
  const identityPath = `verification/${path.basename(source.result?.identityFile || "")}`;
  const entry = (source.projection?.files || []).find(
    (candidate) => candidate.path === identityPath,
  );
  if (!entry?.content_base64) throw new Error("release verification identity receipt is missing");
  try {
    const record = JSON.parse(Buffer.from(entry.content_base64, "base64").toString("utf8"));
    const body = { ...record };
    delete body.record_id;
    if (record.record_id !== source.data?.record_id
      || record.record_id !== digestCanonical(body)
      || record.identity_digest !== source.data?.identity_digest
      || record.identity_digest !== digestCanonical(record.identity || {})) {
      throw new Error("identity digest binding is invalid");
    }
    return record;
  } catch (error) {
    throw new Error(`release verification identity receipt is invalid: ${error.message}`);
  }
}

function capturedReleaseJson(snapshot, entries, label) {
  exactKeys(snapshot, ["entry", "content_base64"], `${label} snapshot`);
  if (typeof snapshot.content_base64 !== "string") {
    throw new Error(`${label} snapshot content is invalid`);
  }
  const matches = (entries || []).filter((entry) => isDeepStrictEqual(entry, snapshot.entry));
  let bytes;
  try {
    bytes = Buffer.from(snapshot.content_base64, "base64");
  } catch (error) {
    throw new Error(`${label} snapshot content is invalid: ${error.message}`);
  }
  if (matches.length !== 1
    || bytes.toString("base64") !== snapshot.content_base64
    || bytes.length !== snapshot.entry?.size
    || sha256(bytes) !== snapshot.entry?.sha256) {
    throw new Error(`${label} snapshot differs from its verification identity`);
  }
  try {
    const value = JSON.parse(bytes.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("object required");
    }
    return value;
  } catch (error) {
    throw new Error(`${label} snapshot is invalid JSON: ${error.message}`);
  }
}

function validateReleaseFactSnapshot(fact, requirement, candidateManifestDigest, checkId) {
  exactKeys(fact, [
    "schema_version", "fact_id", "policy_binding", "candidate_manifest_digest",
    "outcome", "reason_codes", "summary", "source", "evidence_refs", "evaluated_at",
  ], "release fact snapshot");
  exactKeys(fact.source, ["ref", "sha256", "kind"], "release fact source");
  const body = { ...fact };
  delete body.fact_id;
  if (fact.schema_version !== 1 || fact.fact_id !== digestCanonical(body)
    || !isDeepStrictEqual(fact.policy_binding, requirement)
    || fact.candidate_manifest_digest !== candidateManifestDigest
    || !new Set(["passed", "failed", "cannot_verify"]).has(fact.outcome)
    || !Array.isArray(fact.reason_codes)
    || typeof fact.summary !== "string" || !fact.summary.trim()
    || typeof fact.source.ref !== "string" || !fact.source.ref.trim()
    || !/^sha256:[a-f0-9]{64}$/.test(fact.source.sha256 || "")
    || typeof fact.source.kind !== "string" || !fact.source.kind
    || !Array.isArray(fact.evidence_refs)
    || typeof fact.evaluated_at !== "string" || Number.isNaN(Date.parse(fact.evaluated_at))) {
    throw new Error(`release fact snapshot is invalid: ${checkId}`);
  }
}

function validateReleaseManifestSnapshot(manifest, source, checkId) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error(`release candidate snapshot is invalid: ${checkId}`);
  }
  const body = { ...manifest };
  delete body.manifest_digest;
  const identity = source.identity || {};
  const gate = source.required_gate || {};
  if (![1, 2].includes(manifest.schema_version)
    || !/^sha256:[a-f0-9]{64}$/.test(manifest.manifest_digest || "")
    || manifest.manifest_digest !== digestCanonical(body)
    || manifest.source?.repo_realpath !== gate.repo_realpath
    || manifest.source?.tree_oid !== gate.candidate_tree_oid
    || manifest.source?.repo_realpath !== identity.repo_root_realpath
    || manifest.source?.tree_oid !== identity.worktree?.tree_oid
    || manifest.source?.head_sha !== identity.head_commit) {
    throw new Error(`release candidate snapshot is invalid: ${checkId}`);
  }
}

function validateReleaseReceiptFields(record, source, scopeCheck, identityRecord) {
  const derived = [
    "release_fact_id", "release_fact_outcome", "candidate_manifest_digest",
  ];
  if (!scopeCheck.release_requirement) {
    if (derived.some((field) => Object.hasOwn(record, field))) {
      throw new Error(`non-release check carries release evidence: ${record.check_id}`);
    }
    if (source.data?.release_evidence !== null) {
      throw new Error(`non-release source event carries release evidence: ${record.check_id}`);
    }
    return;
  }
  if (derived.some((field) => !Object.hasOwn(record, field))
    || !/^sha256:[a-f0-9]{64}$/.test(record.release_fact_id || "")
    || !/^sha256:[a-f0-9]{64}$/.test(record.candidate_manifest_digest || "")
    || !new Set(["passed", "failed", "cannot_verify"]).has(record.release_fact_outcome)) {
    throw new Error(`release verification receipt fields are invalid: ${record.check_id}`);
  }
  const evidence = source.data?.release_evidence;
  exactKeys(evidence, [
    "schema_version", "requirement_ref", "fact", "candidate_manifest",
    "producer_provenance",
  ], "release evidence snapshot");
  const requirementRef = scopeCheck.release_requirement.requirement_ref;
  if (evidence.schema_version !== 1 || evidence.requirement_ref !== requirementRef) {
    throw new Error(`release verification receipt is not bound to source evidence: ${record.check_id}`);
  }
  const fact = capturedReleaseJson(
    evidence.fact,
    identityRecord.result?.outputs,
    "release fact",
  );
  const manifest = capturedReleaseJson(
    evidence.candidate_manifest,
    identityRecord.identity?.inputs,
    "release candidate",
  );
  validateReleaseFactSnapshot(
    fact,
    scopeCheck.release_requirement,
    manifest?.manifest_digest,
    record.check_id,
  );
  validateReleaseManifestSnapshot(manifest, {
    identity: identityRecord.identity,
    required_gate: source.data.required_gate,
  }, record.check_id);
  const producer = evidence.producer_provenance;
  const sourceEntries = (identityRecord.identity?.inputs || []).filter((entry) => (
    entry?.requested === producer?.source_ref && entry?.sha256 === producer?.source_sha256
  ));
  const provenanceErrors = validateReleaseProducerProvenance(producer, {
    candidateManifestDigest: manifest.manifest_digest,
    identity: identityRecord.identity,
    requirementRef,
    sourceEntry: sourceEntries.length === 1 ? sourceEntries[0] : null,
  });
  const effectiveOutcome = fact.outcome === "passed" && provenanceErrors.length > 0
    ? "cannot_verify"
    : fact.outcome;
  if (sourceEntries.length !== 1
    || !isDeepStrictEqual(producer, identityRecord.result?.producer_provenance)
    || record.release_fact_id !== fact.fact_id
    || record.candidate_manifest_digest !== manifest.manifest_digest
    || record.release_fact_outcome !== effectiveOutcome
    || fact.outcome !== "passed" || effectiveOutcome !== "passed") {
    throw new Error(`release verification receipt is not bound to source evidence: ${record.check_id}`);
  }
}

function validateAcceptedVerificationRecords(event, events, previousState, accepted, scopeSlice) {
  if (!Array.isArray(accepted.verification_records)
    || accepted.verification_records.length !== scopeSlice.checks.length
    || !isDeepStrictEqual(
      accepted.verification_records.map((record) => record.check_id).sort(),
      scopeSlice.checks.map((check) => check.check_id).sort(),
    )) {
    throw new Error("slice.accepted requires verification records");
  }
  const gates = requiredGates(previousState);
  for (const record of accepted.verification_records) {
    const gate = gates[record.check_id];
    const scopeCheck = scopeSlice.checks.find(
      (check) => check.check_id === record.check_id,
    );
    const receipt = { ...record };
    delete receipt.verification_event_id;
    delete receipt.verification_revision;
    delete receipt.release_fact_id;
    delete receipt.release_fact_outcome;
    delete receipt.candidate_manifest_digest;
    if (!gate || !scopeCheck || !isDeepStrictEqual(receipt, gate)) {
      const fields = [...new Set([
        ...Object.keys(receipt), ...Object.keys(gate || {}),
      ])].filter((field) => !isDeepStrictEqual(receipt[field], gate?.[field]));
      throw new Error(
        `slice.accepted verification receipt differs from gate: ${record.check_id}`
          + (fields.length > 0 ? ` (${fields.join(", ")})` : ""),
      );
    }
    if (record.slice_id !== scopeSlice.slice_id
      || record.brief_sha256 !== scopeSlice.brief_sha256
      || record.gate_class !== scopeCheck.gate_class
      || record.command_digest !== sha256(scopeCheck.command)
      || record.cache_policy !== scopeCheck.cache_policy
      || record.final_only !== scopeCheck.final_only
      || !isDeepStrictEqual(
        record.release_requirement || null,
        scopeCheck.release_requirement || null,
      )) {
      throw new Error(
        `slice.accepted verification receipt differs from scope check: ${record.check_id}`,
      );
    }
    const source = events.find((candidate) => candidate.revision === record.verification_revision);
    if (!source || source.kind !== "verification.recorded"
      || source.event_id !== record.verification_event_id
      || source.data?.record_id !== record.record_id
      || source.data?.identity_digest !== record.identity_digest
      || source.data?.verdict !== "passed" || source.data?.outcome !== "passed"
      || source.result?.exitCode !== 0
      || record.outcome !== "passed" || gate.outcome !== "passed"
      || record.provenance !== "fresh-executed"
      || gate.provenance !== "fresh-executed") {
      throw new Error(`slice.accepted verification receipt is not event-bound: ${record.check_id}`);
    }
    const identityRecord = sourceIdentityRecord(source);
    if (!isDeepStrictEqual(identityRecord.required_gate, source.data.required_gate)
      || identityRecord.identity?.repo_root_realpath
        !== currentGrant(previousState.execution_authority)?.scope?.repo?.realpath
      || identityRecord.identity?.head_commit !== accepted.actual_size.accepted_head_sha
      || identityRecord.identity?.worktree?.tree_oid !== accepted.actual_size.accepted_tree_oid
      || identityRecord.verdict !== "passed" || identityRecord.outcome !== "passed"
      || identityRecord.provenance !== "fresh-executed"
      || identityRecord.result?.exit_code !== 0
      || identityRecord.snapshot_stable !== true) {
      throw new Error(`slice.accepted verification identity differs from candidate: ${record.check_id}`);
    }
    validateReleaseReceiptFields(record, source, scopeCheck, identityRecord);
  }
}

function ownedPathMatcher(pattern) {
  const escaped = pattern.replace(/[.+^$()|[\]{}]/g, "\\$&")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/]*")
    .replace(/\0/g, ".*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${escaped}$`);
}

function canonicalChangedPath(value) {
  if (typeof value !== "string" || !value || value !== value.normalize("NFC")
    || path.isAbsolute(value) || value.includes("\\") || value.includes("//")
    || value.startsWith("./") || value.endsWith("/")
    || value.split("/").some((part) => !part || part === "." || part === "..")
    || /[\r\n\t\x00-\x1f\x7f]/.test(value)) {
    throw new Error(`slice.accepted changed path is not canonical: ${value}`);
  }
  return value;
}

function validateKeeperContent(grant, treeOid, keeper) {
  exactKeys(keeper, ["content_digest", "path", "reference"], "slice keeper output");
  canonicalChangedPath(keeper.path);
  if (typeof keeper.reference !== "string" || !keeper.reference
    || /[\r\n\t]/.test(keeper.reference)
    || !/^sha256:[a-f0-9]{64}$/.test(keeper.content_digest || "")) {
    throw new Error(`slice.accepted keeper output is invalid: ${keeper.reference || "unknown"}`);
  }
  const result = childProcess.spawnSync(
    "git",
    ["-C", grant.scope.repo.realpath, "show", `${treeOid}:${keeper.path}`],
    { encoding: null },
  );
  if (result.error || result.status !== 0 || sha256(result.stdout) !== keeper.content_digest) {
    throw new Error(`slice.accepted keeper output is not bound to candidate tree: ${keeper.reference}`);
  }
}

function gitObjectExists(repo, oid, type) {
  const result = childProcess.spawnSync(
    "git",
    ["-C", repo, "cat-file", "-e", `${oid}^{${type}}`],
    { encoding: "utf8" },
  );
  return !result.error && result.status === 0;
}

function immutableTreeDiff(repo, startTreeOid, acceptedTreeOid) {
  const names = childProcess.spawnSync(
    "git",
    [
      "-C", repo, "diff-tree", "--no-commit-id", "--no-renames", "-r",
      "--name-only", "-z", startTreeOid, acceptedTreeOid,
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  const numstat = childProcess.spawnSync(
    "git",
    [
      "-C", repo, "diff-tree", "--no-commit-id", "--no-renames", "-r",
      "--numstat", startTreeOid, acceptedTreeOid,
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (names.error || names.status !== 0 || numstat.error || numstat.status !== 0) {
    throw new Error("slice.accepted immutable tree diff is unavailable");
  }
  const changedPaths = names.stdout.split("\0").filter(Boolean).sort();
  let loc = 0;
  for (const row of numstat.stdout.split("\n")) {
    if (!row) continue;
    const [added, deleted] = row.split("\t", 2);
    if (/^\d+$/.test(added)) loc += Number(added);
    if (/^\d+$/.test(deleted)) loc += Number(deleted);
  }
  return { changed_files: changedPaths.length, changed_paths: changedPaths, loc };
}

function validateAccepted(event, events, previousState, nextState) {
  exactKeys(event.data, [
    "brief_path", "brief_sha256", "contract_sha256", "execution_plan_sha256",
    "keeper_outputs", "slice_id",
  ], "slice.accepted data");
  exactKeys(event.result, ["accepted"], "slice.accepted result");
  const accepted = event.result.accepted;
  exactKeys(accepted, [
    "authority_ref", "actual_size", "accepted_at", "brief_sha256", "contract_sha256",
    "execution_plan_sha256", "generation", "grant_id", "scope_digest", "evidence_epoch",
    "keeper_outputs", "operation_id", "revision", "slice_id", "status", "task_id",
    "team_run_id", "verification_records",
  ], "slice acceptance receipt");
  exactKeys(accepted.actual_size, [
    "accepted_head_sha", "accepted_tree_oid", "changed_files", "changed_paths",
    "current_tree_oid", "loc", "start_head_sha", "start_tree_oid",
  ], "slice acceptance actual size");
  const team = previousState.active_team;
  const grant = currentGrant(previousState.execution_authority);
  const scopeSlice = grant?.scope?.required_slices?.find(
    (slice) => slice.slice_id === event.data.slice_id,
  );
  const references = event.data.keeper_outputs.map((keeper) => keeper.reference).sort();
  const matchers = (scopeSlice?.owned_paths || []).map(ownedPathMatcher);
  const changedPaths = accepted.actual_size.changed_paths;
  const canonicalChangedPaths = Array.isArray(changedPaths)
    ? changedPaths.map(canonicalChangedPath)
    : [];
  const fileLimit = scopeSlice
    ? Math.max(1, Math.floor(scopeSlice.estimate.estimated_changed_files * 1.5))
    : 0;
  const locLimit = scopeSlice
    ? Math.max(1, Math.floor(scopeSlice.estimate.estimated_net_loc * 1.5))
    : 0;
  if (previousState.status !== "doing" || !team || !grant
    || !scopeSlice || teamClosureIssues(team, "succeeded").length > 0
    || accepted.status !== "accepted" || accepted.task_id !== event.task_id
    || accepted.operation_id !== event.operation_id || accepted.revision !== event.revision
    || accepted.accepted_at !== seconds(event)
    || accepted.slice_id !== event.data.slice_id || accepted.slice_id !== team.slice_id
    || accepted.team_run_id !== team.team_run_id || accepted.generation !== team.generation
    || accepted.authority_ref !== `team-run:${team.team_run_id}`
    || accepted.grant_id !== grant.grant_id || accepted.scope_digest !== grant.scope_digest
    || accepted.evidence_epoch !== grant.evidence_epoch
    || accepted.brief_sha256 !== event.data.brief_sha256
    || accepted.contract_sha256 !== event.data.contract_sha256
    || accepted.execution_plan_sha256 !== event.data.execution_plan_sha256
    || team.admission?.brief?.path !== event.data.brief_path
    || team.admission?.brief?.sha256 !== event.data.brief_sha256
    || team.admission?.brief?.contract_sha256 !== event.data.contract_sha256
    || team.admission?.brief?.execution_plan_sha256 !== event.data.execution_plan_sha256
    || !isDeepStrictEqual(accepted.keeper_outputs, event.data.keeper_outputs)
    || !isDeepStrictEqual(references, [...scopeSlice.keeper_outputs].sort())
    || scopeSlice.depends_on.some((dependency) => (
      previousState.slice_acceptances?.[dependency]?.status !== "accepted"
    ))
    || !Number.isInteger(accepted.actual_size.changed_files)
    || accepted.actual_size.changed_files < 0
    || accepted.actual_size.changed_files !== accepted.actual_size.changed_paths.length
    || !Number.isInteger(accepted.actual_size.loc) || accepted.actual_size.loc < 0
    || !isDeepStrictEqual(
      canonicalChangedPaths,
      [...new Set(canonicalChangedPaths)].sort(),
    )
    || accepted.actual_size.changed_files > fileLimit
    || accepted.actual_size.loc > locLimit
    || accepted.actual_size.changed_files > scopeSlice.budget.max_changed_files
    || accepted.actual_size.loc > scopeSlice.budget.max_loc
    || accepted.actual_size.changed_paths.some((changed) => (
      !matchers.some((matcher) => matcher.test(changed))
    ))
    || accepted.keeper_outputs.some((keeper) => (
      !accepted.actual_size.changed_paths.includes(keeper.path)
        || !matchers.some((matcher) => matcher.test(keeper.path))
    ))
    || accepted.actual_size.start_head_sha !== team.admission?.slice_start_snapshot?.head_sha
    || accepted.actual_size.start_tree_oid !== team.admission?.slice_start_snapshot?.tree_oid
    || accepted.actual_size.accepted_tree_oid !== accepted.actual_size.current_tree_oid
    || [
      accepted.actual_size.accepted_head_sha,
      accepted.actual_size.accepted_tree_oid,
      accepted.actual_size.current_tree_oid,
      accepted.actual_size.start_head_sha,
      accepted.actual_size.start_tree_oid,
    ].some((oid) => !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid || ""))
    || accepted.verification_records.some((record) => (
      record.candidate_tree_oid !== accepted.actual_size.accepted_tree_oid
    ))) {
    throw new Error("slice.accepted receipt differs from prior Team/authority/event evidence");
  }
  const repo = grant.scope.repo.realpath;
  if (!gitObjectExists(repo, accepted.actual_size.start_head_sha, "commit")
    || !gitObjectExists(repo, accepted.actual_size.accepted_head_sha, "commit")
    || !gitObjectExists(repo, accepted.actual_size.start_tree_oid, "tree")
    || !gitObjectExists(repo, accepted.actual_size.accepted_tree_oid, "tree")) {
    throw new Error("slice.accepted references unavailable immutable Git objects");
  }
  const measured = immutableTreeDiff(
    repo,
    accepted.actual_size.start_tree_oid,
    accepted.actual_size.accepted_tree_oid,
  );
  if (!isDeepStrictEqual(measured, {
    changed_files: accepted.actual_size.changed_files,
    changed_paths: accepted.actual_size.changed_paths,
    loc: accepted.actual_size.loc,
  })) {
    throw new Error("slice.accepted actual size differs from immutable Git tree diff");
  }
  for (const keeper of accepted.keeper_outputs) {
    validateKeeperContent(grant, accepted.actual_size.accepted_tree_oid, keeper);
  }
  validateAcceptedVerificationRecords(event, events, previousState, accepted, scopeSlice);
  if (!isDeepStrictEqual(acceptances(nextState), {
    ...acceptances(previousState),
    [accepted.slice_id]: accepted,
  }) || !isDeepStrictEqual(histories(nextState), histories(previousState))) {
    throw new Error("slice.accepted projection is not an exact one-receipt transition");
  }
}

function validateSuperseded(event, previousState, nextState) {
  exactKeys(event.data, ["authority_ref", "reason", "slice_id"], "slice.superseded data");
  exactKeys(event.result, ["superseded"], "slice.superseded result");
  const previous = acceptances(previousState)[event.data.slice_id];
  const superseded = event.result.superseded;
  exactKeys(superseded, [
    "accepted_operation_id", "authority_ref", "reason", "slice_id", "superseded_at",
    "grant_id", "scope_digest", "evidence_epoch",
  ], "slice supersession receipt");
  const grant = currentGrant(previousState.execution_authority);
  const acceptedDependents = (grant?.scope?.required_slices || [])
    .filter((slice) => slice.depends_on.includes(event.data.slice_id)
      && acceptances(previousState)[slice.slice_id]?.status === "accepted")
    .map((slice) => slice.slice_id)
    .sort();
  if (previousState.status !== "doing" || !grant || previous?.status !== "accepted"
    || acceptedDependents.length > 0
    || superseded.accepted_operation_id !== previous.operation_id
    || superseded.authority_ref !== event.data.authority_ref
    || superseded.reason !== event.data.reason || superseded.slice_id !== event.data.slice_id
    || superseded.superseded_at !== seconds(event)
    || superseded.grant_id !== grant.grant_id || superseded.scope_digest !== grant.scope_digest
    || superseded.evidence_epoch !== grant.evidence_epoch) {
    throw new Error("slice.superseded receipt differs from its prior acceptance/authority");
  }
  if (!isDeepStrictEqual(acceptances(nextState), {
    ...acceptances(previousState),
    [event.data.slice_id]: { ...previous, status: "superseded", superseded },
  }) || !isDeepStrictEqual(histories(nextState), histories(previousState))) {
    throw new Error("slice.superseded projection is not an exact one-receipt transition");
  }
}

function rebindReceipt(receipt, oldGrant, newGrant, revision) {
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
      rebindReceipt(record, oldGrant, newGrant, revision)
    ));
  }
  return rebound;
}

function validateReplanned(event, previousState, nextState) {
  const transition = event.authority_transition;
  const oldGrant = currentGrant(previousState.execution_authority);
  const newGrant = transition?.new_grant;
  if (!oldGrant || transition?.type !== "grant-replanned" || !newGrant) {
    throw new Error("authority.replanned evidence transition lacks its grant boundary");
  }
  const receipts = [];
  for (const gate of Object.values(requiredGates(previousState))) {
    if (gate?.record_id) receipts.push([gate.record_id, "verification", gate]);
  }
  for (const accepted of Object.values(acceptances(previousState))) {
    if (accepted?.operation_id && accepted.status === "accepted") {
      receipts.push([accepted.operation_id, "slice", accepted]);
    }
  }
  const retained = new Set(transition.evidence.retained.map((entry) => entry.receipt_id));
  const expectedGates = {};
  const expectedSlices = {};
  for (const [receiptId, type, value] of receipts) {
    if (!retained.has(receiptId)) continue;
    const rebound = rebindReceipt(value, oldGrant, newGrant, event.revision);
    if (type === "verification") expectedGates[rebound.check_id] = rebound;
    else expectedSlices[rebound.slice_id] = rebound;
  }
  const history = {
    schema_version: 1,
    old_grant_id: oldGrant.grant_id,
    new_grant_id: newGrant.grant_id,
    revision: event.revision,
    receipts: receipts.map(([receiptId, type, value]) => ({
      receipt_id: receiptId, type, value,
    })),
  };
  if (!isDeepStrictEqual(requiredGates(nextState), expectedGates)
    || !isDeepStrictEqual(acceptances(nextState), expectedSlices)
    || !isDeepStrictEqual(histories(nextState), [...histories(previousState), history])) {
    throw new Error("authority.replanned evidence projection is not the exact retention reducer");
  }
}

function validateEvidenceEventProjection(events) {
  for (const [index, event] of events.entries()) {
    const previousState = events[index - 1]?.projection?.state || {};
    const nextState = event.projection?.state || {};
    try {
      if (event.kind === "slice.accepted") {
        validateAccepted(event, events.slice(0, index), previousState, nextState);
      } else if (event.kind === "slice.superseded") {
        validateSuperseded(event, previousState, nextState);
      } else if (event.kind === "authority.replanned") {
        validateReplanned(event, previousState, nextState);
      } else if (!isDeepStrictEqual(acceptances(nextState), acceptances(previousState))
        || !isDeepStrictEqual(histories(nextState), histories(previousState))) {
        throw new Error("event changed slice/evidence history it does not own");
      }
    } catch (error) {
      throw new Error(
        `evidence event projection mismatch at revision ${event.revision}: ${error.message}`,
      );
    }
  }
}

module.exports = {
  validateEvidenceEventProjection,
};
