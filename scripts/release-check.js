const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const requiredFiles = [
  "server.js",
  "public/index.html",
  "public/app.js",
  "public/styles.css",
  "data/helpdeco-topics.json",
  "data/topics.json",
  "data/PBHLP105.hpj",
  "public/books/pbman/book-contents.json",
];

function run(command, args) {
  console.log(`> ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd: ROOT, stdio: "inherit" });
}

function assertFile(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required deployment file: ${relativePath}`);
  }
}

try {
  for (const file of requiredFiles) assertFile(file);
  run(process.execPath, ["--check", "server.js"]);
  run(process.execPath, ["--check", "public/app.js"]);
  run(process.execPath, ["scripts/check-parser-samples.js"]);
  run(process.execPath, ["scripts/check-parser-warnings.js"]);
  console.log("release check passed");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
