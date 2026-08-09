"use strict";
const fs = require("fs");
const http = require("http");
const net = require("net");
const { fileDigest, sha256 } = require("../security/digest.cjs");
const { resources } = require("../resources/layout.cjs");
const { LIMITS } = require("../protocol/limits.cjs");

const routes = Object.freeze({
  "/": ["index", "text/html; charset=utf-8"],
  "/scene.mjs": ["scene", "text/javascript; charset=utf-8"],
  "/page-adapter.mjs": ["page_adapter", "text/javascript; charset=utf-8"],
  "/vendor/three.module.js": ["three", "text/javascript; charset=utf-8"],
  "/vendor/three.core.js": ["three_core", "text/javascript; charset=utf-8"],
});
function frozenResourceDigests() { return Object.fromEntries(Object.entries(resources).map(([key, file]) => [key, fileDigest(file)])); }
async function assertPortUnoccupied(port) {
  await new Promise((resolve, reject) => {
    const probe = net.connect({ host: "127.0.0.1", port });
    probe.setTimeout(250);
    probe.once("connect", () => { probe.destroy(); reject(new Error("SERVER_PORT_OCCUPIED")); });
    probe.once("timeout", () => { probe.destroy(); reject(new Error("SERVER_PORT_PROBE_TIMEOUT")); });
    probe.once("error", (error) => error.code === "ECONNREFUSED" ? resolve() : reject(error));
  });
}
async function startServer({ expectedDigests, port = 41733, overrides = {}, redirectIndexTo = null }) {
  for (const [key, file] of Object.entries(resources)) if (fileDigest(file) !== expectedDigests[key]) throw new Error(`RESOURCE_IDENTITY_MISMATCH ${key}`);
  await assertPortUnoccupied(port);
  const served = {};
  const server = http.createServer((request, response) => {
    if (request.url === "/" && redirectIndexTo) { response.writeHead(302, { location: redirectIndexTo }); return response.end(); }
    if (request.method !== "GET" || request.headers.host !== `127.0.0.1:${port}` || !routes[request.url]) { response.writeHead(404, { "content-type": "text/plain", "content-length": "9" }); return response.end("not found"); }
    const [key, contentType] = routes[request.url];
    const bytes = overrides[key] || fs.readFileSync(resources[key]);
    if (bytes.length > LIMITS.max_response_bytes) { response.writeHead(413, { "content-length": "0" }); return response.end(); }
    const digest = sha256(bytes);
    served[key] = { path: request.url, sha256: digest, bytes: bytes.length };
    response.writeHead(200, { "content-type": contentType, "content-length": String(bytes.length), "cache-control": "no-store", "x-content-type-options": "nosniff" });
    response.end(bytes);
  });
  server.on("upgrade", (request, socket) => socket.destroy());
  try { await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); }); }
  catch (error) { server.close(); throw error; }
  const address = server.address();
  if (!address || address.address !== "127.0.0.1" || address.port !== port) { await new Promise((resolve) => server.close(resolve)); throw new Error("SERVER_LISTENER_OWNERSHIP_MISMATCH"); }
  return { origin: `http://127.0.0.1:${port}`, served, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}
module.exports = { assertPortUnoccupied, frozenResourceDigests, startServer };
