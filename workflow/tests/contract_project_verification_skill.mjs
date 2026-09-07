import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = (relativePath) => {
  const absolutePath = resolve(root, relativePath);
  assert.ok(existsSync(absolutePath), `missing ${relativePath}`);
  return readFileSync(absolutePath, "utf8");
};
const normalize = (text) => text.replace(/\s+/g, " ").trim();
const hasAll = (text, label, phrases) => {
  const haystack = normalize(text).toLowerCase();
  for (const phrase of phrases) {
    assert.ok(haystack.includes(normalize(phrase).toLowerCase()), `${label} missing: ${phrase}`);
  }
};
const section = (text, heading, level = 2) => {
  const marker = `${"#".repeat(level)} ${heading}\n`;
  const start = text.indexOf(marker);
  assert.ok(start >= 0, `missing section ${heading}`);
  const remainder = text.slice(start + marker.length);
  const nextHeading = remainder.search(new RegExp(`^#{1,${level}} `, "m"));
  return nextHeading < 0 ? remainder : remainder.slice(0, nextHeading);
};
const frontmatter = (text, label) => {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, `${label} missing frontmatter`);
  return Object.fromEntries(match[1].split("\n").filter(Boolean).map((line) => {
    const separator = line.indexOf(":");
    assert.ok(separator > 0, `${label} malformed frontmatter`);
    return [line.slice(0, separator), line.slice(separator + 1).trim()];
  }));
};

const skill = source("plugins/atlas-workflow/skills/project-verification/SKILL.md");
const mapTemplate = source("plugins/atlas-workflow/skills/project-verification/references/verification-map.template.md");
const readme = source("plugins/atlas-workflow/README.md");
const task = source("plugins/atlas-workflow/skills/task/SKILL.md");
const team = source("plugins/atlas-workflow/skills/team/SKILL.md");
const businessAcceptance = source("plugins/atlas-workflow/skills/team/references/business-acceptance.md");
const productDesign = source("plugins/atlas-workflow/skills/product-design/SKILL.md");
const clarify = source("plugins/atlas-workflow/skills/clarify/SKILL.md");
const contractShell = source("workflow/tests/contract.sh");
const taskAcceptance = section(task, "Product Increment Acceptance");
const teamProductIncrement = section(team, "Product Increment Evidence", 3);
const teamOptionalProtocols = section(team, "Optional Protocols");
const productDesignPrepare = section(productDesign, "Prepare");
const productDesignBuildD = section(productDesign, "Build D and obtain Gate 2");
const productDesignCreateE = section(productDesign, "Create and validate E");
const clarifyAcceptance = section(clarify, "Clarify only what is missing");
const clarifyHandoff = section(clarify, "Converge and hand off");

