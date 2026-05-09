const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const LOCAL_DATA = path.join(__dirname, "data");
const DOCS = LOCAL_DATA;
const PUBLIC = path.join(__dirname, "public");
const BOOK_ROOT = path.join(PUBLIC, "books", "pbman");
const bookContentsPath = path.join(BOOK_ROOT, "book-contents.json");
const topicsPath = path.join(DOCS, "helpdeco-topics.json");
const contentsPath = path.join(DOCS, "topics.json");
ensureRequiredFiles([
  topicsPath,
  contentsPath,
  path.join(DOCS, "PBHLP105.hpj"),
  path.join(PUBLIC, "index.html"),
  path.join(PUBLIC, "app.js"),
  path.join(PUBLIC, "styles.css"),
  bookContentsPath,
]);
const helpProjectPath = firstExistingPath([
  path.join(DOCS, "PBHLP105.hpj"),
  path.join(DOCS, "helpdeco-project", "PBHLP105.hpj"),
]);
const assetsRoot = firstExistingPath([
  path.join(DOCS, "assets"),
  path.join(DOCS, "helpdeco-project"),
]) || DOCS;

const topics = JSON.parse(fs.readFileSync(topicsPath, "utf8")).map((topic, index) => {
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
const relatedLinksByTopicId = buildRelatedLinksByTopicId(topics, topicByTitle);
const aliases = readHelpAliases(helpProjectPath);
const bookEntries = fs.existsSync(bookContentsPath) ? JSON.parse(fs.readFileSync(bookContentsPath, "utf8")) : [];
const bookSearchEntries = buildBookSearchEntries(bookEntries);
const contents = JSON.parse(fs.readFileSync(contentsPath, "utf8")).map((entry) => {
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
const referenceSequence = buildReferenceSequence(contents);
const referencePosition = new Map(referenceSequence.map((topicId, index) => [topicId, index]));

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

function sendJson(res, data) {
  const body = JSON.stringify(data);
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".bmp": "image/bmp",
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
  };
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === "ENOENT" ? 404 : 500);
      res.end(err.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    res.writeHead(200, {
      "content-type": types[ext] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(data);
  });
}

function safeStaticPath(base, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const target = path.resolve(base, decoded.replace(/^\/+/, ""));
  if (!target.startsWith(base)) return null;
  return target;
}

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

function getTopicNav(topicId) {
  const index = referencePosition.get(topicId);
  if (index === undefined) return { prev: null, next: null };
  return {
    prev: topicNavItem(referenceSequence[index - 1]),
    next: topicNavItem(referenceSequence[index + 1]),
  };
}

function topicNavItem(topicId) {
  if (!topicId) return null;
  const topic = topicById.get(topicId);
  if (!topic) return null;
  return {
    id: topic.id,
    title: topic.title,
  };
}

function searchTopics(query, limit) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return topics.slice(0, limit).map(summary).map((item) => ({ ...item, source: "reference" }));
  }
  return rankReferenceTopics(q)
    .slice(0, limit)
    .map(({ topic, score }) => ({ ...summary(topic), source: "reference", rank: score }));
}

function searchAll(query, limit, source = "all") {
  if (source === "reference") return searchTopics(query, limit);
  if (source === "html-books") return searchBooks(query, limit);

  const referenceLimit = Math.max(20, Math.ceil(limit * 0.65));
  const bookLimit = Math.max(20, limit - referenceLimit);
  return searchTopics(query, referenceLimit)
    .concat(searchBooks(query, bookLimit))
    .slice(0, limit);
}

function searchBooks(query, limit) {
  const q = query.trim().toLowerCase();
  const source = "html-books";
  if (!q) {
    return bookSearchEntries.slice(0, limit).map((entry) => ({
      source,
      category: "HTML Books",
      id: entry.local,
      local: entry.local,
      title: entry.title,
      excerpt: entry.excerpt,
    }));
  }

  const starts = [];
  const contains = [];
  for (const entry of bookSearchEntries) {
    const item = {
      source,
      category: "HTML Books",
      id: entry.local,
      local: entry.local,
      title: entry.title,
      excerpt: makeExcerpt(entry.text, q),
    };
    if (entry.title.toLowerCase().startsWith(q)) starts.push(item);
    else if (entry.search.includes(q)) contains.push(item);
    if (starts.length + contains.length >= limit * 2) break;
  }
  return starts.concat(contains).slice(0, limit);
}

function rankReferenceTopics(query) {
  const q = normalizeSearchText(query);
  if (!q) return [];

  return topics
    .map((topic) => ({ topic, score: scoreTopic(topic, q) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.topic.title.length !== b.topic.title.length) return a.topic.title.length - b.topic.title.length;
      return a.topic.index - b.topic.index;
    });
}

function scoreTopic(topic, query) {
  const title = normalizeSearchText(topic.title);
  const baseTitle = normalizeTopicBaseTitle(topic.title);
  const context = normalizeSearchText(topic.context);
  const keywords = topic.keywords.map(normalizeSearchText);
  const text = normalizeSearchText(topic.text);
  let score = 0;

  if (baseTitle === query && / powerscript function$/i.test(topic.title)) score = Math.max(score, 12000);
  if (baseTitle === query && / powerscript event$/i.test(topic.title)) score = Math.max(score, 10500);
  if (baseTitle === query) score = Math.max(score, 9800);
  if (title === query) score = Math.max(score, 9600);
  if (keywords.includes(query)) score = Math.max(score, 9000);
  if (title.startsWith(`${query} `)) score = Math.max(score, 8000);
  if (keywords.some((keyword) => keyword.startsWith(query))) score = Math.max(score, 7200);
  if (context === query) score = Math.max(score, 6800);
  if (title.includes(query)) score = Math.max(score, 5200);
  if (text.includes(query)) score = Math.max(score, 1200);

  if (/^examples for /i.test(topic.title)) score -= 500;
  if (/^syntax\s+\d+\b/i.test(topic.title)) score -= 350;
  return Math.max(0, score);
}

function normalizeTopicBaseTitle(title) {
  return normalizeSearchText(title)
    .replace(/\s+powerscript\s+(function|event|statement)$/, "")
    .replace(/\s+datawindow\s+expression\s+function$/, "")
    .replace(/\s+database\s+parameter$/, "");
}

function normalizeSearchText(value) {
  return String(value || "").trim().replace(/[.]+/g, " ").replace(/\s+/g, " ").toLowerCase();
}

function searchIndex(query, limit) {
  const q = query.trim().toLowerCase();
  if (!q) return formatIndexWindow(indexEntries.slice(0, limit));

  const start = lowerBoundIndex(q);
  const windowStart = Math.max(0, start - 1);
  const neighborhood = indexEntries.slice(windowStart, windowStart + limit);

  const contains = [];
  const seen = new Set(neighborhood.map((entry) => `${entry.topicId}\0${entry.label}`));
  for (const entry of indexEntries) {
    if (contains.length >= Math.floor(limit / 4)) break;
    const key = `${entry.topicId}\0${entry.label}`;
    if (!seen.has(key) && entry.label.toLowerCase().includes(q)) {
      contains.push(entry);
      seen.add(key);
    }
  }
  return formatIndexWindow(neighborhood.concat(contains).slice(0, limit));
}

function formatIndexWindow(entries) {
  let previousPrefix = "";
  return entries.map((entry) => {
    const colon = entry.label.indexOf(":");
    if (colon < 0) {
      previousPrefix = "";
      return entry;
    }
    const prefix = entry.label.slice(0, colon).toLowerCase();
    const suffix = entry.label.slice(colon + 1).trim();
    const display = prefix === previousPrefix ? `    ${suffix}` : displayIndexLabel(entry.label);
    previousPrefix = prefix;
    return { ...entry, display };
  });
}

function lowerBoundIndex(query) {
  let low = 0;
  let high = indexEntries.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const label = indexEntries[mid].label.toLowerCase();
    if (label.localeCompare(query, undefined, { sensitivity: "base" }) < 0) low = mid + 1;
    else high = mid;
  }
  return low;
}

