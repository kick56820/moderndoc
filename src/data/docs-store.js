const fs = require("fs");
const path = require("path");
const { htmlToPlainText } = require("../utils/text");
const { safeStaticPath } = require("../utils/paths");

function createDocsStore(paths) {
  paths.ensureDeploymentFiles();

  const topics = JSON.parse(fs.readFileSync(paths.topicsPath, "utf8")).map((topic, index) => {
    const keywords = String(topic.keywords || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean);
    const search = [topic.title, topic.context, topic.keywords, topic.text].join(" ").toLowerCase();
    return {
      index,
      id: topic.id,
      title: topic.title || topic.context || topic.id,
      context: topic.context || "",
      keywords,
      text: topic.text || "",
      blocks: topic.blocks || null,
      search,
    };
  });

  const topicByTitle = new Map(topics.map((topic) => [topic.title.toLowerCase(), topic]));
  const topicByContext = new Map(topics.map((topic) => [topic.context.toLowerCase(), topic]));
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const aliases = readHelpAliases(paths.helpProjectPath);

  function resolveContentTopic(entry) {
    const target = String(entry.target || "").toLowerCase();
    if (target) {
      const direct = topicByContext.get(target);
      if (direct) return direct;

      const alias = aliases.get(target);
      if (alias) {
        const aliased = topicByContext.get(alias) || topicByTitle.get(alias);
        if (aliased) return aliased;
      }
    }

    return topicByTitle.get(String(entry.title || "").toLowerCase()) || null;
  }

  const contents = JSON.parse(fs.readFileSync(paths.contentsPath, "utf8")).map((entry) => {
    const topic = resolveContentTopic(entry);
    return {
      id: entry.id,
      level: entry.level,
      title: entry.title,
      type: entry.type,
      target: entry.target || "",
      path: entry.path || entry.title,
      topicId: topic ? topic.id : "",
    };
  });

  const bookEntries = fs.existsSync(paths.bookContentsPath) ? JSON.parse(fs.readFileSync(paths.bookContentsPath, "utf8")) : [];
  const bookSearchEntries = buildBookSearchEntries(bookEntries, paths.BOOK_ROOT);
  const indexEntries = buildIndexEntries(topics);
  const relatedLinksByTopicId = buildRelatedLinksByTopicId(topics, topicByTitle);
  const referenceSequence = buildReferenceSequence(contents);
  const referencePosition = new Map(referenceSequence.map((topicId, index) => [topicId, index]));

  return {
    paths,
    topics,
    topicByTitle,
    topicByContext,
    topicById,
    contents,
    bookEntries,
    bookSearchEntries,
    indexEntries,
    relatedLinksByTopicId,
    referenceSequence,
    referencePosition,
  };
}

function readHelpAliases(filePath) {
  const aliases = new Map();
  if (!filePath) return aliases;
  let inAliasSection = false;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";")) continue;
    if (/^\[.+\]$/.test(line)) {
      inAliasSection = line.toLowerCase() === "[alias]";
      continue;
    }
    if (!inAliasSection) continue;
    const match = line.match(/^([^=]+)=(.+)$/);
    if (match) aliases.set(match[1].trim().toLowerCase(), match[2].trim().toLowerCase());
  }
  return aliases;
}

function buildIndexEntries(topics) {
  const indexEntries = [];
  for (const topic of topics) {
    indexEntries.push({ label: topic.title, display: topic.title, topicId: topic.id, type: "title" });
    for (const keyword of topic.keywords) {
      if (keyword.toLowerCase() !== topic.title.toLowerCase()) {
        indexEntries.push({ label: keyword, display: displayIndexLabel(keyword), topicId: topic.id, type: "keyword" });
      }
    }
  }
  indexEntries.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  return indexEntries;
}

function buildBookSearchEntries(entries, bookRoot) {
  const seen = new Set();
  const indexed = [];
  for (const entry of entries) {
    if (!entry.local || seen.has(entry.local)) continue;
    seen.add(entry.local);

    const filePath = safeStaticPath(bookRoot, entry.local);
    if (!filePath || !fs.existsSync(filePath)) continue;

    const text = htmlToPlainText(fs.readFileSync(filePath, "utf8"));
    indexed.push({
      title: entry.title,
      local: entry.local,
      text,
      excerpt: text.slice(0, 260),
      search: `${entry.title} ${text}`.toLowerCase(),
    });
  }
  return indexed;
}

function buildRelatedLinksByTopicId(allTopics, byTitle) {
  const linksByTopicId = new Map();

  for (const topic of allTopics) {
    const syntax = topic.title.match(/^(Syntax\s+\d+)\b/i);
    if (!syntax) continue;

    const firstLine = String(topic.text || "").split(/\r?\n/, 1)[0];
    const parentTitle = firstLine.endsWith(":") ? firstLine.slice(0, -1).trim() : "";
    if (!parentTitle) continue;

    const parent = byTitle.get(parentTitle.toLowerCase());
    if (!parent) continue;

    const links = linksByTopicId.get(parent.id) || {};
    links[syntax[1].toLowerCase()] = topic.id;
    linksByTopicId.set(parent.id, links);
  }

  return linksByTopicId;
}

function buildReferenceSequence(entries) {
  const seen = new Set();
  const sequence = [];
  for (const entry of entries) {
    if (!entry.topicId || seen.has(entry.topicId)) continue;
    seen.add(entry.topicId);
    sequence.push(entry.topicId);
  }
  return sequence;
}

function displayIndexLabel(label) {
  const parts = label.split(":");
  if (parts.length < 2) return label;
  return `${parts[0]}: ${parts.slice(1).join(": ")}`;
}

module.exports = {
  createDocsStore,
  displayIndexLabel,
};
