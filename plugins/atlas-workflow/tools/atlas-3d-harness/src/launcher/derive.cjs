"use strict";
const fs = require("fs"); const path = require("path");
const { fileDigest } = require("../security/digest.cjs"); const { frozenResourceDigests } = require("./server.cjs"); const { preflight } = require("../security/preflight.cjs"); const { TOOL_ROOT } = require("../resources/layout.cjs"); const { validate } = require("../protocol/schema.cjs"); const { LIMITS } = require("../protocol/limits.cjs"); const { expectedCombinations } = require("../protocol/capture-set.cjs");
function derive({ scenario, runtime, artifactRoot, runId }) {
  const provenance = preflight();
  const contract = validate("run-contract.schema.json", { schema_version: 1, scenario, runtime, resources: frozenResourceDigests(), provenance, limits: LIMITS });
  const inputRoot = path.join(path.resolve(artifactRoot), ".atlas-3d-frozen-inputs", runId); fs.mkdirSync(inputRoot, { recursive: true });
  const contractFile = path.join(inputRoot, "run-contract.json"), configFile = path.join(inputRoot, "web-project-config.json");
  const adapter = path.join(TOOL_ROOT, "src/adapter/capture.cjs"), validator = path.join(TOOL_ROOT, "src/validator/base.cjs");
  const validatorId = scenario.required_profiles.length ? "atlas-3d-industrial-kinematics" : "atlas-3d-base";
  const requiredEvidence = [{ id: "capture-set", claim_id: "atlas-3d-matrix-capture" }];
  for (const item of expectedCombinations(scenario)) requiredEvidence.push({ id: `capture-${item.key}`, claim_id: "atlas-3d-matrix-capture" }, { id: `png-${item.key}`, claim_id: "atlas-3d-matrix-capture" });
  if (requiredEvidence.length !== LIMITS.max_evidence_refs) throw new Error("EVIDENCE_REF_LIMIT");
  const config = { schema_version: 1, protocol_version: "1", task_id: "atlas-3d-harness", scenario_id: scenario.scenario_id, project_root: runtime.project_root, entrypoint: runtime.origin + "/", browser: "managed-chromium-1228", viewport: { width: scenario.viewports[0].width, height: scenario.viewports[0].height }, adapter: { argv: [process.execPath, adapter] }, phases: ["capture"], validators: [{ id: validatorId, claim_id: "atlas-3d-matrix-capture", argv: [process.execPath, validator], input_context: "run-context@1" }], required_evidence: requiredEvidence };
  fs.writeFileSync(contractFile, `${JSON.stringify(contract)}\n`, { flag: "wx" }); fs.writeFileSync(configFile, `${JSON.stringify(config)}\n`, { flag: "wx" });
  return { contract, contractFile, config, configFile, identities: { contract: fileDigest(contractFile), config: fileDigest(configFile) } };
}
module.exports = { derive };
