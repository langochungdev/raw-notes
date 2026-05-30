import { StorageService } from "../shared/storage.js";
import { Logger } from "../shared/logger.js";
import { checkAndMigrateSchema } from "../shared/schema_migration.js";
import { SearchService } from "../shared/search.js";
import { STORAGE_KEYS } from "../shared/constants.js";
import {
  renderCollectors,
  renderItems,
  updateSelectionState,
  showNotice,
  showUndoToast
} from "./ui.js";
import { attachImportExport } from "./import_export.js";
import { attachManualEntry } from "./manual_entry.js";
import { attachSelectionHandlers } from "./selection.js";
import { attachLogViewer } from "./logs.js";
import { createItemManager } from "./items.js";
import { createCollectorManager, recalcCollectorCounts } from "./collectors.js";
import { createEditModal } from "./edit_modal.js";

const logger = new Logger();
const storage = new StorageService(logger);

const collectorList = document.getElementById("collector-list");
const itemList = document.getElementById("item-list");
const itemsTitle = document.getElementById("items-title");
const newCollectorButton = document.getElementById("new-collector");
const newCollectorNameInput = document.getElementById("new-collector-name");
const collectorSelectToggle = document.getElementById("collector-select-toggle");
const collectorDeleteSelected = document.getElementById("collector-delete-selected");
const pickFolderButton = document.getElementById("pick-folder");
const settingsModal = document.getElementById("settings-modal");
const settingsCloseButton = document.getElementById("settings-close");
const settingsCollectorsPath = document.getElementById("settings-collectors-path");
const settingsVaultPath = document.getElementById("settings-vault-path");
const settingsPickCollectors = document.getElementById("settings-pick-collectors");
const settingsPickVault = document.getElementById("settings-pick-vault");
const settingsShortcutInput = document.getElementById("settings-shortcut");
const settingsModeInputs = Array.from(
  document.querySelectorAll("input[name=\"sidebar-open-mode\"]")
);
const manualEntryToggle = document.getElementById("manual-entry-toggle");
const searchInput = document.getElementById("search");
const searchCollectorsToggle = document.getElementById("search-collectors-toggle");
const searchCollectorsPanel = document.getElementById("search-collectors-panel");
const selectAllInput = document.getElementById("select-all");
const deleteSelectedButton = document.getElementById("delete-selected");
const itemsCount = document.getElementById("items-count");
const importButton = document.getElementById("import-collector");
const exportButton = document.getElementById("export-collector");
const viewLogsButton = document.getElementById("view-logs");
const logModal = document.getElementById("log-modal");
const closeLogsButton = document.getElementById("close-logs");
const clearLogsButton = document.getElementById("clear-logs");
const copyLogsButton = document.getElementById("copy-logs");
const logList = document.getElementById("log-list");
const logFilterButtons = Array.from(
  document.querySelectorAll("[data-log-filter]")
);
const manualEntryForm = document.getElementById("manual-entry");
const entryCollector = document.getElementById("entry-collector");
const editCollectorRow = document.getElementById("edit-collector-row");
const editCollector = document.getElementById("edit-collector");
const editTitle = document.getElementById("edit-title");
const editModal = document.getElementById("edit-modal");
const editSaveButton = document.getElementById("save-edit");
const editCancelButton = document.getElementById("cancel-edit");
const editText = document.getElementById("edit-text");
const editNote = document.getElementById("edit-note");
const editTags = document.getElementById("edit-tags");
const editError = document.getElementById("edit-error");
const miniSearchStatus = document.getElementById("minisearch-status");

let reloadTimer = null;

let activeCollectorId = null;
let searchQuery = "";
let allItems = [];
let allCollectors = [];
let currentResults = [];
const selectedIds = new Set();
const selectedCollectorIds = new Set();
let isCollectorSelectMode = false;
let searchCollectorIds = ["__all__"];
let isSearchCollectorOpen = false;
let reloadAllData = async () => {};
const DEFAULT_SETTINGS = {
  sidebarOpenMode: "float",
  sidebarShortcut: "",
  collectorFolderLabel: "",
  vaultFolderLabel: ""
};
let settingsState = { ...DEFAULT_SETTINGS };

