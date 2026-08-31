"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fingerprint(target) {
  try {
    fs.lstatSync(target);
  } catch (error) {
    if (error.code === "ENOENT") return "missing";
    throw error;
  }
  const hash = crypto.createHash("sha256");
  function visit(relative) {
    const file = path.join(target, relative);
    const stat = fs.lstatSync(file);
    const entry = [relative, stat.mode];
    if (stat.isFile()) entry.push(stat.size, sha256(fs.readFileSync(file)));
    if (stat.isSymbolicLink()) entry.push(fs.readlinkSync(file));
    // Metadata-only for FIFOs/sockets, and never follow a fixture symlink.
    hash.update(`${JSON.stringify(entry)}\n`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) {
        visit(relative === "." ? name : path.join(relative, name));
      }
    }
  }
  visit(".");
  return hash.digest("hex");
}

function fileIdentity(target) {
  const stat = fs.lstatSync(target, { bigint: true });
  return `${stat.dev}:${stat.ino}`;
}

if (require.main === module) {
  const [command, ...files] = process.argv.slice(2);
  if (command === "sha256") {
    for (const file of files.length ? files : [0]) {
      console.log(sha256(fs.readFileSync(file)));
    }
  } else if (command === "fingerprint" && files.length === 1) {
    console.log(fingerprint(files[0]));
  } else if (command === "file-identity" && files.length === 1) {
    console.log(fileIdentity(files[0]));
  } else if (command === "file-mode" && files.length === 1) {
    console.log((fs.lstatSync(files[0]).mode & 0o7777).toString(8));
  } else {
    throw new Error("usage: portable.js sha256 [files...] | fingerprint <path> | file-identity <path> | file-mode <path>");
  }
}

module.exports = { sha256, fingerprint, fileIdentity };
