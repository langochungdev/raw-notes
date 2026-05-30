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
const saveStatus = document.getElementById("save-status");
const slashMenu = document.getElementById("slash-menu");
const nodeMenu = document.getElementById("node-menu");

editorBody.dataset.placeholder = "Dòng đầu tiên là tên file...";

const SLASH_OPTIONS = [
  { label: "Heading # H1", insert: "# Heading\n" },
  { label: "Heading ## H2", insert: "## Heading\n" },
  { label: "Heading ### H3", insert: "### Heading\n" },
  { label: "Todo list", insert: "- [ ] Todo item\n" },
  { label: "Table", insert: "| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n" },
  { label: "Code block", insert: "```lang\n\n```\n" },
  { label: "Blockquote", insert: "> Quote\n" },
  { label: "Highlight", insert: "==text==" },
  { label: "Divider", insert: "---\n" },
  { label: "Image", insert: "![alt](url)" },
  { label: "Link", insert: "[text](url)" },
  { label: "Math block", insert: "$$\n\n$$\n" }
];

const app = {
  vaultHandle: null,
  rootHandle: null,
  vaultName: "",
  activePath: "",
  expandedPaths: new Set(),
  view: "empty",
  fileCount: 0,
  lastSavedAt: null,
  saveTicker: null
};

const setView = (nextView) => {
  app.view = nextView;
  emptyState.classList.toggle("hidden", nextView !== "empty");
  treeState.classList.toggle("hidden", nextView !== "tree");
  editorState.classList.toggle("hidden", nextView !== "editor");
  if (nextView !== "editor") {
    closeSlashMenu();
  }
  if (nextView !== "editor" && app.saveTicker) {
    clearInterval(app.saveTicker);
    app.saveTicker = null;
  }
  if (nextView === "editor" && !app.saveTicker) {
    app.saveTicker = setInterval(renderSaveStatus, 1000);
  }
  renderSaveStatus();
};

const renderSaveStatus = () => {
  if (app.view !== "editor") {
    saveStatus.textContent = "";
    return;
  }
  if (!app.lastSavedAt) {
    saveStatus.textContent = "Saved";
    return;
  }
  const seconds = Math.max(0, Math.floor((Date.now() - app.lastSavedAt) / 1000));
  saveStatus.textContent = `Saved · ${seconds}s ago`;
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
    app.lastSavedAt = Date.now();
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
    app.lastSavedAt = Date.now();
    renderSaveStatus();
  }
});

const closeSlashMenu = () => {
  slashMenu.classList.add("hidden");
  slashMenu.innerHTML = "";
};

const openSlashMenu = () => {
  const rect = editorBody.getBoundingClientRect();
  slashMenu.innerHTML = `
    <div class="menu-title">Slash menu</div>
  ` + SLASH_OPTIONS.map((option) => {
    return `<button type="button" data-insert="${option.insert.replace(/\n/g, "\\n")}">${option.label}</button>`;
  }).join("");
  slashMenu.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
  slashMenu.style.top = `${Math.min(rect.top + 28, window.innerHeight - 360)}px`;
  slashMenu.classList.remove("hidden");
};

const insertFromSlashMenu = async (markdown) => {
  closeSlashMenu();
  await editorManager.insertMarkdown(markdown.replace(/\\n/g, "\n"));
  editorManager.scheduleSave();
  editorBody.focus();
};

slashMenu.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-insert]");
  if (!button) return;
  await insertFromSlashMenu(button.dataset.insert || "");
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
  if (!slashMenu.contains(event.target) && event.target !== editorBody) {
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
  app.lastSavedAt = Date.now();
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

editorBody.addEventListener("keydown", (event) => {
  if (app.view !== "editor") return;
  if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    openSlashMenu();
    return;
  }
  if (event.key === "Escape") {
    closeSlashMenu();
  }
});

window.addEventListener("textcollector:markdown-change", () => {
  editorManager.scheduleSave();
});

loadVault();