const readSettings = async () => {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const value = stored[STORAGE_KEYS.SETTINGS] || {};
  settingsState = { ...DEFAULT_SETTINGS, ...value };
  return settingsState;
};

const writeSettings = async (updates) => {
  const next = { ...settingsState, ...updates };
  settingsState = next;
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: next });
  return next;
};

const handleCopyShare = async (item) => {
  if (!item?.shareUrl) return;
  try {
    await navigator.clipboard.writeText(item.shareUrl);
    showNotice(document, "Link copied");
  } catch (error) {
    showNotice(document, "Copy failed");
  }
};

const handleCopyText = async (item) => {
  if (!item?.text) return;
  try {
    await navigator.clipboard.writeText(item.text);
    showNotice(document, "Text copied");
  } catch (error) {
    showNotice(document, "Copy failed");
  }
};

const updateSearchPlaceholder = () => {
  const activeCollector = allCollectors.find((collector) => collector.id === activeCollectorId);
  searchInput.placeholder = activeCollector
    ? `Search in ${activeCollector.name}...`
    : "Search all items";
};

const updateMiniSearchStatus = () => {
  if (!miniSearchStatus) return;
  miniSearchStatus.textContent = `MiniSearch ready · ${allItems.length} indexed`;
};

const setAllItemsState = (items) => {
  allItems = items;
  updateMiniSearchStatus();
};

const updateSearchCollectorOptions = () => {
  if (!searchCollectorsPanel || !searchCollectorsToggle) return;
  const selected = new Set(searchCollectorIds);
  searchCollectorsPanel.innerHTML = "";

  const buildRow = (value, label) => {
    const row = document.createElement("label");
    row.className = "search-collector-item";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = value;
    input.checked = selected.has(value) || (value === "__all__" && selected.size === 0);
    input.addEventListener("change", () => {
      if (value === "__all__") {
        searchCollectorIds = ["__all__"];
      } else if (input.checked) {
        searchCollectorIds = Array.from(new Set([...selected, value])).filter(
          (id) => id !== "__all__"
        );
      } else {
        searchCollectorIds = Array.from(selected).filter(
          (id) => id !== value && id !== "__all__"
        );
      }
      if (searchCollectorIds.length === 0) {
        searchCollectorIds = ["__all__"];
      }
      updateSearchCollectorOptions();
      itemManager.refreshItems();
    });
    const text = document.createElement("span");
    text.textContent = label;
    row.appendChild(input);
    row.appendChild(text);
    searchCollectorsPanel.appendChild(row);
  };

  buildRow("__all__", "All collectors");
  allCollectors.forEach((collector) => {
    buildRow(collector.id, collector.name);
  });

  const labelMap = new Map(allCollectors.map((collector) => [collector.id, collector.name]));
  if (selected.size === 0 || selected.has("__all__")) {
    searchCollectorsToggle.textContent = "All collectors";
  } else if (selected.size === 1) {
    const id = Array.from(selected)[0];
    searchCollectorsToggle.textContent = labelMap.get(id) || "1 collector";
  } else {
    searchCollectorsToggle.textContent = `${selected.size} collectors`;
  }
};

const closeSearchCollectorPanel = () => {
  if (!searchCollectorsPanel || !searchCollectorsToggle) return;
  isSearchCollectorOpen = false;
  searchCollectorsPanel.classList.add("hidden");
  searchCollectorsToggle.setAttribute("aria-expanded", "false");
};

const toggleSearchCollectorPanel = () => {
  if (!searchCollectorsPanel || !searchCollectorsToggle) return;
  isSearchCollectorOpen = !isSearchCollectorOpen;
  searchCollectorsPanel.classList.toggle("hidden", !isSearchCollectorOpen);
  searchCollectorsToggle.setAttribute(
    "aria-expanded",
    isSearchCollectorOpen ? "true" : "false"
  );
};

const searchService = new SearchService();

const formatShortcut = (event) => {
  const key = event.key || "";
  const isModifier = ["Control", "Shift", "Alt", "Meta"].includes(key);
  if (isModifier) return "";
  const parts = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  let main = key;
  if (main === " ") main = "Space";
  if (main === "Escape") main = "Esc";
  if (main.length === 1) {
    main = main.toUpperCase();
  }
  parts.push(main);
  return parts.join("+");
};

