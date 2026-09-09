"use strict";

// Source-checkout example: recording belongs to this project's adapter, not the runner.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const escape = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const clock = seconds => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
function command(bin, args) {
  const result = spawnSync(bin, args, { encoding: "utf8", timeout: 60000 });
  if (result.error || result.status !== 0) throw new Error(`${bin} 不可用或执行失败：${result.error?.message || result.stderr}`);
  return result.stdout;
}

async function produce(input, mode) {
  assert.ok(["standard", "manual"].includes(mode), "示例模式必须为 standard 或 manual");
  const scenario = JSON.parse(fs.readFileSync(path.join(input.artifact_root, "../frozen-contract"), "utf8"));
  assert.deepEqual(scenario.steps.map(step => step.id), ["entry", "input", "submit", "confirm"]);
  const { chromium } = require(process.env.ATLAS_GUIDE_PLAYWRIGHT || "../../../plugins/atlas-workflow/tools/atlas-3d-harness/node_modules/playwright-core");
  if (mode === "manual") {
    command("ffmpeg", ["-version"]);
    command("ffprobe", ["-version"]);
  }
  let record = null;
  const app = fs.readFileSync(path.join(__dirname, "app.html"));
  const server = http.createServer(async (request, response) => {
    if (request.url === "/" && request.method === "GET") {
      response.writeHead(200, {"Content-Type":"text/html; charset=utf-8"}); response.end(app); return;
    }
    if (request.url !== "/record") { response.writeHead(404); response.end(); return; }
    if (request.method === "POST") {
      let body = ""; for await (const chunk of request) body += chunk;
      try { const value = JSON.parse(body); assert.equal(value.name, scenario.recordName); }
      catch { response.writeHead(400); response.end(); return; }
      await delay(1600);
      record = { id: "R-001", name: scenario.recordName };
    }
    response.writeHead(200, {"Content-Type":"application/json"}); response.end(JSON.stringify(record));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const entrypoint = `http://127.0.0.1:${server.address().port}/`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 },
      ...(mode === "manual" ? { recordVideo: { dir: path.join(input.artifact_root, "raw"), size: { width: 1920, height: 1080 } } } : {}) });
    const page = await context.newPage();
    const video = page.video();
    const started = performance.now();
    const elapsed = () => (performance.now() - started) / 1000;
    await page.goto(entrypoint);
    if (mode === "manual") await page.evaluate(() => {
      const caption = document.createElement("aside"); caption.id = "operation-caption";
      // Leave space below the instructions for native player controls at desktop size.
      caption.style.cssText = "position:fixed;bottom:0;left:0;right:0;height:245px;background:#13293fee;color:white;padding:22px 70px;font:26px/1.55 system-ui;z-index:1000;pointer-events:none;border-top:5px solid #57d4c0";
      document.body.append(caption);
    });
    const steps = [];
    const click = async locator => {
      if (mode === "manual") {
        await locator.evaluate(element => { element.style.outline = "5px solid #e69b00"; });
        await delay(700);
      }
      await locator.click();
      if (mode === "manual") {
        await delay(400);
        await locator.evaluate(element => { element.style.outline = ""; });
      }
    };
    for (const [index, step] of scenario.steps.entries()) {
      const start = elapsed();
      if (mode === "manual") {
        await page.locator("#operation-caption").evaluate((element, text) => { element.innerText = text; },
          `步骤 ${index + 1} · ${step.title}\n${step.action}\n${step.explanation}`);
        await delay(1600);
      }
      if (step.id === "entry") {
        assert.equal(await page.getByRole("heading", {name:"记录管理", exact:true}).count(), 1);
        assert.equal(await page.getByRole("textbox", {name:"记录名称", exact:true}).inputValue(), "");
      } else if (step.id === "input") {
        const field = page.getByRole("textbox", {name:"记录名称", exact:true});
        await click(field); await field.pressSequentially(scenario.recordName, {delay: 220});
        assert.equal(await field.inputValue(), scenario.recordName);
      } else if (step.id === "submit") {
        await click(page.getByRole("button", {name:"创建记录", exact:true}));
        await page.getByText("正在保存…", {exact:true}).waitFor();
        assert.equal(await page.getByRole("button", {name:"创建记录", exact:true}).isDisabled(), true);
        await page.getByText("已保存", {exact:true}).waitFor();
      } else {
        const responsePromise = page.waitForResponse(response => response.url() === `${entrypoint}record` && response.request().method() === "GET");
        await click(page.getByRole("button", {name:"重新读取", exact:true}));
        assert.deepEqual(await (await responsePromise).json(), {id:"R-001",name:scenario.recordName});
        await page.getByText(`${scenario.recordName} · 编号 R-001`, {exact:true}).waitFor();
      }
      const screenshot = `${step.id}.png`;
      await page.screenshot({ path: path.join(input.artifact_root, screenshot) });
      if (mode === "manual") await delay(Math.max(0, 7 - (elapsed() - start)) * 1000);
      const observed = step.id === "entry" ? "新建记录表单已显示，记录名称为空。"
        : step.id === "input" ? await page.locator("#name").inputValue()
        : `${await page.locator("#status").innerText()}；${await page.locator("#record").innerText()}`;
      steps.push({ ...step, start, end: elapsed(), screenshot, observed });
    }
    const recordedWallTime = elapsed();
    await context.close();
    const facts = { mode, run_id: input.run_id, attempt: input.attempt, contract_digest: input.contract_digest,
      app_sha256: hash(app), entrypoint, record, steps };
    const files = [["flow", "flow", "flow.json"]];
    if (mode === "manual") {
      const movie = path.join(input.artifact_root, "操作演示.mp4");
      command("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", await video.path(), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", movie]);
      const duration = Number(command("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", movie]).trim());
      // Align the uncut recorder timeline to its final encoded duration; retain raw capture.
      const offset = duration - recordedWallTime;
      for (const step of steps) { step.start = Math.max(0, step.start + offset); step.end = Math.min(duration, step.end + offset); }
      facts.duration = duration;
      const chapters = steps.map((step, index) => {
        const png = fs.readFileSync(path.join(input.artifact_root, step.screenshot)).toString("base64");
        return `<section id="${escape(step.id)}" data-start="${step.start}" data-end="${step.end}"><h2>${index + 1}. ${escape(step.title)}</h2><a href="操作演示.mp4#t=${step.start.toFixed(2)},${step.end.toFixed(2)}">视频 ${clock(step.start)}–${clock(step.end)}</a><p><strong>操作：</strong>${escape(step.action)}</p><p>${escape(step.explanation)}</p><p><strong>应看到：</strong>${escape(step.expected)}</p><p><strong>本次观察：</strong>${escape(step.observed)}</p><img alt="${escape(step.title)}操作结果" src="data:image/png;base64,${png}"></section>`;
      }).join("\n");
      fs.writeFileSync(path.join(input.artifact_root, "操作手册.html"), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="run-id" content="${escape(input.run_id)}"><title>${escape(scenario.title)} · 操作手册</title><style>body{max-width:1080px;margin:40px auto;padding:0 24px;color:#182539;font:18px/1.8 system-ui,sans-serif}h1{font-size:36px}h2{font-size:26px}section{margin:40px 0;padding-top:20px;border-top:1px solid #d5deea}img,video{width:100%;border:1px solid #d5deea;border-radius:8px}a{color:#1761c5}aside{background:#eef5fc;padding:20px;border-radius:8px}</style><h1>${escape(scenario.title)}</h1><aside><p>角色：${escape(scenario.role)}</p><p>${escape(scenario.prerequisites)}</p><p>环境：本机浏览器示例 · 示例版本 ${facts.app_sha256.slice(0,12)}</p><p>本次入口 ${escape(entrypoint)}（示例关闭后失效）</p></aside><p>先阅读各步操作，也可观看完整演示。视频与本文件放在同一目录。</p><video controls preload="metadata" src="操作演示.mp4"></video><nav>${steps.map((step,index)=>`<a href="#${escape(step.id)}">${index+1}. ${escape(step.title)}</a>`).join(" · ")}</nav>${chapters}<section><h2>完成与异常处理</h2><p>名称“${escape(scenario.recordName)}”、编号 R-001 和“已保存”在重新读取后仍然一致，表示本次创建已完成。</p><p>保存中请等待；若出现“保存失败”或“读取失败”，先确认本地示例服务仍在运行，再重试对应操作。本手册只覆盖本地示例，不代表外部业务系统已通过验收。</p></section></html>`);
      files.push(["video", "materials", "操作演示.mp4"], ["manual", "materials", "操作手册.html"]);
    }
    fs.writeFileSync(path.join(input.artifact_root, "flow.json"), JSON.stringify(facts));
    return { protocol_version: "1", phase: input.phase, facts, evidence_refs: files.map(([id,claim_id,file]) => ({id,claim_id,status:"passed",path:file,sha256:hash(fs.readFileSync(path.join(input.artifact_root,file)))})), failure_facts: [] };
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

if (require.main === module) {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  produce(input, process.argv[2] || "standard").then(result => console.log(JSON.stringify(result))).catch(error => {
    console.log(JSON.stringify({protocol_version:"1",phase:input.phase,facts:{},evidence_refs:[],failure_facts:[{class:"environment",reason:error.message}]}));
  });
}
