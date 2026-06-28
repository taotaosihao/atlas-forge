#!/usr/bin/env node
"use strict";

const router = require("./multica-next-role-router-core");

function parseArgs(argv) {
  const args = { pretty: false, recordDedupe: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--template") args.template = argv[++i];
    else if (arg === "--event") args.event = argv[++i];
    else if (arg === "--dedupe-store") args.dedupeStore = argv[++i];
    else if (arg === "--record-dedupe") args.recordDedupe = true;
    else if (arg === "--pretty") args.pretty = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!args.template) throw new Error("--template is required");
  if (!args.event) throw new Error("--event is required");
  return args;
}

function main(argv) {
  try {
    const args = parseArgs(argv);
    const template = router.loadStructured(args.template);
    const event = router.loadStructured(args.event);
    let decision = router.route(template, event);
    if (args.dedupeStore) {
      const keys = router.loadDedupeKeys(args.dedupeStore);
      if (keys.has(decision.dedupe_key)) {
        decision = { ...decision, action: "duplicate", reason_code: "duplicate" };
      } else if (args.recordDedupe && decision.action === "dispatch") {
        router.appendDedupeKey(args.dedupeStore, decision);
      }
    }
    console.log(JSON.stringify(decision, null, args.pretty ? 2 : 0));
    return 0;
  } catch (error) {
    console.error(JSON.stringify({ action: "error", error: error.message }));
    return 2;
  }
}

process.exitCode = main(process.argv.slice(2));