const updateSettingsUI = async (options = {}) => {
  const preferExistingPaths = Boolean(options.preferExistingPaths);
  await readSettings();
  settingsModeInputs.forEach((input) => {
    input.checked = input.value === settingsState.sidebarOpenMode;
  });
  if (settingsShortcutInput) {
    settingsShortcutInput.value = settingsState.sidebarShortcut || "";
  }
  if (settingsCollectorsPath) {
    let handle = await storage.restoreCollectorDirectory();
    if (!handle) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "GET_COLLECTOR_HANDLE"
        });
        if (response?.ok && response.handle) {
          await storage.storeCollectorDirectoryHandle(response.handle);
          handle = response.handle;
        }
      } catch (error) {
        handle = null;
      }
    }
    if (handle?.name) {
      settingsCollectorsPath.textContent = handle.name;
      await writeSettings({ collectorFolderLabel: handle.name });
    } else if (settingsState.collectorFolderLabel) {
      settingsCollectorsPath.textContent = settingsState.collectorFolderLabel;
    } else if (!preferExistingPaths || settingsCollectorsPath.textContent === "") {
      settingsCollectorsPath.textContent = "Not set";
    }
  }
  if (settingsVaultPath) {
    let handle = await storage.restoreVaultDirectory();
    if (!handle) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "GET_VAULT_HANDLE"
        });
        if (response?.ok && response.handle) {
          await storage.storeVaultDirectoryHandle(response.handle);
          handle = response.handle;
        }
      } catch (error) {
        handle = null;
      }
    }
    if (handle?.name) {
      settingsVaultPath.textContent = handle.name;
      await writeSettings({ vaultFolderLabel: handle.name });
    } else if (settingsState.vaultFolderLabel) {
      settingsVaultPath.textContent = settingsState.vaultFolderLabel;
    } else if (!preferExistingPaths || settingsVaultPath.textContent === "") {
      settingsVaultPath.textContent = "Not set";
    }
  }
};

const openSettings = async () => {
  if (!settingsModal) return;
  await updateSettingsUI();
  settingsModal.classList.remove("hidden");
};

const closeSettings = () => {
  if (!settingsModal) return;
  settingsModal.classList.add("hidden");
};

const editModalManager = createEditModal({
  modal: editModal,
  saveButton: editSaveButton,
  cancelButton: editCancelButton,
  textInput: editText,
  noteInput: editNote,
  tagsInput: editTags,
  collectorRow: editCollectorRow,
  collectorSelect: editCollector,
  titleEl: editTitle,
  errorEl: editError,
  doc: document
});

const itemManager = createItemManager({
  storage,
  searchService,
  renderItems,
  updateSelectionState,
  showNotice,
  openEditModal: (item) => editModalManager.open(item),
  onCopyShare: (item) => handleCopyShare(item),
  onCopyText: (item) => handleCopyText(item),
  reloadItems: () => reloadAllData(),
  itemsTitle,
  itemList,
  selectAllInput,
  deleteSelectedButton,
  itemsCount,
  getActiveCollectorId: () => activeCollectorId,
  getSearchCollectorIds: () => searchCollectorIds,
  getSearchQuery: () => searchQuery,
  getSelectedIds: () => selectedIds,
  setCurrentResults: (results) => {
    currentResults = results;
  },
  setAllItems: (items) => setAllItemsState(items),
  getAllItems: () => allItems
});

const collectorManager = createCollectorManager({
  storage,
  collectorList,
  entryCollector,
  renderCollectors,
  getCollectorSelectMode: () => isCollectorSelectMode,
  getSelectedCollectorIds: () => selectedCollectorIds,
  toggleCollectorSelected: (id) => {
    if (selectedCollectorIds.has(id)) {
      selectedCollectorIds.delete(id);
    } else {
      selectedCollectorIds.add(id);
    }
    collectorDeleteSelected.classList.toggle(
      "hidden",
      selectedCollectorIds.size === 0
    );
    collectorManager.renderCollectorList();
  },
  getActiveCollectorId: () => activeCollectorId,
  setActiveCollectorId: (id) => {
    activeCollectorId = id;
    updateSearchPlaceholder();
  },
  getCollectors: () => allCollectors,
  setCollectors: (collectors) => {
    allCollectors = collectors;
    updateSearchPlaceholder();
    updateSearchCollectorOptions();
  },
  loadItems: itemManager.loadItems,
  onActiveCollectorChange: () => updateSearchPlaceholder()
});

