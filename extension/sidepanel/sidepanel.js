import { StorageService } from "../shared/storage.js";
import { Logger } from "../shared/logger.js";
import { STORAGE_KEYS } from "../shared/constants.js";
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
const shareButton = document.getElementById("share-button");
const shareMenu = document.getElementById("share-menu");
const slashMenu = document.getElementById("slash-menu");
const nodeMenu = document.getElementById("node-menu");

const notifySidepanelState = async (isOpen) => {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    if (!currentWindow?.id) return;
    await chrome.runtime.sendMessage({
      type: "SIDEPANEL_STATE",
      windowId: currentWindow.id,
      isOpen
    });
  } catch (error) {
    await logger.log("WARN", "sidepanel", "State sync failed", {
      message: error.message || "state sync failed"
    });
  }
};

window.addEventListener("beforeunload", () => {
  notifySidepanelState(false);
});

setInterval(() => {
  notifySidepanelState(true);
}, 2000);

notifySidepanelState(true);

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

const renderSaveStatus = () => {
  const visible = app.view === "editor";
  saveStatus.classList.toggle("hidden", !visible);
  saveStatus.setAttribute("aria-hidden", visible ? "false" : "true");
};

const setView = (nextView) => {
  app.view = nextView;
  emptyState.classList.toggle("hidden", nextView !== "empty");
  treeState.classList.toggle("hidden", nextView !== "tree");
  editorState.classList.toggle("hidden", nextView !== "editor");
  if (nextView !== "editor") {
    closeSlashMenu();
    closeShareMenu();
  }
  const editorEnabled = nextView === "editor";
  editorModeButton.disabled = !editorEnabled;
  viewFileButton.disabled = !editorEnabled;
  shareButton.disabled = !editorEnabled;
  renderSaveStatus();
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
const stripMarkdownExtension = (value) => value.replace(/\.md$/i, "");
const getParentPath = (path) => {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
};
const getEntryName = (path) => {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
};

const orderState = {
  map: {}
};

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
    ? `${stripMarkdownExtension(sanitized)}.md`
    : sanitized;
  if (finalName === entry.name) return;

  if (entry.kind === "file" && app.activePath === currentPath) {
    await editorManager.renameCurrentFile(stripMarkdownExtension(finalName));
    app.activePath = editorManager.getCurrentPath();
    updateExpandedPrefixesAfterRename(currentPath, app.activePath);
    await updateSharePathsOnRename(currentPath, app.activePath);
    await updateOrderOnRename(parentPath || "", entry.name, finalName);
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
    await updateSharePathsOnRename(currentPath, app.activePath || `${parentPath ? `${parentPath}/` : ""}${finalName}`);
    await updateOrderOnRename(parentPath || "", entry.name, finalName);
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
  await updateSharePathsOnRename(currentPath, parentPath ? `${parentPath}/${finalName}` : finalName);
  await updateOrderPathsOnRename(currentPath, parentPath ? `${parentPath}/${finalName}` : finalName);
  await updateOrderOnRename(parentPath || "", entry.name, finalName);
  await refreshTree();
};

const deleteEntry = async (entryInfo) => {
  const entry = entryInfo.entry;
  const parentHandle = entryInfo.parentHandle;
  const currentPath = entryInfo.currentPath;
  const recursive = entry.kind === "directory";
  if (entry.kind === "file") {
    const shareInfo = getShareForPath(currentPath);
    if (shareInfo?.shareEditCode) {
      try {
        await storage.deleteSharedMarkdownOnline(shareInfo.shareEditCode, shareInfo.shareUrl || "");
        await setShareForPath(currentPath, null);
      } catch (error) {
        await logger.log("ERROR", "share", "Stop sharing failed", {
          path: currentPath,
          message: error.message || "Stop failed"
        });
        window.alert("Stop sharing failed. Please try again before deleting.");
        return;
      }
    }
  }
  if (entry.kind === "directory" && hasSharedDescendant(currentPath)) {
    window.alert("Folder contains published files. Stop sharing them before deleting.");
    return;
  }
  await parentHandle.removeEntry(entry.name, recursive ? { recursive: true } : undefined);
  await removeFromOrder(entryInfo.parentPath || "", entry.name);
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
  getOrderForPath: (path) => getOrderForPath(path),
  onDrop: async (sourceInfo, targetInfo, dropPosition) => {
    if (!sourceInfo || !targetInfo) return;
    if (sourceInfo.currentPath === targetInfo.currentPath) return;

    const sourceParentPath = sourceInfo.parentPath || "";
    const targetParentPath = targetInfo.parentPath || "";
    const sourceName = sourceInfo.entry.name;
    const targetName = targetInfo.entry.name;

    if (targetInfo.entry.kind === "directory" && sourceInfo.entry.kind === "file" && dropPosition === "inside") {
      if (targetInfo.currentPath === sourceParentPath) {
        return;
      }
      const targetHandle = targetInfo.entry;
      const nextHandle = await copyFileToDirectory(
        sourceInfo.entry,
        targetHandle,
        sourceInfo.entry.name
      );
      await sourceInfo.parentHandle.removeEntry(sourceInfo.entry.name);

      const nextPath = targetInfo.currentPath
        ? `${targetInfo.currentPath}/${sourceInfo.entry.name}`
        : sourceInfo.entry.name;
      const shareInfo = getShareForPath(sourceInfo.currentPath);
      if (shareInfo) {
        await setShareForPath(sourceInfo.currentPath, null);
        await setShareForPath(nextPath, shareInfo);
      }

      await removeFromOrder(sourceParentPath, sourceName);
      await addToOrderEnd(targetInfo.currentPath || "", sourceName);

      if (app.activePath === sourceInfo.currentPath) {
        app.activePath = nextPath;
        await editorManager.openFile({
          handle: nextHandle,
          parentHandle: targetHandle,
          path: nextPath
        });
      }
      await refreshTree();
      return;
    }

    if (targetInfo.entry.kind === "directory" && targetInfo.currentPath === "" && sourceInfo.entry.kind === "file" && dropPosition === "inside") {
      if (!app.rootHandle || sourceParentPath === "") {
        return;
      }
      const targetHandle = app.rootHandle;
      const nextHandle = await copyFileToDirectory(
        sourceInfo.entry,
        targetHandle,
        sourceInfo.entry.name
      );
      await sourceInfo.parentHandle.removeEntry(sourceInfo.entry.name);

      const nextPath = sourceInfo.entry.name;
      const shareInfo = getShareForPath(sourceInfo.currentPath);
      if (shareInfo) {
        await setShareForPath(sourceInfo.currentPath, null);
        await setShareForPath(nextPath, shareInfo);
      }

      await removeFromOrder(sourceParentPath, sourceName);
      await addToOrderEnd("", sourceName);

      if (app.activePath === sourceInfo.currentPath) {
        app.activePath = nextPath;
        await editorManager.openFile({
          handle: nextHandle,
          parentHandle: targetHandle,
          path: nextPath
        });
      }
      await refreshTree();
      return;
    }

    if (sourceParentPath !== targetParentPath) {
      return;
    }

    const order = await ensureOrderForPath(sourceInfo.parentHandle, sourceParentPath);
    const nextOrder = order.filter((name) => name !== sourceName);
    const insertIndex = nextOrder.indexOf(targetName);
    if (insertIndex === -1) {
      nextOrder.push(sourceName);
    } else {
      const offset = dropPosition === "after" ? 1 : 0;
      nextOrder.splice(insertIndex + offset, 0, sourceName);
    }
    await setOrderForPath(sourceParentPath, nextOrder);
    await refreshTree();
  },
  onOpenFile: async ({ handle, parentHandle, path }) => {
    app.activePath = path;
    setView("editor");
    await editorManager.openFile({
      handle,
      parentHandle,
      path
    });
    renderSaveStatus();
    if (shareState.open) {
      renderShareMenu();
      positionShareMenu();
    }
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

const shareState = {
  map: {},
  open: false,
  loading: false
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

const loadShareMap = async () => {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.VAULT_SHARES);
  shareState.map = stored[STORAGE_KEYS.VAULT_SHARES] || {};
};

const loadOrderMap = async () => {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.VAULT_ORDER);
  orderState.map = stored[STORAGE_KEYS.VAULT_ORDER] || {};
};

const persistShareMap = async () => {
  await chrome.storage.local.set({
    [STORAGE_KEYS.VAULT_SHARES]: shareState.map
  });
  const vaultHandle = await storage.restoreVaultDirectory();
  if (!vaultHandle) return;
  try {
    await storage.writeJsonFile(vaultHandle, ".rawnotes-share.json", shareState.map);
  } catch (error) {
    await logger.log("WARN", "share", "Failed to write share metadata", {
      message: error.message || "Write failed"
    });
  }
};

const persistOrderMap = async () => {
  await chrome.storage.local.set({
    [STORAGE_KEYS.VAULT_ORDER]: orderState.map
  });
  const vaultHandle = await storage.restoreVaultDirectory();
  if (!vaultHandle) return;
  try {
    await storage.writeJsonFile(vaultHandle, ".rawnotes-order.json", orderState.map);
  } catch (error) {
    await logger.log("WARN", "tree", "Failed to write order metadata", {
      message: error.message || "Write failed"
    });
  }
};

const getShareForPath = (path) => {
  if (!path) return null;
  return shareState.map[path] || null;
};

const setShareForPath = async (path, data) => {
  if (!path) return;
  if (data) {
    shareState.map[path] = data;
  } else {
    delete shareState.map[path];
  }
  await persistShareMap();
};

const updateSharePathsOnRename = async (oldPath, nextPath) => {
  const nextMap = {};
  Object.entries(shareState.map).forEach(([path, info]) => {
    if (path === oldPath) {
      nextMap[nextPath] = info;
      return;
    }
    if (path.startsWith(`${oldPath}/`)) {
      nextMap[`${nextPath}${path.slice(oldPath.length)}`] = info;
      return;
    }
    nextMap[path] = info;
  });
  shareState.map = nextMap;
  await persistShareMap();
};

const getOrderForPath = (path) => orderState.map[path] || null;

const setOrderForPath = async (path, nextOrder) => {
  orderState.map[path] = nextOrder;
  await persistOrderMap();
};

const updateOrderPathsOnRename = async (oldPath, nextPath) => {
  const nextMap = {};
  Object.entries(orderState.map).forEach(([path, order]) => {
    if (path === oldPath) {
      nextMap[nextPath] = order;
      return;
    }
    if (path.startsWith(`${oldPath}/`)) {
      nextMap[`${nextPath}${path.slice(oldPath.length)}`] = order;
      return;
    }
    nextMap[path] = order;
  });
  orderState.map = nextMap;
  await persistOrderMap();
};

const isHiddenEntryName = (name) => name.startsWith(".");

const ensureOrderForPath = async (parentHandle, parentPath) => {
  if (orderState.map[parentPath]) {
    return orderState.map[parentPath];
  }
  const names = [];
  for await (const child of parentHandle.values()) {
    if (isHiddenEntryName(child.name)) {
      continue;
    }
    names.push(child.name);
  }
  names.sort((a, b) => a.localeCompare(b));
  orderState.map[parentPath] = names;
  await persistOrderMap();
  return names;
};

const hasSharedDescendant = (path) =>
  Object.keys(shareState.map).some(
    (entryPath) => entryPath === path || entryPath.startsWith(`${path}/`)
  );

const updateOrderOnRename = async (parentPath, previousName, nextName) => {
  const order = orderState.map[parentPath];
  if (!order) return;
  const index = order.indexOf(previousName);
  if (index === -1) return;
  order[index] = nextName;
  await setOrderForPath(parentPath, [...order]);
};

const removeFromOrder = async (parentPath, entryName) => {
  const order = orderState.map[parentPath];
  if (!order) return;
  const nextOrder = order.filter((name) => name !== entryName);
  await setOrderForPath(parentPath, nextOrder);
};

const addToOrderEnd = async (parentPath, entryName) => {
  const order = orderState.map[parentPath] || [];
  if (!order.includes(entryName)) {
    order.push(entryName);
    await setOrderForPath(parentPath, [...order]);
  }
};

const setShareStatus = (message) => {
  const status = shareMenu.querySelector(".share-status");
  if (status) {
    status.textContent = message || "";
  }
};

const renderShareMenu = () => {
  const shareInfo = getShareForPath(app.activePath);
  if (!app.activePath) {
    shareMenu.innerHTML = `
      <div class="share-status">No file selected</div>
    `;
    return;
  }
  if (!shareInfo) {
    shareMenu.innerHTML = `
      <button type="button" class="share-action" data-action="publish">Publish online</button>
      <div class="share-status"></div>
    `;
    return;
  }
  const safeUrl = escapeHtml(shareInfo.shareUrl || "");
  shareMenu.innerHTML = `
    <div class="share-row">
      <input class="share-url" type="text" readonly value="${safeUrl}" />
      <button type="button" class="share-action" data-action="copy">Copy</button>
    </div>
    <div class="share-row">
      <button type="button" class="share-action" data-action="sync">Sync latest</button>
      <button type="button" class="share-action danger" data-action="stop">Stop sharing</button>
    </div>
    <div class="share-status"></div>
  `;
};

const positionShareMenu = () => {
  const rect = shareButton.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - 260);
  const top = rect.bottom + 6;
  shareMenu.style.left = `${left}px`;
  shareMenu.style.top = `${top}px`;
};

const closeShareMenu = () => {
  shareState.open = false;
  shareMenu.classList.add("hidden");
  shareMenu.innerHTML = "";
};

const openShareMenu = () => {
  if (app.view !== "editor") return;
  shareState.open = true;
  renderShareMenu();
  positionShareMenu();
  shareMenu.classList.remove("hidden");
};

const formatForLive = (text) => {
  const normalized = (text || "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const formatted = lines.map((line, index) => {
    const next = lines[index + 1];
    if (next === undefined) return line;
    if (line === "" || next === "") return line;
    if (line.endsWith("  ")) return line;
    return `${line}  `;
  }).join("\n");
  return formatted;
};

