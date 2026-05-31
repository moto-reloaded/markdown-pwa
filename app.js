const STORAGE_KEY = "md-atelier-draft-v1";
const THEME_KEY = "md-atelier-theme";
const SAMPLE_MARKDOWN = `# Untitled

小さく始められる Markdown エディタです。

- PWA としてインストール
- オフラインで起動
- Markdown ファイルを開いて保存

## Preview

**太字**、*斜体*、\`inline code\`、[リンク](https://example.com) を表示できます。

\`\`\`js
console.log("Hello, Markdown");
\`\`\`
`;

const editor = document.querySelector("#editor");
const preview = document.querySelector("#preview");
const titleInput = document.querySelector("#documentTitle");
const saveState = document.querySelector("#saveState");
const fileStatus = document.querySelector("#fileStatus");
const syncStatus = document.querySelector("#syncStatus");
const documentStats = document.querySelector("#documentStats");
const workspace = document.querySelector("#workspace");
const fileInput = document.querySelector("#fileInput");
const installButton = document.querySelector("#installButton");
const modeButtons = [...document.querySelectorAll(".mode-button")];

let fileHandle = null;
let dirty = false;
let deferredInstallPrompt = null;

init();

function init() {
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  restoreDraft();
  render();
  wireEvents();
  registerServiceWorker();
}

function wireEvents() {
  editor.addEventListener("input", () => {
    setDirty(true);
    persistDraft();
    render();
  });

  titleInput.addEventListener("input", () => {
    setDirty(true);
    persistDraft();
  });

  document.querySelector("#newButton").addEventListener("click", newDocument);
  document.querySelector("#openButton").addEventListener("click", openDocument);
  document.querySelector("#saveButton").addEventListener("click", saveDocument);
  document.querySelector("#downloadButton").addEventListener("click", downloadMarkdown);
  document.querySelector("#htmlButton").addEventListener("click", downloadHtml);
  document.querySelector("#themeButton").addEventListener("click", toggleTheme);
  installButton.addEventListener("click", installApp);
  fileInput.addEventListener("change", handleFileInput);

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installButton.hidden = true;
  });

  document.addEventListener("keydown", handleShortcuts);
  document.addEventListener("dragover", handleDragOver);
  document.addEventListener("dragleave", handleDragLeave);
  document.addEventListener("drop", handleDrop);
}

function restoreDraft() {
  const stored = safeJsonParse(localStorage.getItem(STORAGE_KEY));
  titleInput.value = stored?.title || "untitled.md";
  editor.value = stored?.content || SAMPLE_MARKDOWN;
  setDirty(Boolean(stored?.dirty));
}

function persistDraft() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      title: titleInput.value,
      content: editor.value,
      dirty,
      updatedAt: Date.now(),
    }),
  );
}

function render() {
  preview.innerHTML = markdownToHtml(editor.value);
  documentStats.textContent = getStats(editor.value);
}

async function newDocument() {
  if (dirty && !confirm("未保存の変更があります。新規作成しますか？")) {
    return;
  }

  fileHandle = null;
  titleInput.value = "untitled.md";
  editor.value = "# Untitled\n\n";
  fileStatus.textContent = "ローカル下書き";
  setDirty(false);
  persistDraft();
  render();
  editor.focus();
}

async function openDocument() {
  if ("showOpenFilePicker" in window) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: "Markdown",
            accept: {
              "text/markdown": [".md", ".markdown"],
              "text/plain": [".txt"],
            },
          },
        ],
      });
      const file = await handle.getFile();
      await loadFile(file, handle);
      return;
    } catch (error) {
      if (error.name !== "AbortError") {
        showTransientStatus("開けませんでした");
      }
      return;
    }
  }

  fileInput.click();
}

async function saveDocument() {
  if (fileHandle && "createWritable" in fileHandle) {
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(editor.value);
      await writable.close();
      setDirty(false);
      persistDraft();
      showTransientStatus("保存しました");
      return;
    } catch (error) {
      showTransientStatus("保存できませんでした");
    }
  }

  downloadMarkdown();
  setDirty(false);
  persistDraft();
}

function downloadMarkdown() {
  const fileName = normalizeFileName(titleInput.value || "untitled.md", ".md");
  downloadBlob(new Blob([editor.value], { type: "text/markdown;charset=utf-8" }), fileName);
}

