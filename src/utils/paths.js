const path = require("path");

function safeStaticPath(base, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const target = path.resolve(base, decoded.replace(/^\/+/, ""));
  if (!target.startsWith(base)) return null;
  return target;
}

module.exports = {
  safeStaticPath,
};
