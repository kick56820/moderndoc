const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 18988;
const ROOT = path.join(__dirname, "..");
const sampleIds = ["h00159", "h00167", "h00177"];

function requestJson(pathname) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: "127.0.0.1", port: PORT, path: pathname }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`${pathname} returned ${res.statusCode}`));
          return;
        }
        resolve(JSON.parse(body));
      });
    }).on("error", reject);
  });
}

function waitForServer() {
  let attempts = 0;
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      attempts += 1;
      requestJson("/api/contents")
        .then(() => {
          clearInterval(timer);
          resolve();
        })
        .catch((error) => {
          if (attempts > 50) {
            clearInterval(timer);
            reject(error);
          }
        });
    }, 100);
  });
}

function collectWarnings(topic) {
  const warnings = [];
  for (const block of topic.blocks || []) {
    const text = block.text || "";
    if (block.type === "heading" && /^(case\b|elseif\b|else\b|end if\b|loop\b|do\b)/i.test(text)) {
      warnings.push(`code-like heading: ${text}`);
    }
    if (block.type === "paragraph" && /\btrueIF\s+/i.test(text)) {
      warnings.push(`paragraph contains glued IF: ${text}`);
    }
    if (block.type === "code" && text.includes("\n") && /^(if|do|choose case)\b/im.test(text) && !/^\t/m.test(text)) {
      warnings.push(`control-flow code has no tab indentation: ${text.split("\n")[0]}`);
    }
  }
  return warnings;
}

async function run() {
  const server = spawn(process.execPath, ["server.js", String(PORT)], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "pipe"],
  });
  try {
    await waitForServer();
    let warnings = [];
    for (const id of sampleIds) {
      const topic = await requestJson(`/api/topic/${id}`);
      warnings = warnings.concat(collectWarnings(topic).map((warning) => `${topic.title}: ${warning}`));
    }
    if (warnings.length) {
      throw new Error(`parser warnings:\n${warnings.join("\n")}`);
    }
    console.log("parser warning check passed");
  } finally {
    server.kill();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
