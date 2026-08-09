"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const test = require("node:test");
const {
  KERNEL_WORKER_ARGV,
  invokeKernelWorker,
  scrubEnvironment,
} = require("../../src/kernel-integration/launcher.cjs");

const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
function fixture(t) {
  const rawRoot = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-3d-kernel-"));
  const root = fs.realpathSync(rawRoot);
  t.after(() => fs.rmSync(rawRoot, { recursive: true, force: true }));
  const adapter = path.join(root, "stub-adapter.cjs");
  const validator = path.join(root, "stub-validator.cjs");
  fs.writeFileSync(path.join(root, "contract.md"), "stub 3D contract\n");
  fs.writeFileSync(adapter, `
const c=require("crypto"),fs=require("fs"),p=require("path");let input="";process.stdin.setEncoding("utf8");process.stdin.on("data",v=>input+=v);process.stdin.on("end",()=>{const value=JSON.parse(input);if(process.env.SHOULD_BE_SCRUBBED)process.exit(9);fs.writeFileSync(p.join(value.project_root,"adapter-started"),"started\\n");if(fs.existsSync(p.join(value.project_root,"hang")))return setInterval(()=>{},1000);const body=JSON.stringify({domain:"stub-3d",captureBindingId:"binding-fixture"});const evidencePath="capture.json";fs.writeFileSync(p.join(value.artifact_root,evidencePath),body);process.stdout.write(JSON.stringify({protocol_version:"1",phase:value.phase,facts:{domain:"stub-3d",stable:true},evidence_refs:[{id:"capture",claim_id:"capture-claim",status:"passed",path:evidencePath,sha256:c.createHash("sha256").update(body).digest("hex")}],failure_facts:[]})+"\\n");});
`);
  fs.writeFileSync(validator, `
const fs=require("fs"),p=require("path");let input="";process.stdin.setEncoding("utf8");process.stdin.on("data",v=>input+=v);process.stdin.on("end",()=>{const value=JSON.parse(input),ctx=value.run_context;if(!ctx||ctx.artifact_root!==p.join(p.dirname(ctx.artifact_root),\`attempt-\${ctx.attempt}\`))process.exit(8);process.stdout.write(JSON.stringify({protocol_version:"1",validator_id:value.validator_id,claim_id:value.claim_id,input_digest:value.input_digest,evidence_digest:value.evidence_digest,status:"passed",reason:"stub 3D current-attempt binding"})+"\\n");});
`);
  const config = {
    schema_version: 1,
    protocol_version: "1",
    task_id: "atlas-3d-stub",
    scenario_id: "stub-domain",
    project_root: root,
    adapter: { argv: [process.execPath, adapter] },
    phases: ["capture"],
    validators: [{ id: "stub-validator", claim_id: "capture-claim", argv: [process.execPath, validator], input_context: "run-context@1" }],
    required_evidence: [{ id: "capture", claim_id: "capture-claim" }],
  };
  fs.writeFileSync(path.join(root, "project.json"), `${JSON.stringify(config)}\n`);
  return { root, config: path.join(root, "project.json"), contract: path.join(root, "contract.md"), runs: path.join(root, "runs") };
}