const setEditorMode = async (nextMode) => {
  const targetMode = nextMode === "raw" ? "raw" : "live";
  if (app.editorMode === targetMode) {
    updateEditorModeUI();
    return;
  }
  if (targetMode === "raw") {
    await editorManager.setReadOnly(false);
  } else {
    const formatted = formatForLive(rawEditor.value || "");
    await editorManager.setCurrentText(formatted);
    await editorManager.setReadOnly(true);
  }
  app.editorMode = targetMode;
  updateEditorModeUI();
  editorManager.focusEditor();
};

updateEditorModeUI();
loadShareMap();
loadOrderMap();

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
  if (!shareMenu.contains(event.target) && event.target !== shareButton) {
    closeShareMenu();
  }
});

const pickVault = async (options = {}) => {
  const forcePicker = Boolean(options.forcePicker);
  let handle = null;
  if (!forcePicker) {
    handle = await storage.restoreVaultDirectory();
    if (handle) {
      const permission = await storage.requestVaultPermission();
      await logger.log("INFO", "vault", "Vault permission request", {
        permission
      });
      if (permission !== "granted") {
        setEmptyState("Ket noi lai vault", "Xac nhan thu muc");
        setView("empty");
        return;
      }
    }
  }
  if (!handle) {
    handle = await storage.requestVaultDirectory();
    if (!handle) return;
    await logger.log("INFO", "vault", "Picked vault handle", {
      name: handle.name || "",
      kind: handle.kind || ""
    });
  }
  const permission = await handle.requestPermission({ mode: "readwrite" });
  await logger.log("INFO", "vault", "Vault permission request", {
    permission
  });
  if (permission !== "granted") {
    setEmptyState("Ket noi lai vault", "Xac nhan thu muc");
    setView("empty");
    return;
  }
  await editorManager.clearCurrentFile();
  app.vaultHandle = handle;
  app.rootHandle = handle;
  app.vaultName = handle.name || "Vault";
  app.activePath = "";
  app.expandedPaths = new Set();
  app.fileCount = 0;
  setVaultName();
  await loadShareMap();
  await loadOrderMap();
  setView("tree");
  await refreshTree();
  await logger.log("INFO", "vault", "Picked vault folder", { name: app.vaultName });
};

