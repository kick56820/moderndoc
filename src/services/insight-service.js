const { makeExcerpt, normalizeSearchText, normalizeTopicBaseTitle } = require("../utils/text");

function createInsightService(store, topicService, searchService) {
  function searchInsight(query) {
    const q = normalizeSearchText(query);
    if (!q) return null;

    const ranked = searchService.rankReferenceTopics(q)
      .filter(({ topic }) => !/^examples for /i.test(topic.title))
      .filter(({ topic }) => !/^syntax\s+\d+\b/i.test(topic.title));
    const primary = ranked[0] ? ranked[0].topic : null;
    if (!primary) return null;

    const baseBlocks = topicService.renderBlocks(primary);
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
        relatedGroups: getRelatedGroups(ranked, primary.id, q),
        eventFlow: eventTopic ? {
          id: eventTopic.id,
          title: eventTopic.title,
          summary: getOverview(topicService.renderBlocks(eventTopic)),
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
    const links = store.relatedLinksByTopicId.get(topic.id) || {};
    return Object.keys(links)
      .sort((a, b) => Number(syntaxNumber(a) || 0) - Number(syntaxNumber(b) || 0))
      .map((label) => {
        const target = store.topicById.get(links[label]);
        return {
          label: titleCaseSyntaxLabel(label),
          topicId: links[label],
          title: target ? target.title : titleCaseSyntaxLabel(label),
          summary: target ? getOverview(topicService.renderBlocks(target)) : "",
        };
      });
  }

  function getInsightNotes(baseBlocks, syntaxItems) {
    const notes = getNotes(baseBlocks);
    if (notes.length >= 2) return notes.slice(0, 4);

    for (const syntax of syntaxItems) {
      const topic = store.topicById.get(syntax.topicId);
      if (!topic) continue;
      for (const note of getNotes(topicService.renderBlocks(topic))) {
        if (!notes.some((existing) => existing.title === note.title && existing.text === note.text)) {
          notes.push({ ...note, title: `${syntax.label}: ${note.title}` });
        }
        if (notes.length >= 4) return notes;
      }
    }
    return notes;
  }

  function getRelatedGroups(ranked, primaryId, query) {
    const order = ["Function", "Event", "Statement", "Syntax", "Examples", "DataWindow", "Reference"];
    const groups = new Map();

    for (const { topic, score } of ranked.slice(0, 80)) {
      const category = searchService.classifyReferenceTopic(topic);
      if (!groups.has(category)) groups.set(category, []);
      const items = groups.get(category);
      if (items.length >= 10) continue;
      items.push({
        id: topic.id,
        title: topic.title,
        context: topic.context,
        excerpt: makeExcerpt(topic.text, query).slice(0, 220),
        rank: score,
        primary: topic.id === primaryId,
      });
    }

    return Array.from(groups.entries())
      .sort((a, b) => {
        const ai = order.indexOf(a[0]);
        const bi = order.indexOf(b[0]);
        return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
      })
      .map(([label, items]) => ({ label, items }));
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
    const direct = store.topicByTitle.get(`examples for ${primary.title}`.toLowerCase());
    if (direct) candidates.push(direct);

    for (const syntax of syntaxItems) {
      const syntaxTopic = store.topicById.get(syntax.topicId);
      if (!syntaxTopic) continue;
      const example = store.topicByTitle.get(`examples for ${syntaxTopic.title}`.toLowerCase());
      if (example) candidates.push(example);
    }

    if (!candidates.length) {
      const baseTitle = normalizeTopicBaseTitle(primary.title);
      const fallback = store.topics.find((topic) => (
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
      const blocks = topicService.renderBlocks(topic);
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
    return store.topics.find((topic) => (
      normalizeTopicBaseTitle(topic.title) === query &&
      / powerscript event$/i.test(topic.title)
    )) || null;
  }

  return {
    searchInsight,
  };

  function getNotes(blocks) {
    const notes = [];
    for (const heading of ["Return value", "Usage", "Controls"]) {
      const section = getSectionText(blocks, heading).replace(/\s+/g, " ").trim();
      if (section) notes.push({ title: heading, text: section.slice(0, 360) });
    }
    return notes;
  }
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

module.exports = {
  createInsightService,
};
