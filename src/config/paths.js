const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const LOCAL_DATA = path.join(ROOT, "data");
const DOCS = LOCAL_DATA;
const PUBLIC = path.join(ROOT, "public");
const BOOK_ROOT = path.join(PUBLIC, "books", "pbman");
const bookContentsPath = path.join(BOOK_ROOT, "book-contents.json");
const topicsPath = path.join(DOCS, "helpdeco-topics.json");
const contentsPath = path.join(DOCS, "topics.json");

function firstExistingPath(paths) {
  return paths.find((candidate) => fs.existsSync(candidate)) || "";
}

function ensureRequiredFiles(files) {
  const missing = files.filter((filePath) => !fs.existsSync(filePath));
  if (!missing.length) return;

  console.error("PowerBuilder docs deployment is incomplete.");
  console.error("Copy the whole pbdocs-deploy folder, including data/ and public/books/.");
  console.error("Missing files:");
  for (const filePath of missing) console.error(`- ${filePath}`);
  process.exit(1);
}

function ensureDeploymentFiles() {
  ensureRequiredFiles([
    topicsPath,
    contentsPath,
    path.join(DOCS, "PBHLP105.hpj"),
    path.join(PUBLIC, "index.html"),
    path.join(PUBLIC, "app.js"),
    path.join(PUBLIC, "styles.css"),
    bookContentsPath,
  ]);
}

const helpProjectPath = firstExistingPath([
  path.join(DOCS, "PBHLP105.hpj"),
  path.join(DOCS, "helpdeco-project", "PBHLP105.hpj"),
]);

const assetsRoot = firstExistingPath([
  path.join(DOCS, "assets"),
  path.join(DOCS, "helpdeco-project"),
]) || DOCS;

module.exports = {
  ROOT,
  DOCS,
  PUBLIC,
  BOOK_ROOT,
  bookContentsPath,
  topicsPath,
  contentsPath,
  helpProjectPath,
  assetsRoot,
  ensureDeploymentFiles,
};
