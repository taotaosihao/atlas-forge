"use strict";
const path = require("path");
const TOOL_ROOT = path.resolve(__dirname, "../..");
const REPO_ROOT = path.resolve(TOOL_ROOT, "../../../..");
const CACHE_ROOT = path.join(REPO_ROOT, ".tmp/atlas-3d-harness/playwright-browsers");
const BROWSER_BINARY = path.join(CACHE_ROOT, "chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
const resources = Object.freeze({
  index: path.join(TOOL_ROOT, "examples/basic-three/index.html"),
  scene: path.join(TOOL_ROOT, "examples/basic-three/scene.mjs"),
  page_adapter: path.join(TOOL_ROOT, "src/page/page-adapter.mjs"),
  three: path.join(TOOL_ROOT, "node_modules/three/build/three.module.js"),
  three_core: path.join(TOOL_ROOT, "node_modules/three/build/three.core.js"),
});
module.exports = { BROWSER_BINARY, CACHE_ROOT, REPO_ROOT, TOOL_ROOT, resources };
