function htmlToPlainText(value) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function makeExcerpt(text, query) {
  const lower = text.toLowerCase();
  const index = lower.indexOf(query);
  if (index < 0) return text.slice(0, 260);
  const start = Math.max(0, index - 90);
  const prefix = start > 0 ? "..." : "";
  return `${prefix}${text.slice(start, start + 260)}`;
}

function normalizeSearchText(value) {
  return String(value || "").trim().replace(/[.]+/g, " ").replace(/\s+/g, " ").toLowerCase();
}

function normalizeTopicBaseTitle(title) {
  return normalizeSearchText(title)
    .replace(/\s+powerscript\s+(function|event|statement)$/, "")
    .replace(/\s+datawindow\s+expression\s+function$/, "")
    .replace(/\s+database\s+parameter$/, "");
}

module.exports = {
  htmlToPlainText,
  makeExcerpt,
  normalizeSearchText,
  normalizeTopicBaseTitle,
};
