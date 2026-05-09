const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 18987;
const ROOT = path.join(__dirname, "..");
const samples = [
  {
    id: "h00159",
    title: "CHOOSE CASE",
    types: ["heading", "paragraph", "code", "paragraph", "code"],
    codeLines: ["CHOOSE CASE Weight", "CASE IS<16", "\tPostage=Weight*0.30", "END CHOOSE"],
  },
  {
    id: "h00167",
    title: "DO...LOOP",
    types: ["paragraph", "paragraph", "code", "paragraph", "code", "paragraph", "code", "paragraph", "code"],
    codeLines: ["DO UNTIL A > 15", "\tBeep(A)", "LOOP"],
  },
  {
    id: "h00177",
    title: "IF...THEN",
    types: ["paragraph", "paragraph", "code", "paragraph", "code", "paragraph", "code", "paragraph", "list", "code"],
    codeLines: ["IF X=Y THEN", "\tBeep(2)", "ELSEIF X=Z THEN", "\tShow (lb_parts); lb_parts.SetState(5,TRUE)", "END IF"],
  },
];

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
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const server = spawn(process.execPath, ["server.js", String(PORT)], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  server.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  try {
    await waitForServer();
    for (const sample of samples) {
      const topic = await requestJson(`/api/topic/${sample.id}`);
      const types = topic.blocks.map((block) => block.type);
      assert(
        JSON.stringify(types) === JSON.stringify(sample.types),
        `${sample.title}: expected block types ${sample.types.join(" > ")}, got ${types.join(" > ")}`,
      );

      const codeText = topic.blocks.filter((block) => block.type === "code").map((block) => block.text).join("\n");
      for (const line of sample.codeLines) {
        assert(codeText.indexOf(line) >= 0, `${sample.title}: missing code line ${JSON.stringify(line)}`);
      }
      assert(/^\t/m.test(codeText), `${sample.title}: expected tab-indented code`);
      console.log(`ok ${sample.title}`);
    }
  } finally {
    server.kill();
  }

  if (server.exitCode && server.exitCode !== 0) {
    throw new Error(stderr || `server exited with ${server.exitCode}`);
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