const loadVault = async () => {
  await logger.log("INFO", "vault", "Load vault start", {});
  let handle = await storage.restoreVaultDirectory();
  if (handle) {
    await logger.log("INFO", "vault", "Vault handle restored", {
      name: handle.name || "",
      kind: handle.kind || ""
    });
  }
  if (!handle) {
    const state = await storage.getVaultHandleState();
    await logger.log("WARN", "vault", "Vault handle missing", {
      source: "loadVault",
      idb: state.idb
    });
    app.vaultHandle = null;
    app.rootHandle = null;
    app.vaultName = "";
    setVaultName();
    setEmptyState("Chọn một thư mục để bắt đầu.", "Chọn thư mục");
    setView("empty");
    return;
  }

  let permission = await storage.queryVaultPermission();
  await logger.log("INFO", "vault", "Vault permission query", {
    permission
  });
  if (permission !== "granted") {
    await logger.log("WARN", "vault", "Vault permission not granted", {
      permission
    });
    await editorManager.clearCurrentFile();
    app.vaultHandle = null;
    app.rootHandle = null;
    app.vaultName = "";
    setVaultName();
    setEmptyState("Ket noi lai vault", "Xac nhan thu muc");
    setView("empty");
    return;
  }

  app.vaultHandle = handle;
  app.rootHandle = handle;
  app.vaultName = handle.name || "Vault";
  app.activePath = "";
  app.expandedPaths = new Set();
  setVaultName();
  await loadShareMap();
  await loadOrderMap();
  setView("tree");
  await refreshTree();
  await logger.log("INFO", "vault", "Vault loaded", {
    name: app.vaultName || ""
  });
};

