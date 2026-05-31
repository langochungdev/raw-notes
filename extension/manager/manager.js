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
import { createAnkiExportModal } from "./anki_export.js";

const logger = new Logger();
const storage = new StorageService(logger);

const collectorList = document.getElementById("collector-list");
const itemList = document.getElementById("item-list");
const itemsTitle = document.getElementById("items-title");
const newCollectorButton = document.getElementById("new-collector");
const newCollectorNameInput = document.getElementById("new-collector-name");
const collectorSelectToggle = document.getElementById("collector-select-toggle");
const collectorDeleteSelected = document.getElementById("collector-delete-selected");
const collectorSelectAllInput = document.getElementById("collector-select-all");
const pickFolderButton = document.getElementById("pick-folder");
const settingsModal = document.getElementById("settings-modal");
const settingsCloseButton = document.getElementById("settings-close");
const settingsCollectorsPath = document.getElementById("settings-collectors-path");
const settingsPickCollectors = document.getElementById("settings-pick-collectors");
const settingsGlobalShortcutButton = document.getElementById("settings-global-shortcut");
const settingsModeInputs = Array.from(
  document.querySelectorAll("input[name=\"sidebar-open-mode\"]")
);
const manualEntryToggle = document.getElementById("manual-entry-toggle");
const searchInput = document.getElementById("search");
const searchCollectorsToggle = document.getElementById("search-collectors-toggle");
const searchCollectorsPanel = document.getElementById("search-collectors-panel");
const selectAllInput = document.getElementById("select-all");
const bulkMoveSelect = document.getElementById("bulk-move-select");
const deleteSelectedButton = document.getElementById("delete-selected");
const itemsCount = document.getElementById("items-count");
const importButton = document.getElementById("import-collector");
const exportButton = document.getElementById("export-collector");
const exportMenu = document.getElementById("export-menu");
const exportJsonButton = document.getElementById("export-json");
const exportAnkiButton = document.getElementById("export-anki");
const exportBadge = document.getElementById("export-badge");
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
const editError = document.getElementById("edit-error");
const miniSearchStatus = document.getElementById("minisearch-status");
const noFolderState = document.getElementById("no-folder-state");
const noFolderPick = document.getElementById("no-folder-pick");
const ankiExportModal = document.getElementById("anki-export-modal");
const ankiExportPanel = document.getElementById("anki-export-panel");
const ankiTabConfig = document.getElementById("anki-tab-config");
const ankiTabReview = document.getElementById("anki-tab-review");
const ankiConfigPanel = document.getElementById("anki-config-panel");
const ankiReviewPanel = document.getElementById("anki-review-panel");
const ankiTemplateSelect = document.getElementById("anki-template-select");
const ankiVocabControls = document.getElementById("anki-vocab-controls");
const ankiVocabMode = document.getElementById("anki-vocab-mode");
const ankiVocabNav = document.getElementById("anki-vocab-nav");
const ankiVocabPrev = document.getElementById("anki-vocab-prev");
const ankiVocabNext = document.getElementById("anki-vocab-next");
const ankiVocabCounter = document.getElementById("anki-vocab-counter");
const ankiFrontToggle = document.getElementById("anki-front-toggle");
const ankiTable = document.getElementById("anki-table");
const ankiTableHeader = document.getElementById("anki-table-header");
const ankiTableBody = document.getElementById("anki-table-body");
const ankiVocabForm = document.getElementById("anki-vocab-form");
const ankiReviewCard = document.getElementById("anki-review-card");
const ankiReviewFront = document.getElementById("anki-review-front");
const ankiReviewBack = document.getElementById("anki-review-back");
const ankiReviewWrap = document.getElementById("anki-review-wrap");
const ankiReviewFrontText = document.getElementById("anki-review-front-text");
const ankiReviewBackText = document.getElementById("anki-review-back-text");
const ankiReviewBackSecondary = document.getElementById("anki-review-back-secondary");
const ankiReviewDots = document.getElementById("anki-review-dots");
const ankiReviewHint = document.getElementById("anki-review-hint");
const ankiReviewPrev = document.getElementById("anki-review-prev");
const ankiReviewNext = document.getElementById("anki-review-next");
const ankiReviewCounter = document.getElementById("anki-review-counter");
const ankiExportButton = document.getElementById("anki-export");
const ankiCancelButton = document.getElementById("anki-cancel");

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
  collectorFolderLabel: ""
};
let settingsState = { ...DEFAULT_SETTINGS };

