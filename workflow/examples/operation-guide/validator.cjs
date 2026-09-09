"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

async function validate(input) {
  const root = input.run_context.artifact_root;
  const contract = fs.readFileSync(path.join(root, "../frozen-contract"));
  assert.equal(hash(contract), input.run_context.contract_digest, "场景内容不匹配");
  const scenario = JSON.parse(contract);
  const flow = JSON.parse(fs.readFileSync(path.join(root, "flow.json")));
  assert.equal(flow.run_id, input.run_context.run_id, "视频流程不属于本次运行");
  assert.equal(flow.attempt, input.run_context.attempt);
  assert.equal(flow.contract_digest, input.run_context.contract_digest);
  assert.equal(flow.app_sha256, hash(fs.readFileSync(path.join(__dirname, "app.html"))));
  assert.deepEqual(flow.record, {id:"R-001",name:scenario.recordName});
  assert.deepEqual(flow.steps.map(step => step.id), ["entry", "input", "submit", "confirm"]);
  for (const [index, step] of flow.steps.entries()) {
    for (const key of ["id", "title", "action", "explanation", "expected"]) assert.equal(step[key], scenario.steps[index][key]);
    assert.ok(typeof step.observed === "string" && step.observed.length > 0);
  }
  assert.equal(flow.steps[1].observed, scenario.recordName);
  assert.ok(flow.steps[3].observed.includes(`${scenario.recordName} · 编号 R-001`));
  if (input.claim_id === "flow") return;
  assert.equal(input.claim_id, "materials");
  assert.equal(flow.mode, "manual");
  const movie = path.join(root, "操作演示.mp4");
  const probe = spawnSync("ffprobe", ["-v","error","-show_entries","format=duration:stream=codec_type,width,height","-of","json",movie], {encoding:"utf8",timeout:60000});
  assert.equal(probe.status, 0, "视频不可读取");
  const media = JSON.parse(probe.stdout), duration = Number(media.format.duration);
  assert.ok(duration > 0 && Math.abs(duration - flow.duration) < 0.1);
  assert.ok(media.streams.some(stream => stream.codec_type === "video" && stream.width === 1920 && stream.height === 1080));
  const decode = spawnSync("ffmpeg", ["-v","error","-xerror","-i",movie,"-f","null","-"], {encoding:"utf8",timeout:60000});
  assert.equal(decode.status, 0, "视频不能完整解码");
  const html = fs.readFileSync(path.join(root, "操作手册.html"), "utf8");
  assert.ok(!/<script\b/i.test(html), "离线手册不需要脚本");
  const { chromium } = require(process.env.ATLAS_GUIDE_PLAYWRIGHT || "../../../plugins/atlas-workflow/tools/atlas-3d-harness/node_modules/playwright-core");
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(3000);
    await page.route(/^https?:/, route => route.abort());
    await page.goto(require("node:url").pathToFileURL(path.join(root,"操作手册.html")).href);
    assert.equal(await page.locator('meta[name="run-id"]').getAttribute("content"), input.run_context.run_id);
    assert.ok((await page.locator("aside").innerText()).includes(`示例版本 ${flow.app_sha256.slice(0,12)}`));
    assert.equal(await page.locator("section[data-start]").count(), scenario.steps.length);
    assert.equal(await page.locator("video").getAttribute("src"), "操作演示.mp4");
    await page.waitForFunction(() => document.querySelector("video").readyState >= 1);
    let end = 0;
    for (const [index, step] of flow.steps.entries()) {
      assert.ok(Number.isFinite(step.start) && step.start >= end && step.end > step.start && step.end <= duration, "时间码超出视频或步骤重叠");
      const section = page.locator(`#${step.id}`);
      assert.equal(Number(await section.getAttribute("data-start")), step.start);
      assert.equal(Number(await section.getAttribute("data-end")), step.end);
      assert.equal(await section.locator("h2").innerText(), `${index+1}. ${step.title}`);
      const text = await section.innerText();
      for (const key of ["action","explanation","expected","observed"]) assert.ok(text.replace(/\s+/g," ").includes(step[key].replace(/\s+/g," ")), `手册缺少 ${step.id} 的 ${key}`);
      assert.equal(await section.locator("a").getAttribute("href"), `操作演示.mp4#t=${step.start.toFixed(2)},${step.end.toFixed(2)}`);
      const png = fs.readFileSync(path.join(root, `${step.id}.png`)).toString("base64");
      assert.equal(await section.locator("img").getAttribute("src"), `data:image/png;base64,${png}`);
      assert.ok(await section.locator("img").evaluate(image => image.complete && image.naturalWidth === 1920));
      end = step.end;
    }
    for (const url of await page.locator("[src], [href]").evaluateAll(elements => elements.map(element => element.getAttribute("src") ?? element.getAttribute("href")))) {
      assert.ok(url.startsWith("data:image/png;base64,") || /^#[a-z]+$/.test(url) || /^操作演示\.mp4(?:#t=[\d.,]+)?$/.test(url), "手册包含外部或错误资源");
    }
  } finally { await browser.close(); }
}

if (require.main === module) {
  const input = JSON.parse(fs.readFileSync(0,"utf8"));
  validate(input).then(() => ({status:"passed",reason:"本地流程及所需材料结构可读取；清晰度仍需完整回看"}), error => ({status:"failed",reason:error.message}))
    .then(result => console.log(JSON.stringify({protocol_version:"1",validator_id:input.validator_id,claim_id:input.claim_id,input_digest:input.input_digest,evidence_digest:input.evidence_digest,...result})));
}
module.exports = { validate };
