"use strict";
const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { captureBindingId, sha256 } = require("../security/digest.cjs");
const { canonicalize } = require("../canonical/base.cjs");
const { validate } = require("../protocol/schema.cjs");
const { combination, expectedCombinations } = require("../protocol/capture-set.cjs");
const { LIMITS, boundedCounter, enforceByteLength } = require("../protocol/limits.cjs");
const { BROWSER_BINARY, CACHE_ROOT } = require("../resources/layout.cjs");
const { cleanupBrowserEnvironment, prepareBrowserEnvironment } = require("../security/browser-environment.cjs");
process.env.PLAYWRIGHT_BROWSERS_PATH = CACHE_ROOT;
const { chromium } = require("playwright-core");

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function processRows() {
  return execFileSync("/bin/ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8", env: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" }, maxBuffer: 4 * 1024 * 1024 }).split("\n").map((row) => { const match = row.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/); return match ? { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] } : null; }).filter(Boolean);
}
function normalizeMacTemp(value) { return value.replaceAll("/var/", "/private/var/").replaceAll("/tmp/", "/private/tmp/"); }
async function launchOwnedBrowserServer(runtime) {
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = runtime.runtimeRoot;
  try {
    return await chromium.launchServer({ headless: false, args: ["--headless=new"], downloadsPath: undefined, env: runtime.environment });
  } finally {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
  }
}
function ownedBrowserProcessEvidence(child, runtimeRoot, rows = processRows()) {
  if (!child || !Number.isInteger(child.pid) || child.pid < 1 || !Array.isArray(child.spawnargs)) throw new Error("DRIVER_OWNED_PROCESS_REQUIRED");
  try { process.kill(child.pid, 0); } catch { throw new Error("DRIVER_OWNED_PROCESS_STALE"); }
  const argv = child.spawnargs.slice();
  if (argv.length < 10 || argv.length > 100 || Buffer.byteLength(JSON.stringify(argv)) > 65536) throw new Error("DRIVER_ARGV_BOUNDS_MISMATCH");
  const executable = fs.realpathSync(child.spawnfile || argv[0]);
  if (executable !== BROWSER_BINARY || fs.realpathSync(argv[0]) !== BROWSER_BINARY) throw new Error("DRIVER_EXECUTABLE_IDENTITY_MISMATCH");
  const profileArgs = argv.filter((arg) => arg.startsWith("--user-data-dir="));
  if (profileArgs.length !== 1) throw new Error("DRIVER_PROFILE_ARGV_MISMATCH");
  const profile = profileArgs[0].slice("--user-data-dir=".length);
  if (!path.isAbsolute(profile) || path.resolve(profile) !== profile) throw new Error("DRIVER_PROFILE_PATH_MISMATCH");
  const profileReal = fs.realpathSync(profile);
  if (profileReal !== runtimeRoot && !profileReal.startsWith(`${runtimeRoot}${path.sep}`)) throw new Error("DRIVER_PROFILE_OWNERSHIP_MISMATCH");
  const byParent = new Map(); for (const row of rows) { const list = byParent.get(row.ppid) || []; list.push(row); byParent.set(row.ppid, list); }
  const ownedPids = new Set([child.pid]), queue = [child.pid]; while (queue.length) { for (const row of byParent.get(queue.shift()) || []) if (!ownedPids.has(row.pid)) { ownedPids.add(row.pid); queue.push(row.pid); } }
  if (!rows.some((row) => row.pid === child.pid)) throw new Error("DRIVER_OWNED_PROCESS_NOT_OBSERVED");
  const appRoot = path.resolve(BROWSER_BINARY, "../../..");
  const ownedRows = rows.filter((row) => ownedPids.has(row.pid) || (row.command.includes(appRoot) && normalizeMacTemp(row.command).includes(runtimeRoot)));
  const normalized = ownedRows.map((row) => normalizeMacTemp(row.command));
  const realUserLibraryRefs = normalized.filter((command) => command.includes("/Users/sihao/Library/")).length;
  const ownedRuntimeRefs = normalized.filter((command) => command.includes(runtimeRoot)).length;
  if (!ownedRows.length || realUserLibraryRefs || !ownedRuntimeRefs) throw new Error("DRIVER_PERSISTENT_STATE_BOUNDARY_MISMATCH");
  const sanitized = argv.map((arg) => arg === profileArgs[0] ? "--user-data-dir=<ephemeral-profile>" : arg);
  return Object.freeze({ pid: child.pid, sanitized, argv_digest: sha256(Buffer.from(JSON.stringify(argv))), process_audit: { process_count: ownedRows.length, real_user_library_refs: realUserLibraryRefs, owned_runtime_refs: ownedRuntimeRefs } });
}
function canonicalSemanticDigest(value) {
  const stable = structuredClone(value);
  delete stable.state_revision;
  delete stable.rendered_state_revision;
  delete stable.render_revision;
  return sha256(Buffer.from(JSON.stringify(stable)));
}
async function configureContext(browser, origin, viewport, violations, counters) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.device_scale_factor, acceptDownloads: false, serviceWorkers: "block", permissions: [] });
  await context.addInitScript(() => {
    Object.defineProperty(globalThis, "RTCPeerConnection", { value: undefined, configurable: false });
    Object.defineProperty(globalThis, "webkitRTCPeerConnection", { value: undefined, configurable: false });
    Object.defineProperty(globalThis, "WebTransport", { value: undefined, configurable: false });
  });
  let pageCount = 0;
  await context.route("**/*", async (route) => {
    counters.network.add();
    const url = new URL(route.request().url());
    if (url.origin !== origin) { violations.push(`external:${url.origin}`); return route.abort("blockedbyclient"); }
    return route.continue();
  });
  await context.routeWebSocket("**/*", (ws) => { counters.network.add(); violations.push(`websocket:${ws.url()}`); ws.close(); });
  context.on("serviceworker", (worker) => { counters.lifecycle.add(); violations.push(`service-worker:${worker.url()}`); });
  context.on("page", (candidate) => { counters.lifecycle.add(); pageCount += 1; if (pageCount > 1) { violations.push("additional-page"); candidate.close().catch(() => {}); } });
  const page = await context.newPage();
  page.on("console", () => counters.console.add());
  page.on("pageerror", () => counters.console.add());
  page.on("crash", () => { counters.lifecycle.add(); violations.push("page-crash"); });
  page.on("download", () => { counters.lifecycle.add(); violations.push("download"); });
  page.on("dialog", (dialog) => { counters.lifecycle.add(); violations.push("dialog"); dialog.dismiss().catch(() => {}); });
  page.on("filechooser", () => { counters.lifecycle.add(); violations.push("filechooser"); });
  page.on("framenavigated", (frame) => { counters.lifecycle.add(); if (frame !== page.mainFrame()) violations.push("additional-frame"); else if (new URL(frame.url()).origin !== origin) violations.push("unexpected-navigation"); });
  const response = await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  assert(response && response.status() === 200 && response.url() === `${origin}/`, "served document redirect/status drift");
  const declaredLength = Number(response.headers()["content-length"]);
  if (!Number.isSafeInteger(declaredLength) || declaredLength < 1 || declaredLength > LIMITS.max_response_bytes) throw new Error("RESPONSE_CONTENT_LENGTH_LIMIT");
  const documentBytes = await response.body();
  enforceByteLength(documentBytes, LIMITS.max_response_bytes, "RESPONSE_STREAM_LIMIT");
  await page.evaluate(() => window.__ATLAS_3D_READY__);
  assert.strictEqual(page.frames().length, 1, "additional frame rejected");
  const unsupported = await page.evaluate(() => ({ rtc: typeof RTCPeerConnection, webtransport: typeof WebTransport }));
  if (unsupported.rtc !== "undefined" || unsupported.webtransport !== "undefined") throw new Error("UNSUPPORTED_NETWORK_CAPABILITY_EXPOSED");
  return { context, page };
}
async function captureOne({ page, context, scenario, viewport, view, checkpoint, served, expectedDigests, processEvidence, pngPath }) {
  const before = await page.evaluate(() => window.__ATLAS_3D_BRIDGE__.status());
  const committed = await page.evaluate((input) => window.__ATLAS_3D_BRIDGE__.checkpoint(input), { ...checkpoint, view });
  assert.strictEqual(committed.pending, 0); assert.strictEqual(committed.quiet, true);
  if (committed.renderRevision !== before.renderRevision + 1) throw new Error("PRESENTATION_REVISION_INCREMENT");
  const begun = await page.evaluate(() => window.__ATLAS_3D_BRIDGE__.beginCapture());
  const captureToken = begun.captureToken;
  const targetA = await page.evaluate((value) => window.__ATLAS_3D_BRIDGE__.captureTarget({ captureToken: value }), captureToken);
  const canvas = await page.$("canvas");
  assert(canvas, "persistent canvas ElementHandle required");
  const geometry = async () => canvas.evaluate((node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, scroll_x: scrollX, scroll_y: scrollY, viewport_width: innerWidth, viewport_height: innerHeight, dpr: devicePixelRatio, drawing_buffer_width: node.width, drawing_buffer_height: node.height }; });
  const pre = await geometry();
  const pngBytes = await canvas.screenshot({ type: "png" });
  enforceByteLength(pngBytes, LIMITS.max_png_bytes, "PNG_BYTE_LIMIT");
  const post = await geometry();
  const targetB = await page.evaluate((value) => window.__ATLAS_3D_BRIDGE__.captureTarget({ captureToken: value }), captureToken);
  if (!same(targetA, targetB) || !same(pre, post)) throw new Error("same-render revision or geometry drift");
  const status = await page.evaluate(() => window.__ATLAS_3D_BRIDGE__.status());
  if (!status.quiet || status.stateRevision !== targetA.stateRevision || status.renderRevision !== targetA.renderRevision) throw new Error("same-render bridge drift");
  const png = PNG.sync.read(pngBytes, { skipRescale: true });
  if (png.width !== pre.drawing_buffer_width || png.height !== pre.drawing_buffer_height || png.width * png.height > LIMITS.max_pixels) throw new Error("PNG dimension/pixel mismatch");
  let nonEmpty = 0; for (let i = 0; i < png.data.length; i += 4) if (png.data[i] || png.data[i + 1] || png.data[i + 2] || png.data[i + 3]) nonEmpty += 1;
  if (!nonEmpty) throw new Error("empty canvas");
  const storage = await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, caches: "caches" in window ? (await caches.keys()).length : 0 }));
  if (storage.local || storage.session || storage.caches || (await context.cookies()).length) throw new Error("browser isolation violation: storage");
  for (const [key, expected] of Object.entries(expectedDigests)) { const actual = served[key]; if (!actual) throw new Error(`missing-served:${key}`); if (actual.sha256 !== expected) throw new Error(`served-drift:${key}`); }
  const canonical = canonicalize(validate("raw-capture.schema.json", targetA));
  enforceByteLength(JSON.stringify(targetA), LIMITS.max_raw_bytes, "RAW_BYTE_LIMIT");
  enforceByteLength(JSON.stringify(canonical), LIMITS.max_canonical_bytes, "CANONICAL_BYTE_LIMIT");
  const capture = { schema_version: 1, captureBindingId: captureBindingId([scenario.scenario_id, checkpoint.name, view, viewport.width, viewport.height, viewport.device_scale_factor, targetA.stateRevision, targetA.renderRevision, sha256(pngBytes)]), raw: targetA, transport: { pre, post, served: structuredClone(served), browser_version: context.browser()?.version() || "149.0.7827.55", launch_argv: ["playwright-core@1.61.1", "chromium", "--headless=new"], actual_launch_argv: processEvidence.sanitized, actual_launch_argv_digest: processEvidence.argv_digest, owned_browser_pid: processEvidence.pid, process_audit: processEvidence.process_audit }, canonical, png: { path: pngPath, sha256: sha256(pngBytes), width: png.width, height: png.height, non_empty_pixels: nonEmpty } };
  validate("capture.schema.json", capture);
  return { capture, pngBytes, semanticDigest: canonicalSemanticDigest(canonical) };
}
async function captureMatrix({ origin, scenario, served, expectedDigests, attemptRoot, runIdentity }) {
  const runtime = prepareBrowserEnvironment({ attemptRoot, identity: runIdentity });
  let browserServer, browser, expectedBrowserClose = false;
  const contexts = [];
  try {
    browserServer = await launchOwnedBrowserServer(runtime);
    const processEvidence = ownedBrowserProcessEvidence(browserServer.process(), runtime.runtimeRoot);
    browser = await chromium.connect(browserServer.wsEndpoint());
    const violations = [];
    browser.on("disconnected", () => { if (!expectedBrowserClose) violations.push("browser-disconnect"); });
    const counters = { network: boundedCounter(LIMITS.max_network_events, "NETWORK_EVENT_LIMIT"), console: boundedCounter(LIMITS.max_console_events, "CONSOLE_EVENT_LIMIT"), lifecycle: boundedCounter(LIMITS.max_lifecycle_events, "LIFECYCLE_EVENT_LIMIT") };
    const outputs = [], pngs = new Map(); let freshA;
    for (const viewport of scenario.viewports) {
      const opened = await configureContext(browser, origin, viewport, violations, counters); contexts.push(opened.context);
      await opened.page.evaluate((input) => window.__ATLAS_3D_BRIDGE__.reset(input), { seed: scenario.seed, epoch_ms: scenario.epoch_ms, required_profiles: scenario.required_profiles });
      for (const view of scenario.views) for (const checkpoint of scenario.checkpoints) {
        const paths = combination(viewport, view, checkpoint.name);
        const output = await captureOne({ page: opened.page, context: opened.context, scenario, viewport, view, checkpoint, served, expectedDigests, processEvidence, pngPath: paths.pngPath });
        outputs.push({ ...paths, viewport, view, checkpoint, ...output }); pngs.set(paths.pngPath, output.pngBytes);
        if (viewport === scenario.viewports[0] && view === scenario.views[0] && checkpoint === scenario.checkpoints[0]) freshA = output;
      }
    }
    if (outputs.length !== LIMITS.max_capture_count) throw new Error("CAPTURE_COUNT_LIMIT");
    const replayOpened = await configureContext(browser, origin, scenario.viewports[0], violations, counters); contexts.push(replayOpened.context);
    await replayOpened.page.evaluate((input) => window.__ATLAS_3D_BRIDGE__.reset(input), { seed: scenario.seed, epoch_ms: scenario.epoch_ms, required_profiles: scenario.required_profiles });
    const replayInitialA = await replayOpened.page.evaluate(async (input) => { const bridge = window.__ATLAS_3D_BRIDGE__; const before = bridge.status(); const committed = await bridge.checkpoint(input); return { target: bridge.beginCapture().value, increment: committed.renderRevision - before.renderRevision }; }, { ...scenario.checkpoints[0], view: scenario.views[0] });
    const b = await replayOpened.page.evaluate(async (input) => { const bridge = window.__ATLAS_3D_BRIDGE__; const before = bridge.status(); const committed = await bridge.checkpoint(input); return { target: bridge.beginCapture().value, increment: committed.renderRevision - before.renderRevision }; }, { ...scenario.checkpoints[1], view: scenario.views[1] });
    const beforeA = await replayOpened.page.evaluate(() => window.__ATLAS_3D_BRIDGE__.status());
    const replayA = await replayOpened.page.evaluate(async (input) => { window.__ATLAS_3D_HIDDEN_CLOCK__ = 999999999; const bridge = window.__ATLAS_3D_BRIDGE__; const committed = await bridge.checkpoint(input); const target = bridge.beginCapture().value; const beforeIdle = bridge.status().renderRevision; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); return { target, committed, idleIncrement: bridge.status().renderRevision - beforeIdle }; }, { ...scenario.checkpoints[0], view: scenario.views[0] });
    const secondFresh = await configureContext(browser, origin, scenario.viewports[0], violations, counters); contexts.push(secondFresh.context);
    await secondFresh.page.evaluate((input) => window.__ATLAS_3D_BRIDGE__.reset(input), { seed: scenario.seed, epoch_ms: scenario.epoch_ms, required_profiles: scenario.required_profiles });
    const freshA2 = await secondFresh.page.evaluate(async (input) => { const bridge = window.__ATLAS_3D_BRIDGE__; await bridge.checkpoint(input); return bridge.beginCapture().value; }, { ...scenario.checkpoints[0], view: scenario.views[0] });
    const digests = { fresh: canonicalSemanticDigest(canonicalize(validate("raw-capture.schema.json", replayInitialA.target))), b: canonicalSemanticDigest(canonicalize(validate("raw-capture.schema.json", b.target))), replay: canonicalSemanticDigest(canonicalize(validate("raw-capture.schema.json", replayA.target))), second: canonicalSemanticDigest(canonicalize(validate("raw-capture.schema.json", freshA2))) };
    if (digests.fresh !== freshA.semanticDigest || digests.fresh !== digests.replay || digests.fresh !== digests.second || replayInitialA.increment !== 1 || b.increment !== 1 || replayA.committed.renderRevision - beforeA.renderRevision !== 1 || replayA.idleIncrement !== 0) throw new Error("REPLAY_CONVERGENCE_OR_PRESENTATION");
    if (violations.length) throw new Error(`browser isolation violation: ${violations.join(",")}`);
    return { outputs, pngs, replay: { key: outputs[0].key, fresh_a_digest: digests.fresh, same_context_b_digest: digests.b, same_context_a_digest: digests.replay, second_fresh_a_digest: digests.second, converged: true, absolute_seek: true, first_present_increment: 1, idle_raf_increment: 0 } };
  } finally {
    for (const context of contexts.reverse()) { await context.clearCookies().catch(() => {}); await context.close().catch(() => {}); }
    expectedBrowserClose = true;
    if (browserServer) await browserServer.close().catch(() => {});
    cleanupBrowserEnvironment(runtime);
  }
}
module.exports = { canonicalSemanticDigest, captureMatrix, launchOwnedBrowserServer, ownedBrowserProcessEvidence };