const createRootFile = async () => {
  if (!app.rootHandle) return;
  setView("editor");
  await editorManager.createNewFile({ parentHandle: app.rootHandle });
  app.activePath = editorManager.getCurrentPath();
  await addToOrderEnd("", getEntryName(app.activePath));
  renderSaveStatus();
  await tree.renderTree();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      editorManager.focusFileNameInput?.();
    });
  });
};

const createRootFolder = async () => {
  if (!app.rootHandle) return;
  const rawName = window.prompt("Tên thư mục mới");
  if (!rawName) return;
  const name = sanitizeName(rawName);
  if (!name) return;
  await app.rootHandle.getDirectoryHandle(name, { create: true });
  app.expandedPaths.add(name);
  await addToOrderEnd("", name);
  await refreshTree();
};

pickVaultEmptyButton.addEventListener("click", () => pickVault());
vaultSwitchButton.addEventListener("click", () => pickVault({ forcePicker: true }));
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

shareButton.addEventListener("click", () => {
  if (shareState.open) {
    closeShareMenu();
    return;
  }
  openShareMenu();
});

shareMenu.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || shareState.loading) return;
  const action = button.dataset.action;
  const currentPath = app.activePath;
  if (!currentPath) return;

  const shareInfo = getShareForPath(currentPath);
  const content = rawEditor.value || "";
  shareState.loading = true;
  setShareStatus("Working...");
  try {
    if (action === "publish") {
      const result = await storage.shareMarkdownOnline(content);
      await setShareForPath(currentPath, {
        shareUrl: result.shareUrl,
        shareEditCode: result.shareEditCode,
        updatedAt: new Date().toISOString()
      });
      renderShareMenu();
      setShareStatus("Published");
    }
    if (action === "sync" && shareInfo?.shareEditCode) {
      await storage.updateSharedMarkdownOnline(content, shareInfo.shareEditCode, shareInfo.shareUrl || "");
      await setShareForPath(currentPath, {
        ...shareInfo,
        updatedAt: new Date().toISOString()
      });
      renderShareMenu();
      setShareStatus("Synced");
    }
    if (action === "stop" && shareInfo?.shareEditCode) {
      await storage.deleteSharedMarkdownOnline(shareInfo.shareEditCode, shareInfo.shareUrl || "");
      await setShareForPath(currentPath, null);
      renderShareMenu();
      setShareStatus("Stopped");
    }
    if (action === "copy" && shareInfo?.shareUrl) {
      await navigator.clipboard.writeText(shareInfo.shareUrl);
      setShareStatus("Copied");
    }
  } catch (error) {
    await logger.log("ERROR", "share", "Share action failed", {
      path: currentPath,
      message: error.message || "Share failed"
    });
    setShareStatus("Failed");
  } finally {
    shareState.loading = false;
  }
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
  if (app.editorMode === "raw") {
    editorManager.scheduleSave();
  }
});

loadVault();
