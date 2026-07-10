"use strict";

const crypto = require("crypto");

const MAX_SLUG_LENGTH = 64;
const TASK_ID_PREFIX = /^\d{8}-\d{3,}-/;

function normalizeTaskTitle(title) {
  if (typeof title !== "string") {
    throw new TypeError("title must be a string");
  }

  return title.normalize("NFC").trim().replace(TASK_ID_PREFIX, "").trim();
}

function asciiSlug(normalizedTitle) {
  return normalizedTitle
    .replace(/[A-Z]/g, (character) => character.toLowerCase())
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
}

function taskIdTitleToken(title) {
  const normalizedTitle = normalizeTaskTitle(title);
  const slug = asciiSlug(normalizedTitle);
  if (slug) {
    return slug;
  }

  const digest = crypto.createHash("sha256").update(normalizedTitle, "utf8").digest("hex");
  return `u-${digest.slice(0, 12)}`;
}

function main(argv) {
  if (argv.length !== 1) {
    process.stderr.write('usage: id.js "<title>"\n');
    return 2;
  }

  process.stdout.write(`${taskIdTitleToken(argv[0])}\n`);
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  MAX_SLUG_LENGTH,
  asciiSlug,
  normalizeTaskTitle,
  taskIdTitleToken,
};