test("owned worker direct-imports the existing kernel with current-attempt context", (t) => {
  const item = fixture(t);
  process.env.SHOULD_BE_SCRUBBED = "yes";
  t.after(() => { delete process.env.SHOULD_BE_SCRUBBED; });
  assert.deepStrictEqual(KERNEL_WORKER_ARGV, Object.freeze([process.execPath, path.resolve(__dirname, "../../src/kernel-integration/worker.cjs")]));
  assert.strictEqual(scrubEnvironment().SHOULD_BE_SCRUBBED, undefined);
  const run = invokeKernelWorker({ operation: "run", project_config: item.config, contract: item.contract, artifact_root: item.runs, run_id: "current-attempt", attempts: 2 });
  assert.strictEqual(run.result.technical_status, "passed");
  assert.strictEqual(invokeKernelWorker({ operation: "check-run", run_root: run.run_root }).ok, true);
  const index = JSON.parse(fs.readFileSync(path.join(run.run_root, "evidence-index.json")));
  assert.notStrictEqual(index.validators[0].input_digest, index.validators[1].input_digest);
  for (const attempt of [1, 2]) assert.strictEqual(JSON.parse(fs.readFileSync(path.join(run.run_root, `attempt-${attempt}/capture.json`))).captureBindingId, "binding-fixture");

  const indexFile = path.join(run.run_root, "evidence-index.json");
  const resultFile = path.join(run.run_root, "run-result.json");
  index.validators[1].input_digest = index.validators[0].input_digest;
  fs.writeFileSync(indexFile, `${JSON.stringify(index)}\n`);
  const result = JSON.parse(fs.readFileSync(resultFile));
  result.evidence_index_digest = digest(fs.readFileSync(indexFile));
  fs.writeFileSync(resultFile, `${JSON.stringify(result)}\n`);
  assert.throws(() => invokeKernelWorker({ operation: "check-run", run_root: run.run_root }), /validator closure/);
});

test("outer termination leaves an incomplete root for native check-run to reject", async (t) => {
  const item = fixture(t);
  fs.writeFileSync(path.join(item.root, "hang"), "yes\n");
  const request = { operation: "run", project_config: item.config, contract: item.contract, artifact_root: item.runs, run_id: "terminated", attempts: 1 };
  const child = spawn(KERNEL_WORKER_ARGV[0], KERNEL_WORKER_ARGV.slice(1), { detached: true, env: scrubEnvironment(), stdio: ["pipe", "ignore", "ignore"] });
  child.stdin.end(`${JSON.stringify(request)}\n`);
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(path.join(item.root, "adapter-started")) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(fs.existsSync(path.join(item.root, "adapter-started")));
  const closed = new Promise((resolve) => child.once("close", resolve));
  process.kill(-child.pid, "SIGTERM");
  await closed;
  const runRoot = path.join(item.runs, "terminated");
  assert.ok(fs.existsSync(path.join(runRoot, "manifest.json")));
  for (const control of ["attempt-1/attempt.json", "evidence-index.json", "run-result.json"]) assert.strictEqual(fs.existsSync(path.join(runRoot, control)), false);
  assert.throws(() => invokeKernelWorker({ operation: "check-run", run_root: runRoot }), /run result/);
});

test("worker rejects multi-phase facade configuration", (t) => {
  const item = fixture(t);
  const config = JSON.parse(fs.readFileSync(item.config));
  config.phases.push("second-kernel");
  fs.writeFileSync(item.config, `${JSON.stringify(config)}\n`);
  assert.throws(() => invokeKernelWorker({ operation: "run", project_config: item.config, contract: item.contract, artifact_root: item.runs, run_id: "multi", attempts: 1 }), /固定代码 policy/);
  assert.strictEqual(fs.existsSync(path.join(item.root, "adapter-started")), false);
});

test("source replacement after facade precheck cannot bypass the kernel phase policy", (t) => {
  const item = fixture(t);
  const prechecked = JSON.parse(fs.readFileSync(item.config));
  assert.deepStrictEqual(prechecked.phases, ["capture"]);
  prechecked.phases.push("second-kernel");
  fs.writeFileSync(item.config, `${JSON.stringify(prechecked)}\n`);
  assert.throws(() => invokeKernelWorker({ operation: "run", project_config: item.config, contract: item.contract, artifact_root: item.runs, run_id: "toctou", attempts: 1 }), /固定代码 policy/);
  assert.strictEqual(fs.existsSync(path.join(item.root, "adapter-started")), false);
  assert.strictEqual(fs.existsSync(path.join(item.runs, "toctou")), false);
});
