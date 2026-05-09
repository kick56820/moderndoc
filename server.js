const { createApp } = require("./src/app");

const port = Number(process.env.PORT || process.argv[2] || 8787);
const host = process.env.HOST || "127.0.0.1";
const app = createApp();

app.listen(port, host, () => {
  console.log(`PowerBuilder docs running at http://${host}:${port}/`);
});
