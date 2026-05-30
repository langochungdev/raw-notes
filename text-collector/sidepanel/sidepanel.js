import { StorageService } from "../shared/storage.js";
import { Logger } from "../shared/logger.js";
import { createVaultTree } from "./tree.js";
import { createEditorManager } from "./editor.js";

const logger = new Logger();
const storage = new StorageService(logger);

const emptyState = document.getElementById("empty-state");
const emptyMessage = document.getElementById("empty-message");
const pickVaultEmptyButton = document.getElementById("pick-vault-empty");
const treeState = document.getElementById("tree-state");
const editorState = document.getElementById("editor-state");
const vaultSwitchButton = document.getElementById("vault-switch");
const vaultNameEl = document.getElementById("vault-name");
const createFileButton = document.getElementById("create-file");
const createFolderButton = document.getElementById("create-folder");
const treeRootEl = document.getElementById("tree-root");
const treeFooterEl = document.getElementById("tree-footer");
const backToTreeButton = document.getElementById("back-to-tree");
const fileNameInput = document.getElementById("file-name");
const editorBody = document.getElementById("editor-body");
const rawEditor = document.getElementById("raw-editor");
const saveStatus = document.getElementById("save-status");
const editorModeButton = document.getElementById("editor-mode");
const viewFileButton = document.getElementById("view-file");
const slashMenu = document.getElementById("slash-menu");
const nodeMenu = document.getElementById("node-menu");

editorBody.dataset.placeholder = "Dòng đầu tiên là tên file...";

const CURSOR_MARKER = "[[CURSOR]]";
const SLASH_OPTIONS = [
  { label: "Heading 1", template: `# ${CURSOR_MARKER}\n`, keywords: ["h1", "heading"] },
  { label: "Heading 2", template: `## ${CURSOR_MARKER}\n`, keywords: ["h2", "heading"] },
  { label: "Heading 3", template: `### ${CURSOR_MARKER}\n`, keywords: ["h3", "heading"] },
  { label: "Todo list", template: `- [ ] ${CURSOR_MARKER}\n`, keywords: ["todo", "task", "checkbox", "to"] },
  { label: "Toggle", template: `<details>\n<summary>${CURSOR_MARKER}</summary>\n\n</details>\n`, keywords: ["toggle", "details", "to"] },
  { label: "Table", template: `| ${CURSOR_MARKER} |  |\n| --- | --- |\n|  |  |\n`, keywords: ["table", "tab", "ta"] },
  { label: "Code block", template: `\`\`\`\n${CURSOR_MARKER}\n\`\`\`\n`, keywords: ["code", "block"] },
  { label: "Blockquote", template: `> ${CURSOR_MARKER}\n`, keywords: ["quote"] },
  { label: "Highlight", template: `==${CURSOR_MARKER}==`, keywords: ["highlight", "mark"] },
  { label: "Divider", template: "---\n", keywords: ["divider", "hr"] },
  { label: "Image", template: `![${CURSOR_MARKER}]()`, keywords: ["image", "img"] },
  { label: "Link", template: `[${CURSOR_MARKER}]()`, keywords: ["link", "url"] },
  { label: "Math block", template: `$$\n${CURSOR_MARKER}\n$$\n`, keywords: ["math", "latex"] }
].map((option) => {
  const search = `${option.label} ${option.keywords?.join(" ") || ""}`.toLowerCase();
  return { ...option, search };
});

const app = {
  vaultHandle: null,
  rootHandle: null,
  vaultName: "",
  activePath: "",
  expandedPaths: new Set(),
  view: "empty",
  fileCount: 0,
  editorMode: "raw"
};

const setView = (nextView) => {
  app.view = nextView;
  emptyState.classList.toggle("hidden", nextView !== "empty");
  treeState.classList.toggle("hidden", nextView !== "tree");
  editorState.classList.toggle("hidden", nextView !== "editor");
  if (nextView !== "editor") {
    closeSlashMenu();
  }
  const editorEnabled = nextView === "editor";
  editorModeButton.disabled = !editorEnabled;
  viewFileButton.disabled = !editorEnabled;
  renderSaveStatus();
};

const renderSaveStatus = () => {
  if (app.view !== "editor") {
    saveStatus.textContent = "";
    return;
  }
  saveStatus.textContent = "Saved";
};

const setEmptyState = (message, buttonLabel) => {
  emptyMessage.textContent = message;
  pickVaultEmptyButton.textContent = buttonLabel;
};

