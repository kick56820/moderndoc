const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const outDir = path.join(ROOT, "public", "vendor", "bootstrap");
const assets = [
  {
    from: path.join(ROOT, "node_modules", "bootstrap", "dist", "css", "bootstrap.min.css"),
    to: path.join(outDir, "bootstrap.min.css"),
  },
  {
    from: path.join(ROOT, "node_modules", "bootstrap", "dist", "js", "bootstrap.bundle.min.js"),
    to: path.join(outDir, "bootstrap.bundle.min.js"),
  },
];

if (!fs.existsSync(path.join(ROOT, "node_modules", "bootstrap"))) {
  console.error("Bootstrap is not installed. Run: npm install");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
for (const asset of assets) {
  if (!fs.existsSync(asset.from)) {
    console.error(`Missing bootstrap asset: ${asset.from}`);
    process.exit(1);
  }
  fs.copyFileSync(asset.from, asset.to);
  console.log(`copied ${path.relative(ROOT, asset.to)}`);
}
