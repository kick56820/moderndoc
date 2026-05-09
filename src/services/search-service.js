const { makeExcerpt, normalizeSearchText, normalizeTopicBaseTitle } = require("../utils/text");
const { displayIndexLabel } = require("../data/docs-store");

function createSearchService(store) {
  function searchTopics(query, limit) {
    const q = query.trim().toLowerCase();
    if (!q) {
      return store.topics.slice(0, limit).map(summary).map((item) => ({ ...item, source: "reference" }));
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
      return store.bookSearchEntries.slice(0, limit).map((entry) => ({
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
    for (const entry of store.bookSearchEntries) {
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

    return store.topics
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

  function searchIndex(query, limit) {
    const q = query.trim().toLowerCase();
    if (!q) return formatIndexWindow(store.indexEntries.slice(0, limit));

    const start = lowerBoundIndex(q);
    const windowStart = Math.max(0, start - 1);
    const neighborhood = store.indexEntries.slice(windowStart, windowStart + limit);

    const contains = [];
    const seen = new Set(neighborhood.map((entry) => `${entry.topicId}\0${entry.label}`));
    for (const entry of store.indexEntries) {
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
    let high = store.indexEntries.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const label = store.indexEntries[mid].label.toLowerCase();
      if (label.localeCompare(query, undefined, { sensitivity: "base" }) < 0) low = mid + 1;
      else high = mid;
    }
    return low;
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

  return {
    searchAll,
    searchTopics,
    searchBooks,
    rankReferenceTopics,
    searchIndex,
    classifyReferenceTopic,
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

module.exports = {
  createSearchService,
  classifyReferenceTopic,
};