const setVaultName = () => {
  vaultNameEl.textContent = app.vaultName || "Vault";
};

const renderFooter = () => {
  treeFooterEl.textContent = `${app.fileCount} file · ${app.vaultName || "Vault"}`;
};

const refreshTree = async () => {
  await tree.renderTree();
  renderFooter();
};

const toggleExpandedPath = (path) => {
  if (app.expandedPaths.has(path)) {
    app.expandedPaths.delete(path);
  } else {
    app.expandedPaths.add(path);
  }
};

const updateExpandedPrefixesAfterRename = (oldPath, nextPath) => {
  const nextExpanded = new Set();
  for (const path of app.expandedPaths) {
    if (path === oldPath) {
      nextExpanded.add(nextPath);
      continue;
    }
    if (path.startsWith(`${oldPath}/`)) {
      nextExpanded.add(nextPath + path.slice(oldPath.length));
      continue;
    }
    nextExpanded.add(path);
  }
  app.expandedPaths = nextExpanded;
};

const sanitizeName = (value) => value.replace(/[\\/:*?"<>|]/g, "").trim();

const copyFileToDirectory = async (fileHandle, targetDir, targetName) => {
  const file = await fileHandle.getFile();
  const writableHandle = await targetDir.getFileHandle(targetName, { create: true });
  const writable = await writableHandle.createWritable();
  await writable.write(await file.text());
  await writable.close();
  return writableHandle;
};

const copyDirectoryRecursive = async (sourceDir, targetDir) => {
  for await (const entry of sourceDir.values()) {
    if (entry.kind === "file") {
      await copyFileToDirectory(entry, targetDir, entry.name);
      continue;
    }
    const nextDir = await targetDir.getDirectoryHandle(entry.name, { create: true });
    await copyDirectoryRecursive(entry, nextDir);
  }
};

const renameEntry = async (entryInfo, nextName) => {
  const entry = entryInfo.entry;
  const parentHandle = entryInfo.parentHandle;
  const parentPath = entryInfo.parentPath;
  const currentPath = entryInfo.currentPath;
  const sanitized = sanitizeName(nextName || "");
  if (!sanitized) return;

  const finalName = entry.kind === "file" && !sanitized.endsWith(".md")
    ? `${sanitized}.md`
    : sanitized;
  if (finalName === entry.name) return;

  if (entry.kind === "file" && app.activePath === currentPath) {
    await editorManager.renameCurrentFile(finalName);
    app.activePath = editorManager.getCurrentPath();
    updateExpandedPrefixesAfterRename(currentPath, app.activePath);
    await refreshTree();
    return;
  }

  if (entry.kind === "file") {
    const nextHandle = await parentHandle.getFileHandle(finalName, { create: true });
    const writable = await nextHandle.createWritable();
    const file = await entry.getFile();
    await writable.write(await file.text());
    await writable.close();
    await parentHandle.removeEntry(entry.name);
    if (app.activePath === currentPath) {
      app.activePath = `${parentPath ? `${parentPath}/` : ""}${finalName}`;
    }
    await refreshTree();
    return;
  }

  const nextDir = await parentHandle.getDirectoryHandle(finalName, { create: true });
  await copyDirectoryRecursive(entry, nextDir);
  await parentHandle.removeEntry(entry.name, { recursive: true });
  updateExpandedPrefixesAfterRename(currentPath, parentPath ? `${parentPath}/${finalName}` : finalName);
  if (app.activePath === currentPath || app.activePath.startsWith(`${currentPath}/`)) {
    app.activePath = app.activePath.replace(currentPath, parentPath ? `${parentPath}/${finalName}` : finalName);
  }
  await refreshTree();
};

const deleteEntry = async (entryInfo) => {
  const entry = entryInfo.entry;
  const parentHandle = entryInfo.parentHandle;
  const currentPath = entryInfo.currentPath;
  const recursive = entry.kind === "directory";
  await parentHandle.removeEntry(entry.name, recursive ? { recursive: true } : undefined);
  if (app.activePath === currentPath || app.activePath.startsWith(`${currentPath}/`)) {
    app.activePath = "";
    editorManager.clearCurrentFile?.();
    setView("tree");
  }
  await refreshTree();
};

const tree = createVaultTree({
  treeRootEl,
  getRootHandle: () => app.rootHandle,
  getActivePath: () => app.activePath,
  getExpandedPaths: () => app.expandedPaths,
  toggleExpandedPath,
  onOpenFile: async ({ handle, parentHandle, path }) => {
    app.activePath = path;
    setView("editor");
    await editorManager.openFile({
      handle,
      parentHandle,
      path
    });
    renderSaveStatus();
    await tree.renderTree();
  },
  onRenameEntry: renameEntry,
  onDeleteEntry: deleteEntry,
  onStatsChange: ({ fileCount }) => {
    app.fileCount = fileCount;
    renderFooter();
  }
});

const editorManager = createEditorManager({
  fileNameInput,
  editorBody,
  rawEditor,
  getEditorMode: () => app.editorMode,
  saveStatus,
  getRootHandle: () => app.rootHandle,
  onFileOpened: async ({ path }) => {
    app.activePath = path;
    setView("editor");
    await tree.renderTree();
  },
  onFileClosed: async () => {
    app.activePath = "";
    setView("tree");
    await tree.renderTree();
  },
  onMarkDirty: () => {
    if (app.view === "editor") {
      renderSaveStatus();
    }
  },
  onMarkSaved: () => {
    renderSaveStatus();
  }
});

const updateEditorModeUI = () => {
  const isLive = app.editorMode === "live";
  editorModeButton.textContent = isLive ? "Live" : "Raw";
  editorModeButton.setAttribute("aria-pressed", isLive ? "true" : "false");
  editorModeButton.title = isLive ? "Switch to raw edit" : "Switch to live edit";
  editorBody.classList.toggle("hidden", !isLive);
  rawEditor.classList.toggle("hidden", isLive);
};

const setEditorMode = async (nextMode) => {
  const targetMode = nextMode === "raw" ? "raw" : "live";
  if (app.editorMode === targetMode) {
    updateEditorModeUI();
    return;
  }
  if (targetMode === "raw") {
    await editorManager.setReadOnly(false);
    const text = await editorManager.getCurrentText();
    rawEditor.value = text || "";
  } else {
    await editorManager.setCurrentText(rawEditor.value || "");
    editorManager.scheduleSave();
    await editorManager.setReadOnly(true);
  }
  app.editorMode = targetMode;
  updateEditorModeUI();
  editorManager.focusEditor();
};

updateEditorModeUI();

const slashState = {
  open: false,
  query: "",
  index: 0,
  items: [],
  anchorRect: null,
  startIndex: null,
  pendingOpen: false
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const getTextareaCaretRect = (textarea) => {
  const value = textarea.value || "";
  const caretIndex = textarea.selectionStart ?? value.length;
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.font = style.font;
  mirror.style.padding = style.padding;
  mirror.style.border = style.border;
  mirror.style.boxSizing = style.boxSizing;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.width = `${textarea.clientWidth}px`;

  const before = document.createElement("span");
  before.textContent = value.slice(0, caretIndex);
  const caret = document.createElement("span");
  caret.textContent = "\u200b";
  mirror.appendChild(before);
  mirror.appendChild(caret);
  document.body.appendChild(mirror);

  const caretRect = caret.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const textareaRect = textarea.getBoundingClientRect();
  const left = textareaRect.left + (caretRect.left - mirrorRect.left) - textarea.scrollLeft;
  const top = textareaRect.top + (caretRect.top - mirrorRect.top) - textarea.scrollTop;

  document.body.removeChild(mirror);
  return {
    left,
    right: left,
    top,
    bottom: top + parseFloat(style.lineHeight || "16"),
    width: 0,
    height: 0
  };
};

const getCaretRect = () => {
  if (document.activeElement === rawEditor) {
    return getTextareaCaretRect(rawEditor);
  }
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0).cloneRange();
  if (!range.collapsed) {
    range.collapse(false);
  }
  const rects = range.getClientRects();
  if (rects.length > 0) {
    const rect = rects[0];
    if (rect && (rect.width || rect.height)) return rect;
  }
  const rect = range.getBoundingClientRect();
  if (rect && (rect.width || rect.height)) return rect;
  return null;
};

const positionSlashMenu = () => {
  const fallback = editorBody.getBoundingClientRect();
  const rect = slashState.anchorRect || fallback;
  const left = clamp(rect.left, 8, window.innerWidth - 200);
  const top = clamp(rect.bottom + 6, 8, window.innerHeight - 200);
  slashMenu.style.left = `${left}px`;
  slashMenu.style.top = `${top}px`;
};

const filterSlashOptions = (query) => {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return SLASH_OPTIONS;
  return SLASH_OPTIONS.filter((option) => option.search.includes(trimmed));
};

const renderSlashMenu = () => {
  const options = filterSlashOptions(slashState.query);
  if (!options.length) {
    closeSlashMenu();
    return;
  }
  slashState.items = options;
  slashState.index = clamp(slashState.index, 0, options.length - 1);
  slashMenu.innerHTML = options.map((option, index) => {
    const activeClass = index === slashState.index ? "active" : "";
    return `<button type="button" data-index="${index}" class="${activeClass}">${option.label}</button>`;
  }).join("");
  positionSlashMenu();
  slashMenu.classList.remove("hidden");
};

const closeSlashMenu = () => {
  slashState.open = false;
  slashState.query = "";
  slashState.index = 0;
  slashState.items = [];
  slashState.startIndex = null;
  slashState.pendingOpen = false;
  slashMenu.classList.add("hidden");
  slashMenu.innerHTML = "";
};

const openSlashMenu = () => {
  if (app.editorMode !== "raw") return;
  slashState.open = true;
  slashState.query = "";
  slashState.index = 0;
  slashState.anchorRect = getCaretRect();
  renderSlashMenu();
};

const insertFromSlashMenu = async (option) => {
  if (!option) return;
  if (app.editorMode === "raw" && slashState.startIndex != null) {
    const value = rawEditor.value || "";
    const caret = rawEditor.selectionStart ?? value.length;
    const start = Math.max(0, slashState.startIndex);
    const markerIndex = option.template.indexOf(CURSOR_MARKER);
    const insertText = markerIndex === -1
      ? option.template
      : option.template.replace(CURSOR_MARKER, "");
    rawEditor.value = value.slice(0, start) + insertText + value.slice(caret);
    const cursorPos = start + (markerIndex === -1 ? insertText.length : markerIndex);
    rawEditor.selectionStart = cursorPos;
    rawEditor.selectionEnd = cursorPos;
    closeSlashMenu();
    editorManager.scheduleSave();
    editorManager.focusEditor();
    return;
  }
  closeSlashMenu();
  await editorManager.insertTemplate(option.template, CURSOR_MARKER);
  editorManager.scheduleSave();
  editorManager.focusEditor();
};

slashMenu.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-index]");
  if (!button) return;
  const index = Number(button.dataset.index || "0");
  await insertFromSlashMenu(slashState.items[index]);
});