function downloadHtml() {
  const body = markdownToHtml(editor.value);
  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(titleInput.value.replace(/\.(md|markdown|txt)$/i, ""))}</title>
  <style>
    body{max-width:860px;margin:40px auto;padding:0 20px;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.72;color:#1d232b}
    pre{overflow:auto;padding:16px;border-radius:8px;background:#202832;color:#f8fafc}
    code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
    table{width:100%;border-collapse:collapse;display:block;overflow-x:auto}
    th,td{padding:9px 11px;border:1px solid #d8d2c8;text-align:left}
    blockquote{padding-left:16px;border-left:4px solid #0f766e;color:#65717e}
    img{max-width:100%}
  </style>
</head>
<body>
${body}
</body>
</html>`;

  const baseName = (titleInput.value || "untitled").replace(/\.(md|markdown|txt|html)$/i, "");
  const fileName = normalizeFileName(baseName, ".html");
  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), fileName);
}

async function handleFileInput(event) {
  const [file] = event.target.files;
  if (file) {
    await loadFile(file, null);
  }
  event.target.value = "";
}

async function loadFile(file, handle) {
  const content = await file.text();
  fileHandle = handle;
  titleInput.value = file.name || "untitled.md";
  editor.value = content;
  fileStatus.textContent = handle ? "直接保存できます" : "ダウンロード保存";
  setDirty(false);
  persistDraft();
  render();
}

function setDirty(value) {
  dirty = value;
  saveState.textContent = dirty ? "未保存" : "保存済み";
  saveState.classList.toggle("is-dirty", dirty);
}

function setMode(mode) {
  workspace.classList.remove("split-mode", "edit-mode", "preview-mode");
  workspace.classList.add(`${mode}-mode`);
  modeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === mode);
  });
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  applyTheme(current === "dark" ? "light" : "dark");
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}

async function installApp() {
  if (!deferredInstallPrompt) {
    return;
  }

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
}

function handleShortcuts(event) {
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier) {
    return;
  }

  const key = event.key.toLowerCase();
  if (key === "s") {
    event.preventDefault();
    saveDocument();
  }
  if (key === "o") {
    event.preventDefault();
    openDocument();
  }
  if (key === "b") {
    event.preventDefault();
    wrapSelection("**", "**");
  }
  if (key === "i") {
    event.preventDefault();
    wrapSelection("*", "*");
  }
}

function wrapSelection(before, after) {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.slice(start, end);
  editor.setRangeText(`${before}${selected}${after}`, start, end, "select");
  setDirty(true);
  persistDraft();
  render();
  editor.focus();
}

function handleDragOver(event) {
  event.preventDefault();
  document.body.classList.add("drag-hover");
}

function handleDragLeave(event) {
  if (event.target === document || event.clientX <= 0 || event.clientY <= 0) {
    document.body.classList.remove("drag-hover");
  }
}

async function handleDrop(event) {
  event.preventDefault();
  document.body.classList.remove("drag-hover");
  const [file] = event.dataTransfer.files;
  if (file) {
    await loadFile(file, null);
  }
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (/^\s*$/.test(line)) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*(```+|~~~+)\s*([\w-]*)\s*$/);
    if (fence) {
      const marker = fence[1][0];
      const language = fence[2] ? ` data-language="${escapeAttribute(fence[2])}"` : "";
      const code = [];
      index += 1;
      while (index < lines.length && !new RegExp(`^\\s*${marker}{3,}\\s*$`).test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += index < lines.length ? 1 : 0;
      html.push(`<pre${language}><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      html.push("<hr>");
      index += 1;
      continue;
    }

    if (/^\s{0,3}>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s{0,3}>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s{0,3}>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${markdownToHtml(quote.join("\n"))}</blockquote>`);
      continue;
    }

    if (isTableStart(lines, index)) {
      const { tableHtml, nextIndex } = renderTable(lines, index);
      html.push(tableHtml);
      index = nextIndex;
      continue;
    }

    if (/^\s{0,3}([-*+]|\d+[.)])\s+/.test(line)) {
      const { listHtml, nextIndex } = renderList(lines, index);
      html.push(listHtml);
      index = nextIndex;
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
  }

  return html.join("\n");
}

function isBlockStart(lines, index) {
  const line = lines[index];
  return (
    /^\s*(```+|~~~+)/.test(line) ||
    /^(#{1,6})\s+/.test(line) ||
    /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line) ||
    /^\s{0,3}>\s?/.test(line) ||
    /^\s{0,3}([-*+]|\d+[.)])\s+/.test(line) ||
    isTableStart(lines, index)
  );
}

function renderList(lines, startIndex) {
  const ordered = /^\s{0,3}\d+[.)]\s+/.test(lines[startIndex]);
  const tag = ordered ? "ol" : "ul";
  const items = [];
  let index = startIndex;
  const marker = ordered ? /^\s{0,3}\d+[.)]\s+(.+)$/ : /^\s{0,3}[-*+]\s+(.+)$/;

  while (index < lines.length) {
    const match = lines[index].match(marker);
    if (!match) {
      break;
    }

    const task = match[1].match(/^\[( |x|X)]\s+(.+)$/);
    if (task) {
      const checked = task[1].toLowerCase() === "x" ? " checked" : "";
      items.push(`<li class="task-list-item"><input type="checkbox" disabled${checked}>${inlineMarkdown(task[2])}</li>`);
    } else {
      items.push(`<li>${inlineMarkdown(match[1])}</li>`);
    }
    index += 1;
  }

  return { listHtml: `<${tag}>\n${items.join("\n")}\n</${tag}>`, nextIndex: index };
}

function isTableStart(lines, index) {
  return Boolean(
    lines[index]?.includes("|") &&
      lines[index + 1]?.includes("|") &&
      /^\s*\|?[\s:-]+\|[\s|:-]+\|?\s*$/.test(lines[index + 1]),
  );
}

function renderTable(lines, startIndex) {
  const headers = splitTableRow(lines[startIndex]);
  let index = startIndex + 2;
  const rows = [];

  while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
    rows.push(splitTableRow(lines[index]));
    index += 1;
  }

  const head = headers.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`)
    .join("");

  return {
    tableHtml: `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`,
    nextIndex: index,
  };
}

function splitTableRow(row) {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function inlineMarkdown(text) {
  const placeholders = [];
  let value = text.replace(/`([^`]+)`/g, (_match, code) => {
    const id = placeholders.length;
    placeholders.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${id}\u0000`;
  });

  value = value.replace(/!\[([^\]]*)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, alt, url) => {
    const safeUrl = normalizeUrl(url);
    if (!safeUrl) {
      return match;
    }
    const id = placeholders.length;
    placeholders.push(`<img src="${escapeAttribute(safeUrl)}" alt="${escapeAttribute(alt)}">`);
    return `\u0000${id}\u0000`;
  });
  value = value.replace(/\[([^\]]+)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (match, label, url) => {
    const safeUrl = normalizeUrl(url);
    if (!safeUrl) {
      return match;
    }
    const id = placeholders.length;
    placeholders.push(
      `<a href="${escapeAttribute(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`,
    );
    return `\u0000${id}\u0000`;
  });

  value = escapeHtml(value);
  value = value.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  value = value.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  value = value.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  value = value.replace(/_([^_]+)_/g, "<em>$1</em>");
  value = value.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  placeholders.forEach((replacement, id) => {
    value = value.replaceAll(`\u0000${id}\u0000`, replacement);
  });

  return value;
}

function normalizeUrl(url) {
  const trimmed = url.trim();
  if (/^(https?:|mailto:|tel:|\.{0,2}\/|#)/i.test(trimmed)) {
    return trimmed;
  }
  return "";
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function normalizeFileName(fileName, extension) {
  const trimmed = fileName.trim().replace(/[\\/:*?"<>|]+/g, "-") || `untitled${extension}`;
  return /\.[a-z0-9]+$/i.test(trimmed) ? trimmed : `${trimmed}${extension}`;
}

function getStats(text) {
  const chars = [...text].length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return `${words} words / ${chars} chars`;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function showTransientStatus(message) {
  const previous = fileStatus.textContent;
  fileStatus.textContent = message;
  setTimeout(() => {
    fileStatus.textContent = previous;
  }, 1800);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    syncStatus.textContent = "Browser only";
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js");
    syncStatus.textContent = "Offline ready";
  } catch {
    syncStatus.textContent = "Offline unavailable";
  }
}
