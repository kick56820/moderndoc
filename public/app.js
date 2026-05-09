const indexInput = document.querySelector("#indexInput");
const contentsList = document.querySelector("#contentsList");
const contentsStatus = document.querySelector("#contentsStatus");
const bookContentsList = document.querySelector("#bookContentsList");
const bookStatus = document.querySelector("#bookStatus");
const recentList = document.querySelector("#recentList");
const favoriteList = document.querySelector("#favoriteList");
const favoriteToggle = document.querySelector("#favoriteToggle");
const themeToggle = document.querySelector("#themeToggle");
const indexList = document.querySelector("#indexList");
const openIndex = document.querySelector("#openIndex");
const indexStatus = document.querySelector("#indexStatus");
const globalSearch = document.querySelector("#globalSearch");
const searchSource = document.querySelector("#searchSource");
const searchInsight = document.querySelector("#searchInsight");
const results = document.querySelector("#results");
const topic = document.querySelector("#topic");
const insightPane = document.querySelector("#insightPane");
const bookFrame = document.querySelector("#bookFrame");
const POWER_SCRIPT_KEYWORDS = new Set([
  "and", "any", "blob", "boolean", "catch", "char", "choose", "close", "constant", "continue",
  "create", "date", "datetime", "decimal", "dec", "destroy", "do", "double", "dynamic", "else",
  "elseif", "end", "event", "false", "finally", "for", "forward", "from", "function", "global",
  "halt", "if", "in", "integer", "int", "is", "long", "longlong", "loop", "next", "not", "null",
  "of", "open", "or", "private", "protected", "public", "real", "ref", "return", "shared",
  "static", "step", "string", "then", "this", "throw", "throws", "time", "to", "true", "try",
  "type", "uint", "ulong", "until", "unsignedinteger", "unsignedlong", "using", "while", "with",
]);

let indexTimer;
let searchTimer;
let selectedIndexTopic = "";
let selectedIndexLabel = "";
let currentMode = "contents";
let currentTopicLinks = {};
let ignoreNextHashChange = false;
let currentPage = null;
let currentHighlightQuery = "";
let insightCollapsed = false;
const contentTopicByTitle = new Map();
const STORAGE_KEYS = {
  recent: "pbdocs.recent",
  favorites: "pbdocs.favorites",
  theme: "pbdocs.theme",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  })[ch]);
}