nodeMenu.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  nodeMenu.classList.add("hidden");
});

const renderNodeMenu = (buttons, anchor) => {
  nodeMenu.innerHTML = buttons.map((button) => {
    const className = button.danger ? "danger" : "";
    return `<button type="button" data-action="${button.action}" class="${className}">${button.label}</button>`;
  }).join("");
  const rect = anchor.getBoundingClientRect();
  nodeMenu.style.left = `${Math.min(rect.left, window.innerWidth - 200)}px`;
  nodeMenu.style.top = `${rect.bottom + 6}px`;
  nodeMenu.classList.remove("hidden");
};

document.addEventListener("pointerdown", (event) => {
  if (!nodeMenu.contains(event.target)) {
    nodeMenu.classList.add("hidden");
  }
  if (!slashMenu.contains(event.target)) {
    closeSlashMenu();
  }
});

const pickVault = async () => {
  const handle = await storage.requestVaultDirectory();
  if (!handle) return;
  await editorManager.clearCurrentFile();
  app.vaultHandle = handle;
  app.rootHandle = handle;
  app.vaultName = handle.name || "Vault";
  app.activePath = "";
  app.expandedPaths = new Set();
  app.fileCount = 0;
  setVaultName();
  setView("tree");
  await refreshTree();
  await logger.log("INFO", "vault", "Picked vault folder", { name: app.vaultName });
};

