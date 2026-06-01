const STORAGE_KEY = "md-atelier-draft-v1";
const THEME_KEY = "md-atelier-theme";
const README_URL = "./README.md";
const APP_VERSION = "1.0.6";
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
const translationPanel = document.querySelector("#translationPanel");
const translationStatus = document.querySelector("#translationStatus");
const sourceLanguage = document.querySelector("#sourceLanguage");
const targetLanguage = document.querySelector("#targetLanguage");
const translateReplaceButton = document.querySelector("#translateReplaceButton");
const translateDownloadButton = document.querySelector("#translateDownloadButton");
const translateToggleButton = document.querySelector("#translateToggleButton");
const speechToggleButton = document.querySelector("#speechToggleButton");
const speechPanel = document.querySelector("#speechPanel");
const nativeSpeechHelpButton = document.querySelector("#nativeSpeechHelpButton");
const speechStatus = document.querySelector("#speechStatus");
const speechHint = document.querySelector("#speechHint");
const markdownProfile = document.querySelector("#markdownProfile");
const versionLabel = document.querySelector("#versionLabel");

let fileHandle = null;
let dirty = false;
let deferredInstallPrompt = null;
let launchFileOpened = false;

init();

async function init() {
  versionLabel.textContent = `v${APP_VERSION}`;
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  setupLaunchQueue();
  await waitForLaunchFile();
  if (!launchFileOpened) {
    await restoreDraft();
  }
  render();
  wireEvents();
  updateMarkdownProfile();
  initializeResponsiveMode();
  updateBrowserCapabilities();
  registerServiceWorker();
}

function waitForLaunchFile() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function setupLaunchQueue() {
  if (!("launchQueue" in window)) {
    return;
  }

  window.launchQueue.setConsumer(async (launchParams) => {
    const [handle] = launchParams.files || [];
    if (!handle) {
      return;
    }

    launchFileOpened = true;
    await loadFileHandle(handle);
  });
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
  document.querySelector("#helpButton").addEventListener("click", openReadmeWindow);
  document.querySelector("#themeButton").addEventListener("click", toggleTheme);
  translateToggleButton.addEventListener("click", toggleTranslationPanel);
  translateReplaceButton.addEventListener("click", () => translateDocument("replace"));
  translateDownloadButton.addEventListener("click", () => translateDocument("download"));
  speechToggleButton.addEventListener("click", toggleSpeechPanel);
  nativeSpeechHelpButton.addEventListener("click", focusEditorForNativeSpeech);
  installButton.addEventListener("click", installApp);
  fileInput.addEventListener("change", handleFileInput);
  sourceLanguage.addEventListener("change", updateTranslationAvailability);
  targetLanguage.addEventListener("change", updateTranslationAvailability);
  markdownProfile.addEventListener("change", updateMarkdownProfile);
  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => applyMarkdownCommand(button.dataset.command));
  });
  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      workspace.dataset.userModeSelected = "true";
      setMode(button.dataset.mode);
    });
  });

  window.matchMedia("(max-width: 760px)").addEventListener("change", initializeResponsiveMode);

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

async function restoreDraft() {
  if (launchFileOpened) {
    return;
  }

  const stored = safeJsonParse(localStorage.getItem(STORAGE_KEY));
  if (stored?.content) {
    titleInput.value = stored.title || "untitled.md";
    editor.value = stored.content;
    setDirty(Boolean(stored.dirty));
    return;
  }

  try {
    const response = await fetch(README_URL, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error("README unavailable");
    }
    titleInput.value = "README.md";
    editor.value = await response.text();
    fileStatus.textContent = "README を表示中";
    setDirty(false);
  } catch {
    titleInput.value = "untitled.md";
    editor.value = SAMPLE_MARKDOWN;
    setDirty(false);
  }
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
  if (canOpenDirectly()) {
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
  if (fileHandle && canWriteHandle(fileHandle)) {
    try {
      await writeToFileHandle(fileHandle);
      setDirty(false);
      persistDraft();
      showTransientStatus("保存しました");
      return;
    } catch (error) {
      showTransientStatus("保存できませんでした");
    }
  }

  if ("showSaveFilePicker" in window) {
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: normalizeFileName(titleInput.value || "untitled.md", ".md"),
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
      await writeToFileHandle(fileHandle);
      fileStatus.textContent = "直接保存できます";
      setDirty(false);
      persistDraft();
      updateBrowserCapabilities();
      showTransientStatus("保存しました");
      return;
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }
      showTransientStatus("保存できませんでした");
    }
  }

  downloadMarkdown();
  setDirty(false);
  persistDraft();
}