const updateCollectorSelectAllState = () => {
  if (!collectorSelectAllInput) return;
  const label = collectorSelectAllInput.closest(".select-all");
  if (label) {
    label.classList.toggle(
      "hidden",
      !isCollectorSelectMode || allCollectors.length < 2
    );
  }
  if (!isCollectorSelectMode) {
    collectorSelectAllInput.checked = false;
    collectorSelectAllInput.indeterminate = false;
    return;
  }
  const total = allCollectors.length;
  const selected = allCollectors.filter((c) => selectedCollectorIds.has(c.id)).length;
  collectorSelectAllInput.indeterminate = selected > 0 && selected < total;
  collectorSelectAllInput.checked = total > 0 && selected === total;
};

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

const updateExportButtonState = (count) => {
  if (!exportButton || !exportBadge) return;
  const hasSelection = count > 0;
  exportButton.classList.toggle("is-selection", hasSelection);
  exportBadge.classList.toggle("hidden", !hasSelection);
  exportBadge.textContent = hasSelection ? String(count) : "";
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

const updateSettingsUI = async (options = {}) => {
  const preferExistingPaths = Boolean(options.preferExistingPaths);
  await readSettings();
  settingsModeInputs.forEach((input) => {
    input.checked = input.value === settingsState.sidebarOpenMode;
  });
  if (settingsCollectorsPath) {
    let handle = await storage.restoreCollectorDirectory();
    if (handle?.name) {
      settingsCollectorsPath.textContent = handle.name;
      await writeSettings({ collectorFolderLabel: handle.name });
    } else if (settingsState.collectorFolderLabel) {
      settingsCollectorsPath.textContent = settingsState.collectorFolderLabel;
    } else if (!preferExistingPaths || settingsCollectorsPath.textContent === "") {
      settingsCollectorsPath.textContent = "Not set";
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
  collectorRow: editCollectorRow,
  collectorSelect: editCollector,
  titleEl: editTitle,
  errorEl: editError,
  doc: document
});

const ankiExportManager = createAnkiExportModal({
  modal: ankiExportModal,
  panel: ankiExportPanel,
  tabConfigButton: ankiTabConfig,
  tabReviewButton: ankiTabReview,
  configPanel: ankiConfigPanel,
  reviewPanel: ankiReviewPanel,
  templateSelect: ankiTemplateSelect,
  vocabControls: ankiVocabControls,
  vocabMode: ankiVocabMode,
  vocabNav: ankiVocabNav,
  vocabPrev: ankiVocabPrev,
  vocabNext: ankiVocabNext,
  vocabCounter: ankiVocabCounter,
  frontToggle: ankiFrontToggle,
  table: ankiTable,
  tableHeader: ankiTableHeader,
  tableBody: ankiTableBody,
  vocabForm: ankiVocabForm,
  reviewCard: ankiReviewCard,
  reviewFront: ankiReviewFrontText,
  reviewBack: ankiReviewBackText,
  reviewBackSecondary: ankiReviewBackSecondary,
  reviewWrap: ankiReviewWrap,
  reviewDots: ankiReviewDots,
  reviewHint: ankiReviewHint,
  reviewPrev: ankiReviewPrev,
  reviewNext: ankiReviewNext,
  reviewCounter: ankiReviewCounter,
  exportButton: ankiExportButton,
  cancelButton: ankiCancelButton,
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
  getAllItems: () => allItems,
  getAllCollectors: () => allCollectors,
  setAllCollectors: (collectors) => {
    allCollectors = collectors;
  },
  recalcCollectorCounts,
  renderCollectors: () => {
    collectorManager.renderCollectorList();
  }
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
    updateCollectorSelectAllState();
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
    updateCollectorSelectAllState();
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
  await storage.loadCollectorsFromDisk();
  await logger.log("INFO", "fs", "Picked collector folder", {
    name: handle.name || ""
  });
  const restored = await storage.restoreCollectorDirectory();
  await logger.log("INFO", "fs", "Collector handle stored", {
    stored: Boolean(restored),
    name: restored?.name || ""
  });
  const collectorState = await storage.getCollectorHandleState();
  await logger.log("INFO", "fs", "Collector handle state", collectorState);
  await writeSettings({ collectorFolderLabel: handle.name || "" });
  if (settingsCollectorsPath) {
    settingsCollectorsPath.textContent = handle.name || "Not set";
  }
  await updateSettingsUI({ preferExistingPaths: true });
  await reloadAllData();
});

noFolderPick?.addEventListener("click", async () => {
  const handle = await storage.requestCollectorDirectory();
  if (!handle) return;
  await storage.storeCollectorDirectoryHandle(handle);
  await storage.loadCollectorsFromDisk();
  await writeSettings({ collectorFolderLabel: handle.name || "" });
  await reloadAllData();
  await checkCollectorFolder();
});

settingsModeInputs.forEach((input) => {
  input.addEventListener("change", async (event) => {
    const target = event.target;
    if (!target?.value) return;
    await writeSettings({ sidebarOpenMode: target.value });
    showNotice(document, "Saved");
  });
});

settingsGlobalShortcutButton?.addEventListener("click", () => {
  // Edge detects edge://, Chrome detects chrome://. chrome:// works in Edge extensions too.
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" }).catch(() => {
    showNotice(document, "Unable to open shortcuts page directly");
  });
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
  updateCollectorSelectAllState();
  collectorManager.renderCollectorList();
});