reloadAllData = async () => {
  await collectorManager.loadCollectors();
  await itemManager.loadItems();
  updateSearchPlaceholder();
  updateMiniSearchStatus();
};

const scheduleReload = () => {
  if (reloadTimer) {
    clearTimeout(reloadTimer);
  }
  reloadTimer = setTimeout(() => {
    reloadAllData();
  }, 150);
};


newCollectorButton.addEventListener("click", async () => {
  const name = newCollectorNameInput.value.trim();
  if (!name) {
    showNotice(document, "Collector name is required");
    return;
  }
  await storage.createCollector({ name });
  newCollectorNameInput.value = "";
  await reloadAllData();
});

newCollectorNameInput.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  newCollectorButton.click();
});

pickFolderButton.addEventListener("click", async () => {
  await openSettings();
});

settingsCloseButton?.addEventListener("click", () => {
  closeSettings();
});

settingsModal?.addEventListener("pointerdown", (event) => {
  if (event.target === settingsModal) {
    closeSettings();
  }
});

document.addEventListener("keydown", (event) => {
  if (!settingsModal || settingsModal.classList.contains("hidden")) return;
  if (event.key === "Escape") {
    closeSettings();
  }
});

settingsPickCollectors?.addEventListener("click", async () => {
  const handle = await storage.requestCollectorDirectory();
  if (!handle) return;
  await storage.storeCollectorDirectoryHandle(handle);
  await storage.writeAllCollectorsToDisk();
  await logger.log("INFO", "fs", "Picked collector folder");
  await writeSettings({ collectorFolderLabel: handle.name || "" });
  if (handle) {
    try {
      await chrome.runtime.sendMessage({
        type: "STORE_COLLECTOR_HANDLE",
        handle
      });
    } catch (error) {
      showNotice(document, "Failed to sync folder");
    }
  }
  if (settingsCollectorsPath) {
    settingsCollectorsPath.textContent = handle.name || "Not set";
  }
  await updateSettingsUI({ preferExistingPaths: true });
});

settingsPickVault?.addEventListener("click", async () => {
  const handle = await storage.requestVaultDirectory();
  if (!handle) return;
  await storage.storeVaultDirectoryHandle(handle);
  await logger.log("INFO", "fs", "Picked vault folder");
  await writeSettings({ vaultFolderLabel: handle.name || "" });
  if (handle) {
    try {
      await chrome.runtime.sendMessage({
        type: "STORE_VAULT_HANDLE",
        handle
      });
    } catch (error) {
      showNotice(document, "Failed to sync folder");
    }
  }
  if (settingsVaultPath) {
    settingsVaultPath.textContent = handle.name || "Not set";
  }
  await updateSettingsUI({ preferExistingPaths: true });
});

settingsModeInputs.forEach((input) => {
  input.addEventListener("change", async (event) => {
    const target = event.target;
    if (!target?.value) return;
    await writeSettings({ sidebarOpenMode: target.value });
    showNotice(document, "Saved");
  });
});

settingsShortcutInput?.addEventListener("keydown", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Backspace" || event.key === "Delete") {
    await writeSettings({ sidebarShortcut: "" });
    settingsShortcutInput.value = "";
    showNotice(document, "Shortcut cleared");
    return;
  }
  const next = formatShortcut(event);
  if (!next) return;
  await writeSettings({ sidebarShortcut: next });
  settingsShortcutInput.value = next;
  showNotice(document, "Shortcut saved");
});

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value;
  itemManager.refreshItems();
});


searchCollectorsToggle.addEventListener("click", (event) => {
  event.preventDefault();
  toggleSearchCollectorPanel();
});

document.addEventListener("pointerdown", (event) => {
  if (!isSearchCollectorOpen) return;
  if (
    searchCollectorsPanel.contains(event.target) ||
    searchCollectorsToggle.contains(event.target)
  ) {
    return;
  }
  closeSearchCollectorPanel();
});

