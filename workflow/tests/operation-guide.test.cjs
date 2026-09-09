"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validate } = require("../examples/operation-guide/validator.cjs");
const root = path.resolve(__dirname, "../..");
const example = path.join(root, "workflow/examples/operation-guide");
const requestedOutput = process.env.ATLAS_GUIDE_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), "atlas-operation-guide-"));
fs.mkdirSync(requestedOutput, {recursive:true});
const output = fs.realpathSync(requestedOutput);

function cli(args, expected = 0) {
  const child = spawnSync(process.execPath, [path.join(root, "workflow/bin/codex-web-acceptance"), ...args, "--format", "json"], {encoding:"utf8",timeout:180000});
  assert.equal(child.status, expected, child.stderr || child.stdout || child.error?.message);
  return JSON.parse(child.stdout);
}
function run(mode) {
  return cli(["run","--project-config",path.join(example,`${mode}.config.json`),"--contract",path.join(example,"scenario.json"),"--artifact-root",output,"--run-id",mode]);
}

async function main() {
  console.log(`operation_guide_output=${output}`);
  const standard = run("standard");
  assert.equal(standard.result.technical_status,"passed");
  assert.equal(fs.existsSync(path.join(standard.run_root,"attempt-1/操作演示.mp4")),false);
  assert.equal(fs.existsSync(path.join(standard.run_root,"attempt-1/操作手册.html")),false);
  console.log("PASS standard mode: real journey without media requirements");
  const manual = run("manual");
  assert.equal(manual.result.technical_status,"passed");
  assert.equal(cli(["check-run","--run-root",manual.run_root]).ok,true);
  console.log("PASS manual mode: real recording, dual evidence, independent validator, check-run");

  const config = JSON.parse(fs.readFileSync(path.join(example,"manual.config.json")));
  config.project_root = example;
  config.adapter.argv = [process.execPath,"adapter.cjs"];
  const missingConfig = path.join(output,"missing-materials.config.json");
  fs.writeFileSync(missingConfig,JSON.stringify(config));
  const missing = cli(["run","--project-config",missingConfig,"--contract",path.join(example,"scenario.json"),"--artifact-root",output,"--run-id","missing-materials"],2);
  assert.match(missing.result.attempts[0].reason,/required evidence 未通过: video/);
  console.log("PASS selected delivery cannot fall back to a successful standard journey");

  const copy = path.join(output,"material-counterexample");
  const cases = [
    ["missing video", target => fs.unlinkSync(path.join(target,"操作演示.mp4")), /视频不可读取/],
    ["missing manual", target => fs.unlinkSync(path.join(target,"操作手册.html")), /ENOENT/],
    ["damaged video", target => fs.writeFileSync(path.join(target,"操作演示.mp4"),"broken"), /视频不可读取/],
    ["damaged manual", target => fs.writeFileSync(path.join(target,"操作手册.html"),"broken"), /Timeout/],
    ["missing instruction", target => {
      const file = path.join(target,"操作手册.html");
      fs.writeFileSync(file,fs.readFileSync(file,"utf8").replace("名称用于在保存后识别同一条记录，提交前核对输入。",""));
    }, /手册缺少 input 的 explanation/],
    ["wrong timecode", target => {
      const file = path.join(target,"操作手册.html"); fs.writeFileSync(file,fs.readFileSync(file,"utf8").replace(/data-start="[^"]+"/,'data-start="9999"'));
    }, /Expected values/],
    ["stale run", target => {
      const file = path.join(target,"flow.json"), flow = JSON.parse(fs.readFileSync(file)); flow.run_id = "old-run"; fs.writeFileSync(file,JSON.stringify(flow));
    }, /视频流程不属于本次运行/]
  ];
  for (const [name, damage, expected] of cases) {
    fs.cpSync(manual.run_root,copy,{recursive:true,force:true});
    const target = path.join(copy,"attempt-1"); damage(target);
    await assert.rejects(validate({claim_id:"materials",run_context:{artifact_root:target,run_id:"manual",attempt:1,contract_digest:manual.result.contract_digest}}),expected);
    const audit = spawnSync(process.execPath,[path.join(root,"workflow/bin/codex-web-acceptance"),"check-run","--run-root",copy,"--format","json"],{encoding:"utf8"});
    assert.notEqual(audit.status,0,"篡改后 check-run 不得通过");
    console.log(`PASS material counterexample: ${name}`);
  }

  const portable = path.join(output,"交付示例"); fs.mkdirSync(portable);
  for (const file of ["操作演示.mp4","操作手册.html"]) fs.copyFileSync(path.join(manual.run_root,"attempt-1",file),path.join(portable,file));
  const { chromium } = require(process.env.ATLAS_GUIDE_PLAYWRIGHT || "../../plugins/atlas-workflow/tools/atlas-3d-harness/node_modules/playwright-core");
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    await page.route(/^https?:/, route => route.abort());
    await page.goto(require("node:url").pathToFileURL(path.join(portable,"操作手册.html")).href);
    assert.equal(await page.locator("img").count(),4);
    assert.ok((await page.locator("img").evaluateAll(images => images.map(image => image.complete && image.naturalWidth > 0))).every(Boolean));
    await page.locator("video").evaluate(video => {video.muted = true; return video.play();});
    await page.waitForFunction(() => document.querySelector("video").ended,{},{timeout:60000});
    await page.screenshot({path:path.join(output,"manual-preview.png"),fullPage:true});
    console.log("PASS relocated two-file delivery: offline images and full video playback");
  } finally { await browser.close(); }
  console.log(`operation_guide_delivery=${portable}`);
}
main().catch(error => {console.error(error);process.exitCode=1;});