async function writeToFileHandle(handle) {
  const writable = await handle.createWritable();
  await writable.write(editor.value);
  await writable.close();
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

function openReadmeWindow() {
  const opened = window.open(README_URL, "md-atelier-readme", "noopener,noreferrer");
  if (!opened) {
    showTransientStatus("README を開けませんでした");
  }
}

async function handleFileInput(event) {
  const [file] = event.target.files;
  if (file) {
    await loadFile(file, null);
  }
  event.target.value = "";
}

async function loadFileHandle(handle) {
  try {
    const file = await handle.getFile();
    await loadFile(file, handle);
    fileStatus.textContent = canWriteHandle(handle) ? "ダブルクリックで開きました" : "ファイルを開きました";
  } catch {
    showTransientStatus("ファイルを開けませんでした");
  }
}

async function loadFile(file, handle) {
  const content = await file.text();
  fileHandle = handle;
  titleInput.value = file.name || "untitled.md";
  editor.value = content;
  fileStatus.textContent = handle && canWriteHandle(handle) ? "直接保存できます" : "ダウンロード保存";
  setDirty(false);
  persistDraft();
  render();
  updateBrowserCapabilities();
}

function setDirty(value) {
  dirty = value;
  saveState.textContent = dirty ? "未保存" : "保存済み";
  saveState.classList.toggle("is-dirty", dirty);
}

function setMode(mode) {
  workspace.dataset.mode = mode;
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

function canOpenDirectly() {
  return "showOpenFilePicker" in window;
}

function canSaveDirectly() {
  return "showSaveFilePicker" in window || (fileHandle && canWriteHandle(fileHandle));
}

function canWriteHandle(handle) {
  return Boolean(handle && "createWritable" in handle);
}

function updateBrowserCapabilities() {
  const saveTitle = canSaveDirectly() ? "上書き保存" : "ダウンロード保存";
  const openTitle = canOpenDirectly() ? "開く" : "ファイルを選択";
  document.querySelector("#saveButton").title = saveTitle;
  document.querySelector("#saveButton").setAttribute("aria-label", saveTitle);
  document.querySelector("#openButton").title = openTitle;
  document.querySelector("#openButton").setAttribute("aria-label", openTitle);

  if (!fileHandle) {
    fileStatus.textContent = canSaveDirectly() ? "直接保存対応" : "ダウンロード保存";
  }

  updateTranslationAvailability();
  updateSpeechAvailability();
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
    applyMarkdownCommand("bold");
  }
  if (key === "i") {
    event.preventDefault();
    applyMarkdownCommand("italic");
  }
  if (key === "k") {
    event.preventDefault();
    applyMarkdownCommand("link");
  }
}

function applyMarkdownCommand(command) {
  const profile = markdownProfile.value;
  const headingPrefix = {
    standard: {
      "heading-large": "# ",
      "heading-medium": "## ",
      "heading-small": "### ",
    },
    note: {
      "heading-large": "## ",
      "heading-medium": "### ",
      "heading-small": "#### ",
    },
  }[profile];

  const commands = {
    bold: () => (profile === "note" ? wrapSelection("__", "__", "太字") : wrapSelection("**", "**", "太字")),
    italic: () => wrapSelection("*", "*", "斜体"),
    strike: () => wrapSelection("~~", "~~", "取り消し"),
    "inline-code": () => wrapSelection("`", "`", "code"),
    link: () => wrapSelection("[", "](https://example.com)", "リンクテキスト"),
    image: () => insertBlock("![画像の説明](https://example.com/image.png)"),
    "heading-large": () => applyLinePrefix(headingPrefix["heading-large"]),
    "heading-medium": () => applyLinePrefix(headingPrefix["heading-medium"]),
    "heading-small": () => applyLinePrefix(headingPrefix["heading-small"]),
    "bullet-list": () => applyLinePrefix("- "),
    "number-list": () => applyOrderedList(),
    "check-list": () => applyLinePrefix("- [ ] "),
    quote: () => applyLinePrefix("> "),
    "code-block": () => wrapBlock("```\n", "\n```", "ここにコード"),
    table: () => insertBlock("| 項目 | 内容 |\n| --- | --- |\n|  |  |"),
    "math-inline": () => wrapSelection("$${", "}$$", "y = x^2"),
    embed: () => insertBlock("https://note.com/"),
    hr: () => insertBlock("\n---\n"),
  };

  commands[command]?.();
}

function wrapSelection(before, after, placeholder = "") {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.slice(start, end) || placeholder;
  const replacement = `${before}${selected}${after}`;
  editor.setRangeText(replacement, start, end, "select");
  editor.selectionStart = start + before.length;
  editor.selectionEnd = start + before.length + selected.length;
  markEditorChanged();
}

function wrapBlock(before, after, placeholder = "") {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.slice(start, end) || placeholder;
  editor.setRangeText(`${before}${selected}${after}`, start, end, "select");
  markEditorChanged();
}

function insertBlock(markdown) {
  const start = editor.selectionStart;
  const prefix = start > 0 && !editor.value.slice(0, start).endsWith("\n") ? "\n" : "";
  const suffix = editor.value.slice(start).startsWith("\n") ? "" : "\n";
  editor.setRangeText(`${prefix}${markdown}${suffix}`, start, editor.selectionEnd, "end");
  markEditorChanged();
}

function applyLinePrefix(prefix) {
  replaceSelectedLines((line) => {
    if (!line.trim()) {
      return `${prefix}`;
    }
    return `${prefix}${line.replace(/^\s*(#{1,6}|[-*+]|\d+[.)]|>\s?|-\s+\[[ xX]\])\s+/, "")}`;
  });
}

function applyOrderedList() {
  let count = 0;
  replaceSelectedLines((line) => {
    count += 1;
    return `${count}. ${line.replace(/^\s*(#{1,6}|[-*+]|\d+[.)]|>\s?|-\s+\[[ xX]\])\s+/, "") || "項目"}`;
  });
}

function replaceSelectedLines(transform) {
  const value = editor.value;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const selected = value.slice(lineStart, lineEnd);
  const replacement = selected.split("\n").map(transform).join("\n");
  editor.setRangeText(replacement, lineStart, lineEnd, "select");
  markEditorChanged();
}

function markEditorChanged() {
  setDirty(true);
  persistDraft();
  render();
  editor.focus();
}

function updateMarkdownProfile() {
  document.documentElement.dataset.markdownProfile = markdownProfile.value;
}

function initializeResponsiveMode() {
  const mobile = window.matchMedia("(max-width: 760px)").matches;
  if (mobile && !workspace.dataset.userModeSelected) {
    setMode("edit");
  }
}

function toggleSpeechPanel() {
  const opening = speechPanel.hidden;
  speechPanel.hidden = !opening;
  speechToggleButton.classList.toggle("is-active", opening);

  if (opening) {
    updateSpeechAvailability();
    focusEditorForNativeSpeech();
  }
}

function updateSpeechAvailability() {
  speechToggleButton.hidden = false;
}

function focusEditorForNativeSpeech() {
  editor.focus();
  speechStatus.textContent = "編集欄にフォーカスしました";
  speechHint.textContent = "Windows は Win + H、Mac は Fn を2回でOS標準の音声入力を開始します";
}

function toggleTranslationPanel() {
  translationPanel.hidden = !translationPanel.hidden;
  translateToggleButton.classList.toggle("is-active", !translationPanel.hidden);
  if (!translationPanel.hidden) {
    updateTranslationAvailability();
  }
}

async function updateTranslationAvailability() {
  const translator = getTranslatorConstructor();
  const sameLanguage = sourceLanguage.value === targetLanguage.value;
  translateReplaceButton.disabled = sameLanguage || !translator;
  translateDownloadButton.disabled = sameLanguage || !translator;

  if (sameLanguage) {
    translationStatus.textContent = "翻訳元と翻訳先が同じです";
    return;
  }

  if (!translator) {
    translationStatus.textContent = "このブラウザでは内蔵翻訳を利用できません";
    return;
  }

  try {
    const availability = await getTranslatorAvailability(sourceLanguage.value, targetLanguage.value);
    translationStatus.textContent = getTranslationAvailabilityMessage(availability);
  } catch {
    translationStatus.textContent = "翻訳機能の確認に失敗しました";
  }
}

async function translateDocument(mode) {
  if (sourceLanguage.value === targetLanguage.value) {
    showTransientStatus("翻訳元と翻訳先が同じです");
    return;
  }

  if (!getTranslatorConstructor()) {
    translationStatus.textContent = "Chrome / Edge の内蔵翻訳が必要です";
    return;
  }

  setTranslationBusy(true);
  const originalStatus = translationStatus.textContent;
  translationStatus.textContent = "翻訳中...";

  try {
    const translator = await createTranslator(sourceLanguage.value, targetLanguage.value);
    const translated = await translateMarkdown(editor.value, translator);

    if (typeof translator.destroy === "function") {
      translator.destroy();
    }

    if (mode === "replace") {
      editor.value = translated;
      titleInput.value = withLanguageSuffix(titleInput.value, targetLanguage.value);
      setDirty(true);
      persistDraft();
      render();
      translationStatus.textContent = "翻訳しました";
      return;
    }

    const fileName = withLanguageSuffix(titleInput.value || "untitled.md", targetLanguage.value);
    downloadBlob(new Blob([translated], { type: "text/markdown;charset=utf-8" }), normalizeFileName(fileName, ".md"));
    translationStatus.textContent = "翻訳版を保存しました";
  } catch (error) {
    translationStatus.textContent = getTranslationErrorMessage(error);
  } finally {
    setTranslationBusy(false);
    if (translationStatus.textContent === "翻訳中...") {
      translationStatus.textContent = originalStatus;
    }
  }
}

function getTranslatorConstructor() {
  return globalThis.Translator || null;
}

async function getTranslatorAvailability(source, target) {
  const translator = getTranslatorConstructor();
  if (!translator || typeof translator.availability !== "function") {
    return "unavailable";
  }
  return translator.availability({ sourceLanguage: source, targetLanguage: target });
}

async function createTranslator(source, target) {
  const translator = getTranslatorConstructor();
  return translator.create({
    sourceLanguage: source,
    targetLanguage: target,
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => {
        if (event.total) {
          const percent = Math.round((event.loaded / event.total) * 100);
          translationStatus.textContent = `翻訳モデルを準備中 ${percent}%`;
        }
      });
    },
  });
}

