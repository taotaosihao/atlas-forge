"use strict";

const fs = require("fs");
const childProcess = require("child_process");

const active = process.env.ATLAS_3D_OWNERSHIP_ACTIVE === "1";
const ownershipFd = process.env.ATLAS_3D_OWNERSHIP_RECORD === "1" ? Number(process.env.ATLAS_3D_OWNERSHIP_FD) : null;
if (active) {
  const originalSpawn = childProcess.spawn;
  const originalSpawnSync = childProcess.spawnSync;
  const record = (event, pid) => {
    if (!Number.isInteger(ownershipFd) || ownershipFd < 3 || !Number.isInteger(pid) || pid <= 1) return;
    try { fs.writeSync(ownershipFd, `${event}:${pid}\n`); } catch {}
  };
  const ownedOptions = (options) => {
    const { ATLAS_3D_OWNERSHIP_FD, ATLAS_3D_OWNERSHIP_RECORD, ...env } = options?.env || process.env;
    return { ...(options || {}), detached: false, env: { ...env, ATLAS_3D_OWNERSHIP_ACTIVE: "1", ATLAS_3D_OWNERSHIP_RECORD: "0" } };
  };
  childProcess.spawn = function ownedSpawn(command, args, options) {
    let actualArgs = args, actualOptions = options;
    if (!Array.isArray(args)) { actualOptions = args; actualArgs = []; }
    const child = originalSpawn.call(this, command, actualArgs, ownedOptions(actualOptions));
    record("start", child.pid);
    child.once("close", () => record("close", child.pid));
    return child;
  };
  childProcess.spawnSync = function ownedSpawnSync(command, args, options) {
    let actualArgs = args, actualOptions = options;
    if (!Array.isArray(args)) { actualOptions = args; actualArgs = []; }
    return originalSpawnSync.call(this, command, actualArgs, ownedOptions(actualOptions));
  };
}
