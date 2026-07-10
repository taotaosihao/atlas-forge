"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function atomicWriteFile(file, content, options = {}) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });

  let mode;
  try {
    mode = fs.statSync(file).mode & 0o777;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const temporary = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, content, { ...options, ...(mode ? { mode } : {}) });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function atomicWriteJson(file, value) {
  atomicWriteFile(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8" });
}

module.exports = {
  atomicWriteFile,
  atomicWriteJson,
};
