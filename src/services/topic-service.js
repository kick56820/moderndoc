const { segmentText, mergeCodeBlocks } = require("../parser/help-parser");

function createTopicService(store) {
  function getTopic(id) {
    return store.topicById.get(id) || null;
  }

  function renderTopicBlocks(topic) {
    const blocks = renderBlocks(topic);
    if (/^examples for /i.test(topic.title)) return blocks;

    const examples = store.topicByTitle.get(`examples for ${topic.title}`.toLowerCase());
    if (!examples) return blocks;

    return mergeAdjacentTextBlocks(blocks.concat(renderBlocks(examples)));
  }

  function renderTopicSections(topic) {
    return blocksToSections(renderTopicBlocks(topic), topic.title);
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

  function getTopicNav(topicId) {
    const index = store.referencePosition.get(topicId);
    if (index === undefined) return { prev: null, next: null };
    return {
      prev: topicNavItem(store.referenceSequence[index - 1]),
      next: topicNavItem(store.referenceSequence[index + 1]),
    };
  }

  function topicNavItem(topicId) {
    if (!topicId) return null;
    const topic = store.topicById.get(topicId);
    if (!topic) return null;
    return {
      id: topic.id,
      title: topic.title,
    };
  }

  function getTopicPayload(topic) {
    const blocks = renderTopicBlocks(topic);
    return {
      id: topic.id,
      title: topic.title,
      context: topic.context,
      keywords: topic.keywords,
      blocks,
      sections: blocksToSections(blocks, topic.title),
      links: store.relatedLinksByTopicId.get(topic.id) || {},
      nav: getTopicNav(topic.id),
    };
  }

  return {
    getTopic,
    renderTopicBlocks,
    renderTopicSections,
    renderBlocks,
    getTopicNav,
    getTopicPayload,
  };
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
    block.type === "code" ? mergeCodeBlocks([block])[0] : block
  ));
}

function blocksToSections(blocks, topicTitle) {
  const sections = [];
  let current = createSection("summary", topicTitle, "summary");

  for (const block of blocks) {
    if (block.type === "heading") {
      const title = normalizeSectionTitle(block.text, topicTitle);
      const kind = sectionKind(title);

      if (current.blocks.length) sections.push(current);
      current = createSection(kind, title, kind);
      continue;
    }

    current.blocks.push(block);
  }

  if (current.blocks.length || !sections.length) sections.push(current);
  return sections.map((section, index) => ({
    ...section,
    id: `${section.kind}-${index}`,
  }));
}

function createSection(kind, title, fallbackKind) {
  return {
    id: "",
    kind: kind || fallbackKind || "section",
    title: title || "Overview",
    blocks: [],
  };
}

function normalizeSectionTitle(title, topicTitle) {
  const text = String(title || "").trim();
  const example = text.match(/^Examples for\s+(.+)$/i);
  if (example) return `Examples: ${example[1]}`;
  if (topicTitle && text.toLowerCase() === String(topicTitle).trim().toLowerCase()) return "Overview";
  return text || "Overview";
}

function sectionKind(title) {
  const normalized = String(title || "").trim().toLowerCase();
  if (normalized === "overview") return "overview";
  if (normalized === "description") return "description";
  if (normalized === "syntax") return "syntax";
  if (normalized === "usage") return "usage";
  if (normalized === "return value") return "return-value";
  if (normalized === "controls") return "controls";
  if (normalized === "arguments" || normalized === "argument") return "arguments";
  if (normalized.startsWith("examples")) return "examples";
  if (normalized === "see also") return "see-also";
  if (normalized === "notes" || normalized === "note") return "notes";
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
}

module.exports = {
  createTopicService,
  mergeAdjacentTextBlocks,
  blocksToSections,
};
