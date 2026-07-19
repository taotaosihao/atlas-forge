"use strict";

const fs = require("fs");
const path = require("path");

function validateSchemaFile(schemaFile, value) {
  const rootFile = path.resolve(schemaFile); const cache = new Map();
  const load = (file) => { if (!cache.has(file)) cache.set(file, JSON.parse(fs.readFileSync(file, "utf8"))); return cache.get(file); };
  function resolve(ref, file) { const [name, fragment = ""] = ref.split("#"); const targetFile = name ? path.resolve(path.dirname(file), name) : file; let schema = load(targetFile); if (fragment) for (const part of fragment.replace(/^\//, "").split("/")) schema = schema[part.replace(/~1/g, "/").replace(/~0/g, "~")]; return [schema, targetFile]; }
  function check(schema, current, label, file) {
    if (schema.$ref) { const [target, targetFile] = resolve(schema.$ref, file); return check(target, current, label, targetFile); }
    if (schema.oneOf) { const matches = schema.oneOf.filter((candidate) => { try { check(candidate, current, label, file); return true; } catch { return false; } }); if (matches.length !== 1) throw new Error(`${label} oneOf mismatch`); }
    if ("const" in schema && current !== schema.const) throw new Error(`${label} const mismatch`);
    if (schema.enum && !schema.enum.includes(current)) throw new Error(`${label} enum mismatch`);
    const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
    if (types.length) { const actual = current === null ? "null" : Array.isArray(current) ? "array" : Number.isInteger(current) ? "integer" : typeof current; if (!types.includes(actual) && !(actual === "integer" && types.includes("number"))) throw new Error(`${label} type mismatch`); }
    if (typeof current === "string") { if (schema.minLength && current.length < schema.minLength) throw new Error(`${label} minLength`); if (schema.pattern && !new RegExp(schema.pattern).test(current)) throw new Error(`${label} pattern`); }
    if (typeof current === "number" && schema.minimum !== undefined && current < schema.minimum) throw new Error(`${label} minimum`);
    if (Array.isArray(current)) { if (schema.minItems && current.length < schema.minItems) throw new Error(`${label} minItems`); if (schema.items) current.forEach((item, index) => check(schema.items, item, `${label}[${index}]`, file)); }
    if (current && typeof current === "object" && !Array.isArray(current)) { for (const key of schema.required || []) if (!(key in current)) throw new Error(`${label} missing ${key}`); if (schema.additionalProperties === false) for (const key of Object.keys(current)) if (!(key in (schema.properties || {}))) throw new Error(`${label} unknown ${key}`); for (const [key, child] of Object.entries(current)) if (schema.properties?.[key]) check(schema.properties[key], child, `${label}.${key}`, file); }
  }
  check(load(rootFile), value, "$", rootFile); return true;
}

module.exports = { validateSchemaFile };
