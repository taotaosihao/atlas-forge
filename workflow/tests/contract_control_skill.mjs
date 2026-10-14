import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const plugin = resolve(root, "plugins/atlas-workflow");
const source = (relativePath) => {
  const absolutePath = resolve(root, relativePath);
  assert.ok(existsSync(absolutePath), `missing ${relativePath}`);
  return readFileSync(absolutePath, "utf8");
};

const skill = source("plugins/atlas-workflow/skills/control/SKILL.md");
const rules = source("plugins/atlas-workflow/references/control.md");
const frontmatter = skill.match(/^---\nname: control\ndescription: (.+)\n---\n/);
assert.ok(frontmatter, "control skill frontmatter must hold only name and description");
for (const action of ["init", "check", "change"]) assert.match(skill, new RegExp(`^## ${action}$`, "m"));
assert.match(skill, /consistent \| drift-found \| blocked/);
assert.match(skill, /control\/index\.yaml/);

// Every consumer links the one shared rule set instead of restating it.
const consumers = {
  "skills/control/SKILL.md": "../../references/control.md",
  "skills/task/SKILL.md": "../../references/control.md",
  "skills/team/SKILL.md": "../../references/control.md",
  "skills/clarify/SKILL.md": "../../references/control.md",
  "skills/brainstorm/SKILL.md": "../../references/control.md",
  "README.md": "references/control.md",
};
for (const [file, link] of Object.entries(consumers)) {
  assert.ok(source(`plugins/atlas-workflow/${file}`).includes(`(${link})`), `${file} must link ${link}`);
  assert.ok(existsSync(resolve(plugin, dirname(file), link)), `${file} link does not resolve`);
}
for (const anchor of ["`user`", "`agent`", "control/index.yaml"]) assert.ok(rules.includes(anchor), `control rules missing ${anchor}`);
assert.ok(rules.includes("(../scripts/atlas-control-lint)"), "control rules must link the mechanical check");
assert.ok(existsSync(resolve(plugin, "scripts/atlas-control-lint")), "mechanical check must ship in the plugin");
assert.match(skill, /scripts\/atlas-control-lint/);
assert.ok(source("workflow/tests/contract.sh").includes("contract_control_lint.mjs"), "contract.sh must run the lint contract");
assert.ok(source("plugins/atlas-workflow/hooks/session-baseline.md").includes("`control`"), "Claude baseline must route to control");
assert.ok(source("workflow/tests/contract.sh").includes("contract_control_skill.mjs"), "contract.sh must run this contract");

console.log("control skill contract passed");