function displayIndexLabel(label) {
  const parts = label.split(":");
  if (parts.length < 2) return label;
  return `${parts[0]}: ${parts.slice(1).join(": ")}`;
}

function summary(topic) {
  return {
    id: topic.id,
    title: topic.title,
    context: topic.context,
    keywords: topic.keywords.slice(0, 8),
    excerpt: topic.text.replace(/\s+/g, " ").slice(0, 260),
    category: classifyReferenceTopic(topic),
  };
}

function classifyReferenceTopic(topic) {
  if (/^examples for /i.test(topic.title)) return "Examples";
  if (/^syntax\s+\d+\b/i.test(topic.title)) return "Syntax";
  if (/ powerscript function$/i.test(topic.title)) return "Function";
  if (/ powerscript event$/i.test(topic.title)) return "Event";
  if (/ powerscript statement$/i.test(topic.title)) return "Statement";
  if (/datawindow/i.test(topic.title)) return "DataWindow";
  return "Reference";
}

function buildBookSearchEntries(entries) {
  const seen = new Set();
  const indexed = [];
  for (const entry of entries) {
    if (!entry.local || seen.has(entry.local)) continue;
    seen.add(entry.local);

    const filePath = safeStaticPath(BOOK_ROOT, entry.local);
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

function searchInsight(query) {
  const q = normalizeSearchText(query);
  if (!q) return null;

  const ranked = rankReferenceTopics(q)
    .filter(({ topic }) => !/^examples for /i.test(topic.title))
    .filter(({ topic }) => !/^syntax\s+\d+\b/i.test(topic.title));
  const primary = ranked[0] ? ranked[0].topic : null;
  if (!primary) return null;

  const baseBlocks = renderBlocks(primary);
  const relatedSyntax = getRelatedSyntax(primary);
  const exampleTopics = getInsightExampleTopics(primary, relatedSyntax);
  const eventTopic = findCompanionEventTopic(primary, q);

  return {
    query,
    primary: {
      id: primary.id,
      title: primary.title,
      context: primary.context,
    },
    sections: {
      overview: getOverview(baseBlocks),
      syntax: relatedSyntax,
      commonUses: getCommonUses(baseBlocks),
      examples: getExamplePreviews(exampleTopics),
      notes: getInsightNotes(baseBlocks, relatedSyntax),
      eventFlow: eventTopic ? {
        id: eventTopic.id,
        title: eventTopic.title,
        summary: getOverview(renderBlocks(eventTopic)),
      } : null,
    },
  };
}

function getOverview(blocks) {
  const firstParagraph = blocks.find((block, index) => (
    block.type === "paragraph" &&
    block.text &&
    !(index === 0 && /^examples for | powerscript (function|event|statement)$/i.test(block.text))
  ));
  return firstParagraph ? firstParagraph.text.replace(/\s+/g, " ").slice(0, 360) : "";
}

function getRelatedSyntax(topic) {
  const links = relatedLinksByTopicId.get(topic.id) || {};
  return Object.keys(links)
    .sort((a, b) => Number(syntaxNumber(a) || 0) - Number(syntaxNumber(b) || 0))
    .map((label) => {
      const target = topicById.get(links[label]);
      return {
        label: titleCaseSyntaxLabel(label),
        topicId: links[label],
        title: target ? target.title : titleCaseSyntaxLabel(label),
        summary: target ? getOverview(renderBlocks(target)) : "",
      };
    });
}

function titleCaseSyntaxLabel(label) {
  return label.replace(/\bsyntax\b/i, "Syntax");
}

function syntaxNumber(label) {
  const match = label.match(/\d+/);
  return match ? match[0] : "";
}

function getCommonUses(blocks) {
  const table = blocks.find((block) => block.type === "table" && Array.isArray(block.rows) && block.rows.length > 1);
  if (!table) return [];

  const header = table.rows[0].map((cell) => normalizeSearchText(cell));
  const toIndex = header.findIndex((cell) => /^(to|to obtain|to open|object)$/.test(cell));
  const useIndex = header.findIndex((cell) => /^(use|see)$/.test(cell));
  if (toIndex < 0 || useIndex < 0) return [];

  return table.rows.slice(1, 7).map((row) => ({
    to: row[toIndex] || "",
    use: row[useIndex] || "",
  })).filter((row) => row.to || row.use);
}

function getNotes(blocks) {
  const notes = [];
  for (const heading of ["Return value", "Usage", "Controls"]) {
    const section = getSectionText(blocks, heading).replace(/\s+/g, " ").trim();
    if (section) notes.push({ title: heading, text: section.slice(0, 360) });
  }
  return notes;
}

function getInsightNotes(baseBlocks, syntaxItems) {
  const notes = getNotes(baseBlocks);
  if (notes.length >= 2) return notes.slice(0, 4);

  for (const syntax of syntaxItems) {
    const topic = topicById.get(syntax.topicId);
    if (!topic) continue;
    for (const note of getNotes(renderBlocks(topic))) {
      if (!notes.some((existing) => existing.title === note.title && existing.text === note.text)) {
        notes.push({ ...note, title: `${syntax.label}: ${note.title}` });
      }
      if (notes.length >= 4) return notes;
    }
  }
  return notes;
}

function getSectionText(blocks, heading) {
  const start = blocks.findIndex((block) => block.type === "heading" && normalizeSearchText(block.text) === normalizeSearchText(heading));
  if (start < 0) return "";

  const parts = [];
  for (const block of blocks.slice(start + 1)) {
    if (block.type === "heading") break;
    if (block.type === "paragraph" || block.type === "code") parts.push(block.text || "");
    if (block.type === "list") parts.push((block.items || []).join(" "));
  }
  return parts.join(" ");
}

function getInsightExampleTopics(primary, syntaxItems) {
  const candidates = [];
  const direct = topicByTitle.get(`examples for ${primary.title}`.toLowerCase());
  if (direct) candidates.push(direct);

  for (const syntax of syntaxItems) {
    const syntaxTopic = topicById.get(syntax.topicId);
    if (!syntaxTopic) continue;
    const example = topicByTitle.get(`examples for ${syntaxTopic.title}`.toLowerCase());
    if (example) candidates.push(example);
  }

  if (!candidates.length) {
    const baseTitle = normalizeTopicBaseTitle(primary.title);
    const fallback = topics.find((topic) => (
      /^examples for /i.test(topic.title) &&
      normalizeTopicBaseTitle(topic.title.replace(/^examples for\s+/i, "")) === baseTitle
    ));
    if (fallback) candidates.push(fallback);
  }

  const seen = new Set();
  return candidates.filter((topic) => {
    if (seen.has(topic.id)) return false;
    seen.add(topic.id);
    return true;
  }).slice(0, 3);
}

function getExamplePreviews(exampleTopics) {
  return exampleTopics.map((topic) => {
    const blocks = renderBlocks(topic);
    const introBlock = blocks.find((block) => block.type === "paragraph");
    const code = blocks
      .filter((block) => block.type === "code")
      .slice(0, 2)
      .map((block) => block.text)
      .join("\n\n");
    const intro = introBlock ? introBlock.text : "";
    return {
      id: topic.id,
      title: topic.title,
      intro: intro.replace(/\s+/g, " ").slice(0, 260),
      code: code.slice(0, 900),
    };
  }).filter((example) => example.intro || example.code);
}

function findCompanionEventTopic(primary, query) {
  if (/ powerscript event$/i.test(primary.title)) return null;
  return topics.find((topic) => (
    normalizeTopicBaseTitle(topic.title) === query &&
    / powerscript event$/i.test(topic.title)
  )) || null;
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

function route(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || "/";

  if (pathname === "/api/search") {
    sendJson(res, searchAll(
      String(parsed.query.q || ""),
      Number(parsed.query.limit || 80),
      String(parsed.query.source || "all"),
    ));
    return;
  }

  if (pathname === "/api/search-insight") {
    sendJson(res, searchInsight(String(parsed.query.q || "")) || {});
    return;
  }

  if (pathname === "/api/index") {
    sendJson(res, searchIndex(String(parsed.query.q || ""), Number(parsed.query.limit || 400)));
    return;
  }

  if (pathname === "/api/contents") {
    sendJson(res, contents);
    return;
  }

  if (pathname.startsWith("/api/topic/")) {
    const id = decodeURIComponent(pathname.slice("/api/topic/".length));
    const topic = topics.find((item) => item.id === id);
    if (!topic) {
      res.writeHead(404);
      res.end("Topic not found");
      return;
    }
    sendJson(res, {
      id: topic.id,
      title: topic.title,
      context: topic.context,
      keywords: topic.keywords,
      blocks: renderTopicBlocks(topic),
      links: relatedLinksByTopicId.get(topic.id) || {},
      nav: getTopicNav(topic.id),
    });
    return;
  }

  if (pathname.startsWith("/assets/")) {
    const assetPath = safeStaticPath(assetsRoot, pathname.slice("/assets/".length));
    if (!assetPath) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    sendFile(res, assetPath);
    return;
  }

  const staticPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = safeStaticPath(PUBLIC, staticPath);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  sendFile(res, filePath);
}

function renderTopicBlocks(topic) {
  const blocks = renderBlocks(topic);
  if (/^examples for /i.test(topic.title)) return blocks;

  const examples = topicByTitle.get(`examples for ${topic.title}`.toLowerCase());
  if (!examples) return blocks;

  return mergeAdjacentTextBlocks(blocks.concat(renderBlocks(examples)));
}

function renderBlocks(topic) {
  if (!Array.isArray(topic.blocks)) return segmentText(topic.text);
  const rendered = [];
  for (const block of topic.blocks) {
    if (block.type === "table") {
      rendered.push({ type: "table", rows: block.rows || [] });
    } else if (block.type === "image") {
      rendered.push({
        type: "image",
        src: `/assets/${encodeURIComponent(block.src || block.alt || "")}`,
        alt: block.alt || block.src || "",
      });
    } else if (block.type === "text") {
      const text = block.text || "";
      if (!isHelpButtonBlock(text)) rendered.push(...segmentText(text));
    }
  }
  return mergeAdjacentTextBlocks(rendered);
}

function isHelpButtonBlock(text) {
  return /^(?:\{button\s+[^}]+\}\s*)+$/i.test(text.trim());
}

function mergeAdjacentTextBlocks(blocks) {
  const merged = [];
  for (const block of blocks) {
    const previous = merged[merged.length - 1];
    if (block.type === "code" && previous && previous.type === "code") {
      previous.text += `\n${block.text}`;
    } else if (block.type === "list" && previous && previous.type === "list") {
      previous.items.push(...block.items);
    } else {
      merged.push(block);
    }
  }
  return merged.map((block) => (
    block.type === "code" ? { ...block, text: normalizePowerScriptIndent(block.text) } : block
  ));
}

function segmentText(text) {
  const raw = text
    .split(/\n{2,}/)
    .map((part) => part.replace(/^\n+|\n+$/g, ""))
    .filter((part) => part.trim());
  const blocks = [];
  for (const part of raw) {
    const lines = part.split(/\n/).map((line) => line.replace(/\s+$/g, ""));
    if (lines.length === 1 && /^\[Image: .+\]$/.test(lines[0])) {
      const image = lines[0].slice(8, -1);
      blocks.push({ type: "image", src: `/assets/${encodeURIComponent(image)}`, alt: image });
      continue;
    }
    if (isBullet(lines)) {
      const split = splitBulletWithInlineCode(lines[0]);
      blocks.push({ type: "list", items: [split.item] });
      if (split.code) blocks.push({ type: "code", language: "powerscript", text: formatCodeText([split.code]) });
      continue;
    }
    if (isCodeBlock(lines)) {
      blocks.push({ type: "code", language: "powerscript", text: formatCodeText(lines) });
    } else if (isHeading(lines)) {
      blocks.push({ type: "heading", text: lines.join(" ") });
    } else {
      blocks.push({ type: "paragraph", text: lines.join("\n").trim() });
    }
  }
  return mergeCodeBlocks(blocks);
}

function formatCodeText(lines) {
  return lines
    .map((line) => line.replace(/^( {4})+/g, (spaces) => "\t".repeat(spaces.length / 4)))
    .join("\n");
}

function isHeading(lines) {
  if (lines.length !== 1) return false;
  const line = lines[0];
  if (line.length > 80) return false;
  if (/[:.;,]$/.test(line)) return false;
  return /^[A-Z][A-Za-z0-9 ,/'()!-]+$/.test(line);
}

function isBullet(lines) {
  return lines.length === 1 && /^·\s*/.test(lines[0]);
}

function splitBulletWithInlineCode(line) {
  const text = line.replace(/^·\s*/, "");
  const match = text.match(/^(.*?\btrue)(IF\s+.+\bTHEN)$/i);
  if (!match) return { item: text, code: "" };
  return { item: match[1].trim(), code: match[2].trim() };
}

function isCodeBlock(lines) {
  const text = lines.join("\n").trim();
  if (!text) return false;
  if (/^Example\s+\d+\s+/i.test(text)) return false;
  if (/^(?:do\s+(?:until|while)|loop\s+(?:until|while))\s{2,}\S/i.test(text)) return false;
  if (lines.length === 1 && / {2,}/.test(text) && /^[\d.+\-:"'~A-Za-z][\d\s.+\-:"'~A-Za-z]+(?:\/\/.*)?$/.test(text)) return true;
  if (/&\s*$/.test(text)) return true;
  if (/\/\//.test(text) && !/[.!?]\s/.test(text)) return true;
  if (/^["']/.test(text)) return true;
  if (/^[a-z_]\w*\)$/i.test(text)) return true;
  if (/^[a-z_][\w.]*\s*,.+\)$/i.test(text)) return true;
  if (/^(\/\/|do\b|choose case|case\b|try\b|catch\b|finally\b|return\b|next\b|loop\b|end if\b|end choose\b|elseif\b|else\b)/i.test(text)) return true;
  if (/^if\s+.+\bthen\b/i.test(text)) return true;
  if (/^for\s+\w+\s*=/i.test(text)) return true;
  if (/^[a-z_][\w.]*\s*\(.+\)\s*;/i.test(text)) return true;
  if (/^[a-z_][\w.]*\s*=\s*.+/i.test(text)) return true;
  if (/^[a-z_][\w.]*\s*\(.+\)$/i.test(text)) return true;
  if (/^(integer|long|longlong|decimal|dec|double|real|string|char|boolean|date|time|datetime|blob|any|object|window|datawindow|datastore)\s+[a-z_]\w*(?:\s*(?:=|,|\[|\(|$))/i.test(text)) return true;
  if (lines.length > 1 && lines.every((line) => /^(\s{2,}|[A-Za-z_]\w*\s*=|\/\/|NEXT\b|END\b|ELSE\b|IF\b)/i.test(line) || line.trim() === "")) return true;
  return false;
}

function mergeCodeBlocks(blocks) {
  const merged = [];
  for (const block of blocks) {
    const previous = merged[merged.length - 1];
    if (block.type === "code" && previous && previous.type === "code") {
      previous.text += `\n${block.text}`;
    } else {
      merged.push(block);
    }
  }
  return merged.map((block) => (
    block.type === "code" ? { ...block, text: normalizePowerScriptIndent(block.text) } : block
  ));
}

function normalizePowerScriptIndent(text) {
  if (/^if\b/im.test(text)) return normalizeIfIndent(text);
  if (/^do\b|^loop\b/im.test(text)) return normalizeDoLoopIndent(text);
  if (!/^choose case\b/im.test(text)) return text;
  return text.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return "";
    if (/^(choose case|case\b|end choose\b)/i.test(trimmed)) return trimmed;
    return line.startsWith("\t") ? line : `\t${trimmed}`;
  }).join("\n");
}

function normalizeIfIndent(text) {
  let depth = 0;
  return text.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return "";
    const isEnd = /^end if\b/i.test(trimmed);
    const isBranch = /^(elseif\b|else\b)/i.test(trimmed);
    if (isEnd) depth = Math.max(0, depth - 1);
    const indent = Math.max(0, depth - (isBranch ? 1 : 0));
    const formatted = `${"\t".repeat(indent)}${trimmed}`;
    if (/^if\b.+\bthen\b/i.test(trimmed) && !/\belse\b/i.test(trimmed)) depth += 1;
    return formatted;
  }).join("\n");
}

function normalizeDoLoopIndent(text) {
  let depth = 0;
  return text.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return "";
    const isLoopEnd = /^loop\b/i.test(trimmed);
    const indent = Math.max(0, depth - (isLoopEnd ? 1 : 0));
    const formatted = `${"\t".repeat(indent)}${trimmed}`;
    if (/^do\b/i.test(trimmed) && !/^do\s+until\s+.+\s+the following/i.test(trimmed)) depth += 1;
    if (isLoopEnd) depth = Math.max(0, depth - 1);
    return formatted;
  }).join("\n");
}

const port = Number(process.env.PORT || process.argv[2] || 8787);
const host = "127.0.0.1";
http.createServer(route).listen(port, host, () => {
  console.log(`PowerBuilder docs running at http://${host}:${port}/`);
});
