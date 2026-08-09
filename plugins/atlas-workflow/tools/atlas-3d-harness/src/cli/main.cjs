"use strict";
const fs = require("fs"); const path = require("path");
const { readJson, validate } = require("../protocol/schema.cjs"); const { derive } = require("../launcher/derive.cjs");
const { invokeKernelWorker } = require("../kernel-integration/launcher.cjs");

function parse(argv) { const [command, ...rest] = argv; if (!command) throw new Error("command required"); const args = {}; for (let i = 0; i < rest.length; i += 2) { const key = rest[i]; if (!key.startsWith("--") || i + 1 >= rest.length) throw new Error("invalid CLI arguments"); if (args[key.slice(2)] !== undefined) throw new Error(`duplicate argument ${key}`); args[key.slice(2)] = rest[i + 1]; } return { command, args }; }
function exact(args, required, optional = []) { const keys = Object.keys(args), allowed = [...required, ...optional]; const unknown = keys.filter((key) => !allowed.includes(key)); if (unknown.length || required.some((key) => !(key in args))) throw new Error(`invalid arguments: ${unknown.join(",") || "missing required"}`); }
function checkDomain(runRoot) {
  const native = invokeKernelWorker({ operation: "check-run", run_root: path.resolve(runRoot) });
  if (!native.ok) return { status: "failed", reason: "native check-run did not pass", native };
  const result = JSON.parse(fs.readFileSync(path.join(runRoot, "run-result.json"))); if (result.technical_status !== "passed") return { status: result.technical_status, reason: "native status is not passed", native };
  const contract = validate("run-contract.schema.json", JSON.parse(fs.readFileSync(path.join(runRoot, "frozen-contract"), "utf8")));
  const loaded = require("../protocol/capture-set.cjs").loadCaptureSet(path.join(runRoot, "attempt-1"), contract.scenario);
  for (const capture of loaded.captures) { const domain = require("../oracles/domain.cjs").evaluateDomain(contract.scenario, capture); if (domain.status !== "passed") return { status: "failed", reason: domain.reason, native }; }
  for (const viewport of contract.scenario.viewports) for (const view of contract.scenario.views) {
    const series = loaded.captures.filter((capture) => capture.transport.pre.viewport_width === viewport.width && capture.transport.pre.viewport_height === viewport.height && capture.raw.view === view);
    const domain = require("../oracles/domain.cjs").evaluateSeries(contract.scenario, series); if (domain.status !== "passed") return { status: "failed", reason: domain.reason, native };
  }
  return { status: "passed", reason: "native then complete 3D capture matrix passed", native, capture_count: loaded.captures.length, replay: loaded.manifest.replay };
}
function dispatch(argv) {
  const { command, args } = parse(argv);
  if (command === "validate") { exact(args, ["scenario"]); const scenario = validate("scenario.schema.json", readJson(path.resolve(args.scenario))); return { status: "valid", schema: "atlas-3d-scenario@1", scenario_id: scenario.scenario_id }; }
  if (command === "run") {
    exact(args, ["scenario", "runtime-config", "artifact-root", "run-id"]);
    const scenario = validate("scenario.schema.json", readJson(path.resolve(args.scenario))); const runtime = validate("runtime-config.schema.json", readJson(path.resolve(args["runtime-config"])));
    const built = derive({ scenario, runtime, artifactRoot: args["artifact-root"], runId: args["run-id"] });
    const run = invokeKernelWorker({ operation: "run", project_config: built.configFile, contract: built.contractFile, artifact_root: path.resolve(args["artifact-root"]), run_id: args["run-id"], attempts: runtime.attempts });
    return { status: run.result.technical_status, run_root: run.run_root, identities: built.identities };
  }
  if (command === "check-run") { exact(args, ["run-root"]); return checkDomain(path.resolve(args["run-root"])); }
  if (command === "compare") { exact(args, ["left", "right", "purpose"]); return require("../compare/run-roots.cjs").compareRunRoots({ left: path.resolve(args.left), right: path.resolve(args.right), purpose: args.purpose }); }
  throw new Error(`unsupported command: ${command}`);
}
async function dispatchAsync(argv) {
  const { command, args } = parse(argv);
  if (command !== "run") return dispatch(argv);
  exact(args, ["scenario", "runtime-config", "artifact-root", "run-id"]);
  const scenario = validate("scenario.schema.json", readJson(path.resolve(args.scenario))); const runtime = validate("runtime-config.schema.json", readJson(path.resolve(args["runtime-config"])));
  const built = derive({ scenario, runtime, artifactRoot: args["artifact-root"], runId: args["run-id"] });
  const supervised = await require("../launcher/supervisor.cjs").invokeKernelWorkerSupervised({ operation: "run", project_config: built.configFile, contract: built.contractFile, artifact_root: path.resolve(args["artifact-root"]), run_id: args["run-id"], attempts: runtime.attempts });
  return { status: supervised.value.result.technical_status, run_root: supervised.value.run_root, identities: built.identities, supervisor: supervised.lifecycle };
}
async function main(argv = process.argv.slice(2)) { try { process.stdout.write(`${JSON.stringify(await dispatchAsync(argv))}\n`); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; } }
module.exports = { checkDomain, dispatch, dispatchAsync, main, parse };
