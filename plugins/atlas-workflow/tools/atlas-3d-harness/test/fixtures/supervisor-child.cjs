"use strict";
const fs = require("fs"); const { spawn } = require("child_process");
const mode = process.argv[2];
const output = () => { process.stdout.write(`${JSON.stringify({ ok: true, mode })}\n`); process.exit(0); };
if (mode === "normal") output();
else if (mode === "term-success") { process.on("SIGTERM", output); setInterval(() => {}, 1000); }
else if (mode === "hang") { process.on("SIGTERM", () => {}); setInterval(() => {}, 1000); }
else if (mode === "stdout-over") { process.stdout.write("x".repeat(1_048_577)); setInterval(() => {}, 1000); }
else if (mode === "stderr-over") { process.stderr.write("x".repeat(1_048_577)); setInterval(() => {}, 1000); }
else if (mode === "stdout-exact") { const base = `${JSON.stringify({ ok: true, pad: "" })}\n`; process.stdout.write(`${JSON.stringify({ ok: true, pad: "x".repeat(1_048_576 - Buffer.byteLength(base)) })}\n`); }
else if (mode === "stderr-exact") { process.stderr.write("x".repeat(1_048_576)); output(); }
else if (mode === "ownership-bytes") { const bytes = Number(process.argv[3]), rows = []; for (let index = 0; index < 32768; index += 1) { const pid = 700000000 + index; rows.push(`start:${pid}\nclose:${pid}\n`); } const exact = rows.join(""); fs.writeSync(3, bytes === 1_048_577 ? `${exact}x` : exact); output(); }
else if (mode === "ownership-events") { const count = Number(process.argv[3]), rows = []; for (let index = 0; index < Math.ceil(count / 2); index += 1) { const pid = 700000000 + index; rows.push(`start:${pid}\n`); if (rows.length < count) rows.push(`close:${pid}\n`); } fs.writeSync(3, rows.join("")); output(); }
else if (mode === "ownership-protocol") { fs.writeSync(3, process.argv[3]); output(); }
else if (mode === "escaped") { const escaped = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" }); escaped.unref(); fs.writeFileSync(process.argv[3], String(escaped.pid)); output(); }
else process.exit(2);