async function translateMarkdown(markdown, translator) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const translated = [];
  let index = 0;
  let inFence = false;
  let fenceMarker = "";

  while (index < lines.length) {
    const line = lines[index];
    const fence = line.match(/^\s*(```+|~~~+)/);

    if (fence && !inFence) {
      inFence = true;
      fenceMarker = fence[1][0];
      translated.push(line);
      index += 1;
      continue;
    }

    if (inFence) {
      translated.push(line);
      if (new RegExp(`^\\s*${fenceMarker}{3,}`).test(line)) {
        inFence = false;
      }
      index += 1;
      continue;
    }

    if (!line.trim()) {
      translated.push(line);
      index += 1;
      continue;
    }

    if (isTableDelimiter(line)) {
      translated.push(line);
      index += 1;
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^\s*(```+|~~~+)/.test(lines[index]) &&
      !isTableDelimiter(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }

    const translatedParagraph = [];
    for (const paragraphLine of paragraph) {
      translatedParagraph.push(await translateMarkdownLine(paragraphLine, translator));
    }
    translated.push(...translatedParagraph);
  }

  return translated.join("\n");
}

async function translateMarkdownLine(line, translator) {
  if (/^\s*\|/.test(line) || /\|\s*$/.test(line)) {
    return translateTableLine(line, translator);
  }

  const heading = line.match(/^(\s*#{1,6}\s+)(.*?)(\s*#*)$/);
  if (heading) {
    return `${heading[1]}${await translateInlineText(heading[2], translator)}${heading[3]}`;
  }

  const list = line.match(/^(\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)(.*)$/);
  if (list) {
    return `${list[1]}${await translateInlineText(list[2], translator)}`;
  }

  const quote = line.match(/^(\s{0,3}>\s?)(.*)$/);
  if (quote) {
    return `${quote[1]}${await translateInlineText(quote[2], translator)}`;
  }

  return translateInlineText(line, translator);
}

async function translateTableLine(line, translator) {
  const startsWithPipe = line.trimStart().startsWith("|");
  const endsWithPipe = line.trimEnd().endsWith("|");
  const cells = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|");
  const translatedCells = [];

  for (const cell of cells) {
    const left = cell.match(/^\s*/)[0];
    const right = cell.match(/\s*$/)[0];
    translatedCells.push(`${left}${await translateInlineText(cell.trim(), translator)}${right}`);
  }

  return `${startsWithPipe ? "|" : ""}${translatedCells.join("|")}${endsWithPipe ? "|" : ""}`;
}

async function translateInlineText(text, translator) {
  if (!text.trim()) {
    return text;
  }

  const placeholders = [];
  const protectedText = text.replace(/(\$\$\{[^}]+}\$\$|`[^`]+`|!\[[^\]]*]\([^)]+\)|\[[^\]]+]\([^)]+\)|https?:\/\/\S+)/g, (match) => {
    const id = placeholders.length;
    placeholders.push(match);
    return `[[MD_ATELIER_${id}]]`;
  });

  const translated = await translator.translate(protectedText);
  return placeholders.reduce(
    (value, replacement, id) => value.replaceAll(`[[MD_ATELIER_${id}]]`, replacement),
    translated,
  );
}

function isTableDelimiter(line) {
  return /^\s*\|?[\s:-]+\|[\s|:-]+\|?\s*$/.test(line);
}

function setTranslationBusy(isBusy) {
  sourceLanguage.disabled = isBusy;
  targetLanguage.disabled = isBusy;
  translateReplaceButton.disabled = isBusy;
  translateDownloadButton.disabled = isBusy;
}

function getTranslationAvailabilityMessage(availability) {
  if (availability === "available") {
    return "内蔵翻訳を利用できます";
  }
  if (availability === "downloadable") {
    return "初回翻訳時にモデルをダウンロードします";
  }
  if (availability === "downloading") {
    return "翻訳モデルを準備中です";
  }
  return "この言語ペアは利用できません";
}

function getTranslationErrorMessage(error) {
  if (error?.name === "NotAllowedError") {
    return "ブラウザ設定で翻訳が許可されていません";
  }
  if (error?.name === "AbortError") {
    return "翻訳を中止しました";
  }
  return "翻訳できませんでした";
}

function withLanguageSuffix(fileName, language) {
  const label = language || targetLanguage.value;
  const normalized = normalizeFileName(fileName || "untitled.md", ".md");
  return normalized.replace(/\.(md|markdown|txt)$/i, `.${label}.md`);
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

    if (/^\s*\$\$\s*$/.test(line)) {
      const formula = [];
      index += 1;
      while (index < lines.length && !/^\s*\$\$\s*$/.test(lines[index])) {
        formula.push(lines[index]);
        index += 1;
      }
      index += index < lines.length ? 1 : 0;
      html.push(`<pre class="math-block"><code>${escapeHtml(formula.join("\n"))}</code></pre>`);
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
    /^\s*\$\$\s*$/.test(line) ||
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

  value = value.replace(/\$\$\{([^}]+)}\$\$/g, (_match, formula) => {
    const id = placeholders.length;
    placeholders.push(`<span class="math-inline">${escapeHtml(formula)}</span>`);
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
