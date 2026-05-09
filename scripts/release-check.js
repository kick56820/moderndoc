const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const requiredFiles = [
  "server.js",
  "src/app.js",
  "public/index.html",
  "public/app.js",
  "public/styles.css",
  "public/vendor/bootstrap/bootstrap.min.css",
  "public/vendor/bootstrap/bootstrap.bundle.min.js",
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

function listJavaScriptFiles(relativeDir) {
  const dir = path.join(ROOT, relativeDir);
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) files.push(...listJavaScriptFiles(relativePath));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(relativePath);
  }
  return files;
}

try {
  run(process.execPath, ["scripts/build-bootstrap-assets.js"]);
  for (const file of requiredFiles) assertFile(file);
  for (const file of ["server.js", "public/app.js"].concat(listJavaScriptFiles("src"))) {
    run(process.execPath, ["--check", file]);
  }
  run(process.execPath, ["scripts/check-parser-samples.js"]);
  run(process.execPath, ["scripts/check-parser-warnings.js"]);
  console.log("release check passed");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