const loadVault = async () => {
  const handle = await storage.restoreVaultDirectory();
  if (!handle) {
    app.vaultHandle = null;
    app.rootHandle = null;
    app.vaultName = "";
    setVaultName();
    setEmptyState("Chọn một thư mục để bắt đầu.", "Chọn thư mục");
    setView("empty");
    return;
  }

  const permission = await storage.queryVaultPermission();
  if (permission !== "granted") {
    await editorManager.clearCurrentFile();
    app.vaultHandle = null;
    app.rootHandle = null;
    app.vaultName = "";
    setVaultName();
    setEmptyState("Kết nối lại vault", "Kết nối lại vault");
    setView("empty");
    return;
  }

  app.vaultHandle = handle;
  app.rootHandle = handle;
  app.vaultName = handle.name || "Vault";
  app.activePath = "";
  app.expandedPaths = new Set();
  setVaultName();
  setView("tree");
  await refreshTree();
};

const createRootFile = async () => {
  if (!app.rootHandle) return;
  setView("editor");
  await editorManager.createNewFile({ parentHandle: app.rootHandle });
  app.activePath = editorManager.getCurrentPath();
  renderSaveStatus();
  await tree.renderTree();
};

const createRootFolder = async () => {
  if (!app.rootHandle) return;
  const rawName = window.prompt("Tên thư mục mới");
  if (!rawName) return;
  const name = sanitizeName(rawName);
  if (!name) return;
  await app.rootHandle.getDirectoryHandle(name, { create: true });
  app.expandedPaths.add(name);
  await refreshTree();
};