const metadata = frontmatter(skill, "project-verification");
assert.deepEqual(Object.keys(metadata), ["name", "description"]);
assert.equal(metadata.name, "project-verification");
hasAll(metadata.description, "description", ["optional", "project verification map", "build, run, or audit"]);
for (const mode of ["create", "run", "audit"]) assert.match(skill, new RegExp(`^## ${mode}$`, "m"));
assert.equal((skill.match(/^## (?:create|run|audit)$/gm) ?? []).length, 3);

const create = section(skill, "create");
const run = section(skill, "run");
const audit = section(skill, "audit");
hasAll(create, "create", ["write permission", "discover", "docs/verification-map.md", "does not install", "product unchanged"]);
hasAll(run, "run", ["never grants permission", "one set of related objects", "action-specific", "readback", "blocked"]);
hasAll(audit, "audit", ["read-only by default", "clean | drift-found | blocked", "not business acceptance", "Do not edit the map"]);
assert.ok(create.indexOf("write permission") < create.indexOf("Before writing"));
assert.ok(run.includes("normal step that is already explicitly authorised"));
assert.ok(run.includes("shared environment or on an approved field instance"));

hasAll(skill, "map", ["derived index", "not a requirements document", "newly created v1 map", "at most five", "does not trim existing", "does not record this run"]);
hasAll(skill, "decision", ["current valid user decision", "cancelled or replaced", "reopen only the affected map entries"]);
hasAll(skill, "evidence", ["health checks, HTTP 200", "green unit tests", "one screenshot", "do not prove that an agent followed"]);
for (const field of [
  "User outcome",
  "Behavior authority/source refs",
  "Entry and journey/drive refs",
  "Observable outcome and evidence refs",
  "Applicable prerequisites, launch and doctor",
  "Applicable side-effect readback and resource disposition",
  "Gotchas, authority boundaries and update triggers",
]) assert.match(mapTemplate, new RegExp(`^- ${field}:$`, "m"));
assert.ok(!/^-\s+(?:status|pass|done|current|receipt|verdict|release|task|phase|slice)\s*:/im.test(mapTemplate));
hasAll(mapTemplate, "template", ["derived navigation index", "newly added v1 entries", "Do not add pass/done/current"]);
hasAll(run, "run authority", ["current goal", "host/instance identity", "exact candidate when", "version is unknown", "legal role", "allowed side effects", "authorised cleanup"]);
hasAll(audit, "audit boundary", ["means no drift", "separate write authorization"]);

hasAll(skill, "surface reuse", ["codex-web-acceptance", "$atlas-workflow:3d-harness", "Task/Team Business Acceptance", "PTY, tmux", "authorised read/control path"]);
hasAll(skill, "pstack provenance", ["0.14.8", "93b00b89ef425a9c1bac0d0b317dfc49c930ac99", "ae6fff5803260f38f075feb8c3b008ed68153fa0", "MIT license", "does not add pstack, Bun"]);
const testSource = readFileSync(resolve(root, "workflow/tests/contract_project_verification_skill.mjs"), "utf8");
assert.ok(!/from ["'](?:yaml|vitest|jest|mocha|@)/.test(testSource));

hasAll(taskAcceptance, "Task Product Increment Acceptance", ["business function", "direct Task entry", "related set of business objects", "Project Verification Map", "BAF artifacts", "Ordinary technical"]);
assert.match(taskAcceptance, /\[Business Acceptance\]\(\.\.\/team\/references\/business-acceptance\.md\)/);
hasAll(teamProductIncrement, "Team Product Increment Evidence", ["business-function delivery", "direct Team entry", "Task did not preload", "$atlas-workflow:project-verification", "approved design or plan", "one related set of business objects", "BAF artifacts"]);
assert.match(teamProductIncrement, /\[Business Acceptance\]\(references\/business-acceptance\.md\)/);
hasAll(teamOptionalProtocols, "Team Optional Protocols", ["business-function delivery needs", "does not depend on Task", "Project Verification Map"]);
assert.match(teamOptionalProtocols, /`references\/business-acceptance\.md`/);
hasAll(businessAcceptance, "BA activation", ["business-function delivery must load", "direct Team entry", "Project Verification Map is optional", "current approved design/plan or task", "selected contract requires"]);
assert.ok(!businessAcceptance.includes("## 7.4"));
assert.ok(!businessAcceptance.includes("## 7.5"));
hasAll(businessAcceptance, "BA journey", ["current valid design", "every complete business journey", "same related objects and IDs", "same batch of business data", "requires a UI action", "cannot bypass", "five-column table is optional", "failed, unrun, or unknown real check still blocks"]);
hasAll(businessAcceptance, "BA handoff", ["Product Design establishes", "Clarify carries", "lightweight scope document", "selected machine contract", "new contract type, Map, or early verification run", "planned, discovered, and executed", "Agent self-tests, static checks"]);

hasAll(productDesignPrepare, "Product Design Prepare", ["Business Acceptance", "design-time standard", "C/D artifacts"]);
assert.match(productDesignPrepare, /\[Business Acceptance\]\(\.\.\/team\/references\/business-acceptance\.md\)/);
hasAll(productDesignBuildD, "Product Design Build D", ["Do not connect real write side effects", "first freeze an isolatable exact candidate commit", "align D's visible acceptance with C", "business rules or permission/safety conflicts", "blockers"]);
hasAll(productDesignCreateE, "Product Design Create E", ["E may point to the C/D business acceptance rows", "must not add, remove, or lower", "planned, discovered, and executed entrypoints"]);
hasAll(clarifyAcceptance, "Clarify only what is missing", ["business-function outcome", "lightweight scope document", "selected machine contract", "$atlas-workflow:project-verification", "business rules or permission/safety conflicts", "blockers"]);
assert.match(clarifyAcceptance, /\[Business Acceptance\]\(\.\.\/team\/references\/business-acceptance\.md\)/);
hasAll(clarifyHandoff, "Clarify Converge and hand off", ["same current design/plan requirements", "planned, discovered, and executed entrypoints", "not an executable verification command", "reopen only the affected acceptance clauses"]);

hasAll(contractShell, "contract.sh", ["contract_project_verification_skill.mjs", "project-verification skill contract"]);
assert.ok(contractShell.indexOf("contract_project_verification_skill.mjs") > contractShell.indexOf("contract_product_design_skill.sh"));
hasAll(readme, "README", ["$atlas-workflow:project-verification", "docs/verification-map.md", "optional project verification map", "skills/project-verification/SKILL.md", "Current valid user decisions", "project harnesses provide verification entrypoints"]);

console.log("project-verification source contract passed");
