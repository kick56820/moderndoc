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
    if (isSectionHeading(lines)) {
      blocks.push({ type: "heading", text: lines.join(" ") });
    } else if (isCodeBlock(lines)) {
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

function isSectionHeading(lines) {
  if (lines.length !== 1) return false;
  const line = lines[0].trim();
  return /^(Description|Syntax|Usage|Return value|Examples|Applies to|Argument|Arguments|Event ID|Controls|Notes?|Remarks?|See also)$/i.test(line);
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

module.exports = {
  segmentText,
  mergeCodeBlocks,
};