collectorSelectToggle.addEventListener("click", () => {
  isCollectorSelectMode = !isCollectorSelectMode;
  collectorSelectToggle.classList.toggle("active", isCollectorSelectMode);
  if (!isCollectorSelectMode) {
    selectedCollectorIds.clear();
    collectorDeleteSelected.classList.add("hidden");
  }
  collectorManager.renderCollectorList();
});

collectorDeleteSelected.addEventListener("click", async () => {
  if (selectedCollectorIds.size === 0) return;
  const ok = window.confirm("Delete selected collectors?");
  if (!ok) return;
  const ids = Array.from(selectedCollectorIds);
  for (const id of ids) {
    await storage.deleteCollector(id);
  }
  selectedCollectorIds.clear();
  collectorDeleteSelected.classList.add("hidden");
  await reloadAllData();
});

attachImportExport({
  importButton,
  exportButton,
  storage,
  logger,
  getActiveCollectorId: () => activeCollectorId,
  isCollectorSelectMode: () => isCollectorSelectMode,
  getSelectedCollectorIds: () => selectedCollectorIds,
  getCollectors: () => allCollectors,
  loadCollectors: collectorManager.loadCollectors,
  loadItems: itemManager.loadItems,
  showNotice,
  doc: document
});

attachManualEntry({
  triggerButton: manualEntryToggle,
  openModal: ({ collectors, activeCollectorId }) =>
    editModalManager.openCreate({ collectors, activeCollectorId }),
  storage,
  searchService,
  getActiveCollectorId: () => activeCollectorId,
  getAllItems: () => allItems,
  setAllItems: (items) => {
    setAllItemsState(items);
  },
  getAllCollectors: () => allCollectors,
  setAllCollectors: (collectors) => {
    allCollectors = collectors;
  },
  recalcCollectorCounts,
  renderCollectors: () => {
    collectorManager.renderCollectorList();
  },
  refreshItems: itemManager.refreshItems,
  showNotice,
  doc: document
});

attachSelectionHandlers({
  itemList,
  selectAllInput,
  deleteSelectedButton,
  itemsCount,
  getCurrentResults: () => currentResults,
  selectedIds,
  getAllItems: () => allItems,
  setAllItems: (items) => {
    setAllItemsState(items);
  },
  getAllCollectors: () => allCollectors,
  setAllCollectors: (collectors) => {
    allCollectors = collectors;
  },
  recalcCollectorCounts,
  searchService,
  renderCollectors: () => {
    collectorManager.renderCollectorList();
  },
  refreshItems: itemManager.refreshItems,
  showUndoToast,
  updateSelectionState,
  storage,
  logger,
  doc: document
});

attachLogViewer({
  viewLogsButton,
  logModal,
  closeLogsButton,
  clearLogsButton,
  copyLogsButton,
  logFilterButtons,
  logList,
  logger,
  showNotice,
  doc: document
});

const init = async () => {
  await checkAndMigrateSchema(logger);
  await reloadAllData();
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.tc_items || changes.tc_collectors) {
      scheduleReload();
    }
  });
  // Show onboarding banner if first run
  const stored = await chrome.storage.local.get("onboardDone");
  const onboardDone = stored?.onboardDone;
  const onboardBanner = document.getElementById("onboard-banner");
  const onboardPickCollectors = document.getElementById("onboard-pick-collectors");
  const onboardPickVault = document.getElementById("onboard-pick-vault");
  const onboardSkip = document.getElementById("onboard-done");
  if (!onboardDone) {
    onboardBanner.classList.remove("hidden");
    onboardPickCollectors.addEventListener("click", async () => {
      await storage.requestCollectorDirectory();
      await storage.writeAllCollectorsToDisk();
      await logger.log("INFO", "onboard", "Picked collectors folder");
      onboardBanner.classList.add("hidden");
      await chrome.storage.local.set({ onboardDone: true });
      await reloadAllData();
    });
    onboardPickVault.addEventListener("click", async () => {
      await storage.requestVaultDirectory();
      await logger.log("INFO", "onboard", "Picked vault folder");
      onboardBanner.classList.add("hidden");
      await chrome.storage.local.set({ onboardDone: true });
    });
    onboardSkip.addEventListener("click", async () => {
      onboardBanner.classList.add("hidden");
      await chrome.storage.local.set({ onboardDone: true });
    });
  }
};

init();
