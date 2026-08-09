"use strict";

const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");

const CONTRACT_ROOT = path.resolve(__dirname, "../../contracts");
const schemaNames = ["domain-expected.schema.json", "scenario.schema.json", "runtime-config.schema.json", "provenance.schema.json", "raw-capture.schema.json", "canonical-state.schema.json", "bridge-status.schema.json", "transport.schema.json", "run-contract.schema.json", "capture.schema.json", "capture-set.schema.json"];
const schemas = new Map(schemaNames.map((name) => [name, JSON.parse(fs.readFileSync(path.join(CONTRACT_ROOT, name)))]));
const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of schemas.values()) ajv.addSchema(schema);

function validate(name, value) {
  const schema = schemas.get(name);
  if (!schema) throw new Error(`unknown schema: ${name}`);
  const check = ajv.getSchema(schema.$id);
  if (!check(value)) throw new Error(`${schema.$id} invalid: ${ajv.errorsText(check.errors, { separator: "; " })}`);
  if (name === "scenario.schema.json") {
    for (const vp of value.viewports) if (vp.width * vp.height * vp.device_scale_factor * vp.device_scale_factor > 16777216) throw new Error("atlas-3d-scenario@1 invalid: viewport pixel cap exceeded");
  }
  if (name === "runtime-config.schema.json" && !path.isAbsolute(value.project_root)) throw new Error("atlas-3d-runtime-config@1 invalid: project_root must be absolute");
  return value;
}

function readJson(file, maxBytes = 4 * 1024 * 1024) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > maxBytes) throw new Error(`bounded JSON input rejected: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

module.exports = { readJson, validate };
