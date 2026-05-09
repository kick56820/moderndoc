const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(path.dirname(ROOT), "pbdocs-deploy.zip");

function run(command, args, cwd = ROOT) {
  console.log(`> ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function removeExistingZip() {
  if (fs.existsSync(OUT)) fs.unlinkSync(OUT);
}

run(process.execPath, ["scripts/release-check.js"]);
removeExistingZip();

if (process.platform === "win32") {
  run("powershell.exe", [
    "-NoProfile",
    "-Command",
    [
      "$ErrorActionPreference = 'Stop';",
      `$root = '${ROOT.replace(/'/g, "''")}';`,
      `$out = '${OUT.replace(/'/g, "''")}';`,
      "Compress-Archive -Path (Join-Path $root '*') -DestinationPath $out -Force",
    ].join(" "),
  ]);
} else {
  run("zip", ["-qr", OUT, "."], ROOT);
}

console.log(`release package written: ${OUT}`);