pickVaultEmptyButton.addEventListener("click", pickVault);
vaultSwitchButton.addEventListener("click", pickVault);
createFileButton.addEventListener("click", createRootFile);
createFolderButton.addEventListener("click", createRootFolder);
backToTreeButton.addEventListener("click", async () => {
  closeSlashMenu();
  setView("tree");
  await tree.renderTree();
});

editorModeButton.addEventListener("click", async () => {
  const nextMode = app.editorMode === "live" ? "raw" : "live";
  await setEditorMode(nextMode);
});

viewFileButton.addEventListener("click", async () => {
  const handle = editorManager.getCurrentFileHandle();
  if (!handle) return;
  const file = await handle.getFile();
  const url = URL.createObjectURL(file);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
});

rawEditor.addEventListener("input", () => {
  if (app.editorMode === "raw") {
    editorManager.scheduleSave();
  }
  if (slashState.pendingOpen) {
    slashState.pendingOpen = false;
    slashState.startIndex = Math.max(0, (rawEditor.selectionStart ?? 0) - 1);
    slashState.anchorRect = getCaretRect();
    openSlashMenu();
    return;
  }
  if (!slashState.open || app.editorMode !== "raw") return;
  const caret = rawEditor.selectionStart ?? 0;
  if (slashState.startIndex == null || caret < slashState.startIndex) {
    closeSlashMenu();
    return;
  }
  const segment = rawEditor.value.slice(slashState.startIndex, caret);
  if (!segment.startsWith("/") || /\s/.test(segment)) {
    closeSlashMenu();
    return;
  }
  slashState.query = segment.slice(1);
  slashState.index = 0;
  slashState.anchorRect = getCaretRect();
  renderSlashMenu();
});

fileNameInput.addEventListener("keydown", async (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    await editorManager.renameCurrentFile(fileNameInput.value);
    app.activePath = editorManager.getCurrentPath();
    await tree.renderTree();
  }
});

fileNameInput.addEventListener("blur", async () => {
  await editorManager.renameCurrentFile(fileNameInput.value);
  app.activePath = editorManager.getCurrentPath();
  await tree.renderTree();
});

const handleSlashKeydown = async (event) => {
  if (!slashState.open) return false;

  if (event.key === "Escape") {
    event.preventDefault();
    closeSlashMenu();
    return true;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    slashState.index = (slashState.index + 1) % slashState.items.length;
    renderSlashMenu();
    return true;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    slashState.index = (slashState.index - 1 + slashState.items.length) % slashState.items.length;
    renderSlashMenu();
    return true;
  }

  if (event.key === "Enter" || event.key === "Tab") {
    event.preventDefault();
    await insertFromSlashMenu(slashState.items[slashState.index]);
    return true;
  }

  return false;
};

const handleEditorKeydown = async (event) => {
  if (app.view !== "editor") return;
  if (app.editorMode !== "raw") return;
  if (await handleSlashKeydown(event)) return;

  if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
    slashState.pendingOpen = true;
    return;
  }
  if (event.key === "Escape") {
    closeSlashMenu();
  }
};

editorBody.addEventListener("keydown", handleEditorKeydown);
rawEditor.addEventListener("keydown", handleEditorKeydown);

window.addEventListener("textcollector:markdown-change", () => {
  editorManager.scheduleSave();
});

loadVault();