function loadStoredList(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredList(key, items) {
  localStorage.setItem(key, JSON.stringify(items));
}

function pageKey(page) {
  return page ? `${page.type}:${page.id}` : "";
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

async function loadIndex() {
  const query = indexInput.value.trim();
  indexStatus.textContent = "Searching...";
  try {
    const entries = await fetchJson(`/api/index?q=${encodeURIComponent(query)}&limit=500`);
    indexList.innerHTML = entries
      .map((entry, index) => {
        const display = entry.display || entry.label;
        const child = /^\s+/.test(display);
        return `<button class="index-item ${child ? "child" : ""} ${index === 0 ? "selected" : ""}" data-topic="${escapeHtml(entry.topicId)}" data-label="${escapeHtml(display.trim())}" role="option" aria-selected="${index === 0 ? "true" : "false"}">${escapeHtml(display.trim())}</button>`;
      })
      .join("");
    const firstItem = indexList.querySelector(".index-item");
    selectIndexItem(firstItem, false);
    indexStatus.textContent = `${entries.length} index item(s)`;
  } catch (error) {
    indexStatus.textContent = `Index failed: ${error.message}`;
  }
}

async function loadContents() {
  contentsStatus.textContent = "Loading contents...";
  try {
    const entries = await fetchJson("/api/contents");
    contentTopicByTitle.clear();
    for (const entry of entries) {
      if (entry.topicId && !contentTopicByTitle.has(normalizeTitle(entry.title))) {
        contentTopicByTitle.set(normalizeTitle(entry.title), entry.topicId);
      }
    }
    contentsList.innerHTML = renderContentsTree(buildContentsTree(entries), true);
    contentsStatus.textContent = `${entries.length} contents item(s), grouped by chapter`;
  } catch (error) {
    contentsStatus.textContent = `Contents failed: ${error.message}`;
  }
}

async function loadBookContents() {
  bookStatus.textContent = "Loading HTML Books...";
  try {
    const entries = await fetchJson("/books/pbman/book-contents.json");
    bookContentsList.innerHTML = renderBookTree(buildContentsTree(entries), true);
    bookStatus.textContent = `${entries.length} HTML Books item(s)`;
  } catch (error) {
    bookStatus.textContent = `HTML Books failed: ${error.message}`;
  }
}

function buildContentsTree(entries) {
  const root = { level: 0, children: [] };
  const stack = [root];
  for (const entry of entries) {
    const level = Math.max(1, Math.min(Number(entry.level || 1), 8));
    const node = { ...entry, level, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root.children;
}

function renderContentsTree(nodes, root = false) {
  return `<ul class="contents-tree ${root ? "root" : ""}">
    ${nodes.map(renderContentsNode).join("")}
  </ul>`;
}

function renderContentsNode(node) {
  const hasChildren = node.children.length > 0;
  const title = escapeHtml(node.title);
  const topicAttrs = node.topicId ? ` data-topic="${escapeHtml(node.topicId)}" data-title="${title}"` : "";
  const label = `<span class="contents-icon ${hasChildren ? "book" : "page"}" aria-hidden="true"></span><span>${title}</span>`;

  if (hasChildren) {
    return `
      <li>
        <details class="contents-node level-${node.level}">
          <summary${topicAttrs}>${label}</summary>
          ${renderContentsTree(node.children)}
        </details>
      </li>
    `;
  }

  return `
    <li>
      <button class="contents-leaf level-${node.level}"${topicAttrs} ${node.topicId ? "" : "disabled"}>
        ${label}
      </button>
    </li>
  `;
}

function renderBookTree(nodes, root = false) {
  return `<ul class="contents-tree ${root ? "root" : ""}">
    ${nodes.map(renderBookNode).join("")}
  </ul>`;
}

function renderBookNode(node) {
  const hasChildren = node.children.length > 0;
  const title = escapeHtml(node.title);
  const local = node.local || "";
  const bookAttrs = local ? ` data-book="${escapeHtml(local)}" data-title="${title}"` : "";
  const label = `<span class="contents-icon ${hasChildren ? "book" : "page"}" aria-hidden="true"></span><span>${title}</span>`;

  if (hasChildren) {
    return `
      <li>
        <details class="contents-node level-${node.level}">
          <summary${bookAttrs}>${label}</summary>
          ${renderBookTree(node.children)}
        </details>
      </li>
    `;
  }

  return `
    <li>
      <button class="contents-leaf level-${node.level}"${bookAttrs} ${local ? "" : "disabled"}>
        ${label}
      </button>
    </li>
  `;
}

function selectIndexItem(item, shouldOpen) {
  document.querySelectorAll(".index-item.selected").forEach((node) => {
    node.classList.remove("selected");
    node.setAttribute("aria-selected", "false");
  });

  if (!item) {
    selectedIndexTopic = "";
    selectedIndexLabel = "";
    return;
  }

  selectedIndexTopic = item.dataset.topic || "";
  selectedIndexLabel = item.dataset.label || item.textContent.trim();
  item.classList.add("selected");
  item.setAttribute("aria-selected", "true");

  if (shouldOpen) openTopic(selectedIndexTopic);
}

async function loadSearch() {
  const query = globalSearch.value.trim();
  const source = searchSource.value;
  const [items, insight] = await Promise.all([
    fetchJson(`/api/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent(source)}&limit=120`),
    source === "html-books" || !query
      ? Promise.resolve({})
      : fetchJson(`/api/search-insight?q=${encodeURIComponent(query)}&source=${encodeURIComponent(source)}`),
  ]);
  searchInsight.innerHTML = renderSearchInsight(insight);
  insightPane.classList.toggle("hidden", !searchInsight.innerHTML.trim());
  results.innerHTML = renderSearchResults(items);
}

function renderSearchResults(items) {
  if (!items.length) return `<div class="alert alert-secondary py-2 px-3 small mb-0">No search results</div>`;
  return groupSearchResults(items).map((group) => `
    <section class="result-group card border-0 bg-transparent">
      <h4 class="small fw-semibold text-body-secondary mb-1">${escapeHtml(group.label)} <span class="badge text-bg-secondary">${group.items.length}</span></h4>
      ${group.items.map(renderSearchResult).join("")}
    </section>
  `).join("");
}

function groupSearchResults(items) {
  const order = ["Function", "Event", "Statement", "Syntax", "Examples", "DataWindow", "Reference", "HTML Books"];
  const groups = new Map();
  for (const item of items) {
    const label = item.category || (item.source === "html-books" ? "HTML Books" : "Reference");
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
  }
  return Array.from(groups.entries())
    .sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    })
    .map(([label, groupItems]) => ({ label, items: groupItems }));
}

function renderSearchResult(item) {
  return `
    <button class="result card card-body text-start" ${renderResultTargetAttrs(item)}>
      <strong>${escapeHtml(item.title)}</strong>
      <span class="result-source badge rounded-pill text-bg-info-subtle text-info-emphasis border">${escapeHtml(item.category || (item.source === "html-books" ? "HTML Books" : "Reference"))}</span>
      <p>${escapeHtml(item.excerpt)}</p>
    </button>
  `;
}

function renderSearchInsight(insight) {
  if (!insight || !insight.primary || !insight.sections) return "";
  const sections = insight.sections;
  const hasDetails = sections.overview ||
    sections.syntax?.length ||
    sections.commonUses?.length ||
    sections.examples?.length ||
    sections.notes?.length ||
    sections.eventFlow;
  if (!hasDetails) return "";

  return `
    <section class="insight-card card ${insightCollapsed ? "collapsed" : ""}">
      <div class="card-body">
        <div class="insight-header">
          <div>
            <div class="insight-eyebrow">Search insight</div>
            <button class="insight-title" type="button" data-topic="${escapeHtml(insight.primary.id)}" data-title="${escapeHtml(insight.primary.title)}">
              ${escapeHtml(insight.primary.title)}
            </button>
          </div>
          <button class="insight-collapse" type="button" aria-expanded="${insightCollapsed ? "false" : "true"}">
            ${insightCollapsed ? "open" : "close"}
          </button>
        </div>
        <div class="insight-content">
          ${sections.overview ? `<p class="insight-overview">${escapeHtml(sections.overview)}</p>` : ""}
          ${renderInsightSyntax(sections.syntax || [])}
          ${renderInsightUses(sections.commonUses || [])}
          ${renderInsightExamples(sections.examples || [])}
          ${renderInsightNotes(sections.notes || [])}
          ${renderInsightEventFlow(sections.eventFlow)}
        </div>
      </div>
    </section>
  `;
}

function renderInsightSyntax(items) {
  if (!items.length) return "";
  return `
    <div class="insight-section">
      <h4>Syntax</h4>
      <div class="syntax-chips">
        ${items.map((item) => `
          <button type="button" class="syntax-chip" data-topic="${escapeHtml(item.topicId)}" data-title="${escapeHtml(item.title)}">
            <strong>${escapeHtml(item.label)}</strong>
            ${item.summary ? `<span>${escapeHtml(item.summary)}</span>` : ""}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderInsightUses(items) {
  if (!items.length) return "";
  return `
    <div class="insight-section">
      <h4>Common uses</h4>
      <div class="use-grid">
        ${items.map((item) => `
          <div class="use-row small">
            <span>${escapeHtml(item.to)}</span>
            <strong>${escapeHtml(item.use)}</strong>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderInsightExamples(items) {
  if (!items.length) return "";
  return `
    <div class="insight-section">
      <h4>Examples</h4>
      ${items.map((item) => `
        <article class="example-preview">
          <button type="button" data-topic="${escapeHtml(item.id)}" data-title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</button>
          ${item.intro ? `<p>${escapeHtml(item.intro)}</p>` : ""}
          ${item.code ? `<pre><code>${highlightPowerScript(item.code)}</code></pre>` : ""}
        </article>
      `).join("")}
    </div>
  `;
}

function renderInsightNotes(items) {
  if (!items.length) return "";
  return `
    <div class="insight-section">
      <h4>Notes</h4>
      <ul class="note-list">
        ${items.map((item) => `<li><strong>${escapeHtml(item.title)}:</strong> ${escapeHtml(item.text)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderInsightEventFlow(item) {
  if (!item) return "";
  return `
    <div class="insight-section event-flow">
      <h4>Event flow</h4>
      <p>Function usage is closely related to the event topic below when a window or object opens.</p>
      <button type="button" data-topic="${escapeHtml(item.id)}" data-title="${escapeHtml(item.title)}">
        ${escapeHtml(item.title)}
      </button>
      ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}
    </div>
  `;
}

function renderResultTargetAttrs(item) {
  if (item.source === "html-books") {
    return `data-book="${escapeHtml(item.local || item.id)}" data-title="${escapeHtml(item.title)}"`;
  }
  return `data-topic="${escapeHtml(item.id)}" data-title="${escapeHtml(item.title)}"`;
}

async function openTopic(id, options = {}) {
  const updateHash = options.updateHash !== false;
  if (!id) {
    setActiveStatus("No topic selected");
    return;
  }
  try {
    setActiveStatus("Opening topic...");
    showReaderPane("topic");
    const data = await fetchJson(`/api/topic/${encodeURIComponent(id)}`);
    currentTopicLinks = data.links || {};
    currentPage = { type: "ref", id, title: data.title, hash: `#/ref/${encodeURIComponent(id)}` };
    topic.innerHTML = `
      <h2 class="topic-title">${escapeHtml(data.title)}</h2>
      <div class="topic-meta">
        <code>${escapeHtml(data.context)}</code>
        ${data.keywords?.length ? ` - ${escapeHtml(data.keywords.slice(0, 10).join("; "))}` : ""}
      </div>
      ${renderTopicNav(data.nav, "top")}
      ${renderOnThisPage(data.sections || data.blocks)}
      ${renderTopicBody(data)}
      ${renderTopicNav(data.nav, "bottom")}
    `;
    highlightTopicQuery(options.highlightQuery ?? currentHighlightQuery);
    setActiveStatus(selectedIndexLabel ? `Opened: ${selectedIndexLabel}` : "Topic opened");
    recordRecent(currentPage);
    updateFavoriteButton();
    if (updateHash) setRouteHash(`#/ref/${encodeURIComponent(id)}`);
    topic.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setActiveStatus(`Open failed: ${error.message}`);
  }
}

function highlightTopicQuery(query) {
  const words = String(query || "")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .slice(0, 4);
  if (!words.length) return;

  const pattern = new RegExp(`(${words.map(escapeRegExp).join("|")})`, "gi");
  const walker = document.createTreeWalker(topic, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !pattern.test(node.nodeValue || "")) return NodeFilter.FILTER_REJECT;
      pattern.lastIndex = 0;
      if (parent.closest("pre, code, button, nav, .topic-meta, .on-this-page")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const fragment = document.createDocumentFragment();
    const parts = String(node.nodeValue || "").split(pattern);
    for (const part of parts) {
      if (!part) continue;
      if (pattern.test(part)) {
        const mark = document.createElement("mark");
        mark.className = "search-mark";
        mark.textContent = part;
        fragment.appendChild(mark);
      } else {
        fragment.appendChild(document.createTextNode(part));
      }
      pattern.lastIndex = 0;
    }
    node.parentNode.replaceChild(fragment, node);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderTopicNav(nav, position) {
  if (!nav || (!nav.prev && !nav.next)) return "";
  return `
    <nav class="topic-nav ${position === "bottom" ? "bottom" : ""}" aria-label="Topic navigation">
      ${nav.prev ? `
        <button class="topic-jump topic-nav-link prev btn btn-outline-secondary" data-topic="${escapeHtml(nav.prev.id)}" data-title="${escapeHtml(nav.prev.title)}">
          <span>Previous</span>
          ${escapeHtml(nav.prev.title)}
        </button>
      ` : "<span></span>"}
      ${nav.next ? `
        <button class="topic-jump topic-nav-link next btn btn-outline-secondary" data-topic="${escapeHtml(nav.next.id)}" data-title="${escapeHtml(nav.next.title)}">
          <span>Next</span>
          ${escapeHtml(nav.next.title)}
        </button>
      ` : "<span></span>"}
    </nav>
  `;
}

function openBookPage(local, title, options = {}) {
  const updateHash = options.updateHash !== false;
  if (!local) return;
  showReaderPane("book");
  bookFrame.src = `/books/pbman/${encodeURI(local)}`;
  currentPage = { type: "book", id: local, title: title || local, hash: `#/book/${encodeURIComponent(local)}` };
  bookStatus.textContent = title ? `Opened: ${title}` : "HTML Books page opened";
  recordRecent(currentPage);
  updateFavoriteButton();
  if (updateHash) setRouteHash(`#/book/${encodeURIComponent(local)}`);
}

function applyBookFrameTheme() {
  const doc = bookFrame.contentDocument;
  if (!doc) return;

  let style = doc.querySelector("#pbdocs-book-theme");
  if (!style) {
    style = doc.createElement("style");
    style.id = "pbdocs-book-theme";
    doc.head.appendChild(style);
  }

  // Legacy HTML Books were authored for a white page. Keep them readable inside dark UI.
  style.textContent = `
    html, body {
      background: #ffffff !important;
      color: #111827 !important;
    }
    a { color: #0645ad !important; }
    p, li, td, th, div, span {
      color: inherit;
    }
  `;
  bookFrame.style.backgroundColor = "#ffffff";
}

function showReaderPane(kind) {
  topic.classList.toggle("hidden", kind !== "topic");
  if (kind === "book") insightPane.classList.add("hidden");
  bookFrame.classList.toggle("hidden", kind !== "book");
}

function recordRecent(page) {
  if (!page) return;
  const key = pageKey(page);
  const recent = loadStoredList(STORAGE_KEYS.recent).filter((item) => pageKey(item) !== key);
  recent.unshift(page);
  saveStoredList(STORAGE_KEYS.recent, recent.slice(0, 12));
  renderQuickLists();
}

function toggleFavorite() {
  if (!currentPage) return;
  const key = pageKey(currentPage);
  const favorites = loadStoredList(STORAGE_KEYS.favorites);
  const exists = favorites.some((item) => pageKey(item) === key);
  const next = exists ? favorites.filter((item) => pageKey(item) !== key) : [currentPage, ...favorites];
  saveStoredList(STORAGE_KEYS.favorites, next.slice(0, 50));
  renderQuickLists();
  updateFavoriteButton();
}

function updateFavoriteButton() {
  favoriteToggle.disabled = !currentPage;
  if (!currentPage) {
    favoriteToggle.textContent = "☆ Favorite";
    return;
  }
  const key = pageKey(currentPage);
  const active = loadStoredList(STORAGE_KEYS.favorites).some((item) => pageKey(item) === key);
  favoriteToggle.textContent = active ? "★ Favorited" : "☆ Favorite";
  favoriteToggle.classList.toggle("active", active);
}

function renderQuickLists() {
  renderQuickList(recentList, loadStoredList(STORAGE_KEYS.recent), "No recent pages");
  renderQuickList(favoriteList, loadStoredList(STORAGE_KEYS.favorites), "No favorites yet");
}

function renderQuickList(container, items, emptyText) {
  if (!items.length) {
    container.classList.add("empty");
    container.textContent = emptyText;
    return;
  }
  container.classList.remove("empty");
  container.innerHTML = items.map((item) => `
    <button class="quick-item btn btn-sm btn-outline-secondary" data-quick-type="${escapeHtml(item.type)}" data-quick-id="${escapeHtml(item.id)}" title="${escapeHtml(item.title)}">
      <span class="badge text-bg-primary">${item.type === "book" ? "HTML" : "REF"}</span>
      ${escapeHtml(item.title)}
    </button>
  `).join("");
}

function openStoredPage(type, id, title = "") {
  if (type === "book") openBookPage(id, title);
  else openTopic(id);
}

function setActiveStatus(message) {
  if (currentMode === "contents") contentsStatus.textContent = message;
  else indexStatus.textContent = message;
}

function renderOnThisPage(items) {
  const headings = Array.isArray(items) && items[0]?.blocks
    ? items.filter((section) => section.title && section.title !== "Overview")
    : items
      .map((block, index) => ({ ...block, id: `section-${index}` }))
      .filter((block) => block.type === "heading")
      .slice(1);

  if (!headings.length) return "";
  return `
    <nav class="on-this-page" aria-label="On this page">
      <strong>On this page</strong>
      ${headings.map((heading) => `<a href="#${escapeHtml(heading.id)}" data-section="${escapeHtml(heading.id)}">${escapeHtml(heading.title || heading.text)}</a>`).join("")}
    </nav>
  `;
}

function renderTopicBody(data) {
  if (Array.isArray(data.sections) && data.sections.length) {
    return data.sections.map(renderSection).join("");
  }
  return (data.blocks || []).map((block, index) => renderBlock(block, index)).join("");
}

function renderSection(section, sectionIndex) {
  const title = formatHeadingLabel(section.title || "Overview");
  const kind = section.kind || "section";
  const body = (section.blocks || [])
    .map((block, blockIndex) => renderBlock(block, `${sectionIndex}-${blockIndex}`))
    .join("");

  return `
    <section id="${escapeHtml(section.id)}" class="topic-section topic-section-${escapeHtml(kind)}">
      <div class="topic-section-header">
        <span class="topic-section-label">${escapeHtml(sectionLabel(kind))}</span>
        <h3>${escapeHtml(title)}</h3>
      </div>
      <div class="topic-section-body">
        ${body}
      </div>
    </section>
  `;
}

function sectionLabel(kind) {
  const labels = {
    overview: "Overview",
    summary: "Overview",
    description: "Description",
    syntax: "Syntax",
    usage: "Usage",
    "return-value": "Return",
    examples: "Examples",
    controls: "Controls",
    arguments: "Arguments",
    notes: "Notes",
    "see-also": "See also",
  };
  return labels[kind] || "Section";
}

function renderBlock(block, index = 0) {
  if (block.type === "heading") {
    const headingText = formatHeadingLabel(block.text);
    const extraClass = /^Examples(?:\b|$)/i.test(headingText) ? " topic-heading-examples" : "";
    return `<h3 id="section-${index}" class="${extraClass.trim()}">${escapeHtml(headingText)}</h3>`;
  }
  if (block.type === "code") {
    const codeId = `code-${index}`;
    return `
      <div class="code-wrap card">
        <div class="code-label">
          <span>PowerScript</span>
          <button class="copy-code btn btn-sm btn-outline-secondary" type="button" data-copy-target="${codeId}">Copy</button>
        </div>
        <pre><code id="${codeId}">${highlightPowerScript(block.text)}</code></pre>
      </div>
    `;
  }
  if (block.type === "image") {
    return `<figure><img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}"><figcaption>${escapeHtml(block.alt)}</figcaption></figure>`;
  }
  if (block.type === "list") {
    return `<ul>${(block.items || []).map((item) => `<li>${renderInlineText(item)}</li>`).join("")}</ul>`;
  }
  if (block.type === "table") {
    const rows = block.rows || [];
    return `
      <div class="table-wrap">
        <table class="table table-sm mb-0">
          <tbody>
            ${rows.map((row, rowIndex) => `
              <tr>
                ${row.map((cell) => {
                  const tag = rowIndex === 0 ? "th" : "td";
                  return `<${tag}>${renderTableCell(cell, tag === "th")}</${tag}>`;
                }).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }
  return `<p>${renderInlineText(block.text)}</p>`;
}

function formatHeadingLabel(text) {
  const value = String(text || "").trim();
  const exampleMatch = value.match(/^Examples for\s+(.+)$/i);
  if (exampleMatch) return `Examples: ${exampleMatch[1]}`;
  return value;
}

function renderInlineText(text) {
  const escaped = escapeHtml(text).replace(/\n/g, "<br>");
  return escaped.replace(/^(.{3,48}?) {2,}(?=\S)/, "<strong>$1</strong>&nbsp;&nbsp;");
}

function renderTableCell(text, isHeader) {
  const normalized = normalizeTitle(text);
  const topicId = !isHeader ? currentTopicLinks[normalized] || contentTopicByTitle.get(normalized) : "";
  if (!topicId) return escapeHtml(text).replace(/\n/g, "<br>");
  return `<button class="topic-jump" data-topic="${escapeHtml(topicId)}" data-title="${escapeHtml(text)}">${escapeHtml(text)}</button>`;
}

function highlightPowerScript(text) {
  const source = String(text ?? "");
  const tokenPattern = /("(?:~.|[^"])*"|'(?:~.|[^'])*'|\/\/.*|\/\*[\s\S]*?\*\/|\b[A-Za-z_]\w*\b|\b\d+(?:\.\d+)?(?:E[+-]?\d+)?\b)/gi;
  let html = "";
  let lastIndex = 0;

  source.replace(tokenPattern, (match, _token, offset) => {
    html += escapeHtml(source.slice(lastIndex, offset));
    html += renderCodeToken(match);
    lastIndex = offset + match.length;
    return match;
  });

  return html + escapeHtml(source.slice(lastIndex));
}

function renderCodeToken(token) {
  const escaped = escapeHtml(token);
  if (/^(\/\/|\/\*)/.test(token)) return `<span class="tok-comment">${escaped}</span>`;
  if (/^["']/.test(token)) return `<span class="tok-string">${escaped}</span>`;
  if (/^\d/.test(token)) return `<span class="tok-number">${escaped}</span>`;
  if (POWER_SCRIPT_KEYWORDS.has(token.toLowerCase())) return `<span class="tok-keyword">${escaped}</span>`;
  return escaped;
}

function normalizeTitle(text) {
  return String(text || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function setRouteHash(hash) {
  if (window.location.hash === hash) return;
  ignoreNextHashChange = true;
  window.location.hash = hash;
}

function applyRouteFromHash() {
  const hash = window.location.hash || "";
  if (hash.startsWith("#/ref/")) {
    const id = decodeURIComponent(hash.slice("#/ref/".length));
    switchMode("contents");
    openTopic(id, { updateHash: false });
  } else if (hash.startsWith("#/book/")) {
    const local = decodeURIComponent(hash.slice("#/book/".length));
    switchMode("books");
    openBookPage(local, "", { updateHash: false });
  }
}

function applyTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  document.documentElement.setAttribute("data-bs-theme", next);
  document.body.dataset.theme = next;
  document.body.setAttribute("data-bs-theme", next);
  localStorage.setItem(STORAGE_KEYS.theme, next);
  themeToggle.textContent = next === "dark" ? "Light mode" : "Dark mode";
  applyBookFrameTheme();
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}

function switchMode(mode) {
  currentMode = mode;
  document.body.classList.toggle("books-mode", mode === "books");
  if (mode !== "search") insightPane.classList.add("hidden");
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.mode === mode);
  });
  document.querySelector("#contentsMode").classList.toggle("hidden", mode !== "contents");
  document.querySelector("#indexMode").classList.toggle("hidden", mode !== "index");
  document.querySelector("#searchMode").classList.toggle("hidden", mode !== "search");
  document.querySelector("#booksMode").classList.toggle("hidden", mode !== "books");
  if (mode === "index") indexInput.focus();
  if (mode === "search") globalSearch.focus();
  if (mode === "books") showReaderPane("book");
  else showReaderPane("topic");
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchMode(tab.dataset.mode));
});

themeToggle.addEventListener("click", toggleTheme);
favoriteToggle.addEventListener("click", toggleFavorite);
bookFrame.addEventListener("load", applyBookFrameTheme);

document.querySelector(".quick-panel").addEventListener("click", (event) => {
  const item = event.target.closest(".quick-item");
  if (!item) return;
  openStoredPage(item.dataset.quickType, item.dataset.quickId, item.textContent.trim());
});

window.addEventListener("hashchange", () => {
  if (ignoreNextHashChange) {
    ignoreNextHashChange = false;
    return;
  }
  applyRouteFromHash();
});

indexInput.addEventListener("input", () => {
  clearTimeout(indexTimer);
  indexTimer = setTimeout(loadIndex, 80);
});

indexInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") openTopic(selectedIndexTopic);
});

indexList.addEventListener("click", (event) => {
  const item = event.target.closest(".index-item");
  if (!item) return;
  selectIndexItem(item, true);
});

indexList.addEventListener("dblclick", (event) => {
  const item = event.target.closest(".index-item");
  if (item) openTopic(item.dataset.topic);
});

indexList.addEventListener("keydown", (event) => {
  const items = Array.from(indexList.querySelectorAll(".index-item"));
  const current = Math.max(0, items.findIndex((item) => item.classList.contains("selected")));
  if (event.key === "Enter") {
    openTopic(selectedIndexTopic);
    return;
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const next = event.key === "ArrowDown" ? Math.min(items.length - 1, current + 1) : Math.max(0, current - 1);
  selectIndexItem(items[next], false);
  items[next]?.scrollIntoView({ block: "nearest" });
});

contentsList.addEventListener("click", (event) => {
  const item = event.target.closest("[data-topic]");
  if (!item || !item.dataset.topic) return;
  selectedIndexLabel = item.dataset.title || item.textContent.trim();
  openTopic(item.dataset.topic);
});

bookContentsList.addEventListener("click", (event) => {
  const item = event.target.closest("[data-book]");
  if (!item || !item.dataset.book) return;
  openBookPage(item.dataset.book, item.dataset.title || item.textContent.trim());
});

topic.addEventListener("click", (event) => {
  const copy = event.target.closest(".copy-code");
  if (copy) {
    const code = document.getElementById(copy.dataset.copyTarget);
    if (!code) return;
    navigator.clipboard?.writeText(code.textContent || "");
    copy.textContent = "Copied";
    setTimeout(() => {
      copy.textContent = "Copy";
    }, 1200);
    return;
  }

  const section = event.target.closest("[data-section]");
  if (section) {
    event.preventDefault();
    document.querySelector(`#${CSS.escape(section.dataset.section)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const jump = event.target.closest(".topic-jump");
  if (!jump) return;
  selectedIndexLabel = jump.dataset.title || jump.textContent.trim();
  openTopic(jump.dataset.topic);
});

openIndex.addEventListener("click", () => openTopic(selectedIndexTopic));

globalSearch.addEventListener("input", () => {
  switchMode("search");
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadSearch, 160);
});

searchSource.addEventListener("change", () => {
  switchMode("search");
  loadSearch();
});

function openSearchTargetFromClick(event) {
  const button = event.target.closest("[data-topic], [data-book]");
  if (!button) return;
  if (button.dataset.book) {
    openBookPage(button.dataset.book, button.dataset.title || button.textContent.trim());
  } else {
    selectedIndexLabel = button.dataset.title || button.textContent.trim();
    currentHighlightQuery = globalSearch.value.trim();
    openTopic(button.dataset.topic, { highlightQuery: currentHighlightQuery });
  }
}

searchInsight.addEventListener("click", (event) => {
  const collapse = event.target.closest(".insight-collapse");
  if (!collapse) return;
  event.preventDefault();
  event.stopPropagation();
  insightCollapsed = !insightCollapsed;
  const card = searchInsight.querySelector(".insight-card");
  if (!card) return;
  card.classList.toggle("collapsed", insightCollapsed);
  collapse.textContent = insightCollapsed ? "open" : "close";
  collapse.setAttribute("aria-expanded", insightCollapsed ? "false" : "true");
});
searchInsight.addEventListener("click", openSearchTargetFromClick);
results.addEventListener("click", openSearchTargetFromClick);

async function init() {
  applyTheme(localStorage.getItem(STORAGE_KEYS.theme) || "light");
  renderQuickLists();
  updateFavoriteButton();
  await Promise.all([loadContents(), loadBookContents()]);
  loadIndex();
  loadSearch();
  applyRouteFromHash();
}

init();