collectorSelectAllInput?.addEventListener("change", () => {
  if (!isCollectorSelectMode) return;
  if (collectorSelectAllInput.checked) {
    allCollectors.forEach((collector) => selectedCollectorIds.add(collector.id));
  } else {
    selectedCollectorIds.clear();
  }
  collectorDeleteSelected.classList.toggle(
    "hidden",
    selectedCollectorIds.size === 0
  );
  updateCollectorSelectAllState();
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
  exportMenu,
  exportJsonButton,
  exportAnkiButton,
  exportBadge,
  storage,
  logger,
  getActiveCollectorId: () => activeCollectorId,
  isCollectorSelectMode: () => isCollectorSelectMode,
  getSelectedCollectorIds: () => selectedCollectorIds,
  getSelectedItemIds: () => Array.from(selectedIds),
  getCollectors: () => allCollectors,
  getAllItems: () => allItems,
  openAnkiExport: (payload) => ankiExportManager.open(payload),
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
  reloadItems: itemManager.loadItems,
  showNotice,
  doc: document
});

attachSelectionHandlers({
  itemList,
  selectAllInput,
  bulkMoveSelect,
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
  showNotice,
  updateSelectionState,
  storage,
  logger,
  doc: document,
  onSelectionChange: (count) => updateExportButtonState(count)
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

const openItemById = async (itemId) => {
  if (!itemId) return;
  if (!Array.isArray(allItems) || allItems.length === 0) {
    await reloadAllData();
  }
  const item = allItems.find((entry) => entry.id === itemId);
  if (!item) return;
  editModalManager.open(item);
};

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "MANAGER_OPEN_ITEM") {
    openItemById(message.itemId || "");
  }
});

const checkCollectorFolder = async () => {
  const handle = await storage.restoreCollectorDirectory();
  const hasFolder = Boolean(handle);
  if (noFolderState) {
    noFolderState.classList.toggle("hidden", hasFolder);
  }
  return hasFolder;
};

const init = async () => {
  await checkAndMigrateSchema(logger);
  await storage.loadCollectorsFromDisk();
  await reloadAllData();
  await checkCollectorFolder();
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.tc_items || changes.tc_collectors) {
      scheduleReload();
    }
  });
};

init();
