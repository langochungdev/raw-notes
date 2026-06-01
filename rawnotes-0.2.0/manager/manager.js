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

const pickFolderButton = document.getElementById("pick-folder");
const settingsModal = document.getElementById("settings-modal");
const settingsPickCollectors = document.getElementById("settings-pick-collectors");
const settingsDefaultColor = document.getElementById("settings-default-color");
const settingsGlobalShortcutButton = document.getElementById("settings-global-shortcut");
const settingsLockBanner = document.getElementById("settings-lock-banner");
const settingsLockPick = document.getElementById("settings-lock-pick");
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
const ankiTabRow = document.getElementById("anki-tab-row");
const ankiTabConfig = document.getElementById("anki-tab-config");
const ankiTabReview = document.getElementById("anki-tab-review");
const ankiConfigPanel = document.getElementById("anki-config-panel");
const ankiReviewPanel = document.getElementById("anki-review-panel");
const ankiTemplateSelect = document.getElementById("anki-template-select");
const ankiTemplateDelete = document.getElementById("anki-template-delete");
const ankiCustomSummary = document.getElementById("anki-custom-summary");
const ankiCustomPanel = document.getElementById("anki-custom-panel");
const ankiCustomBack = document.getElementById("anki-custom-back");
const ankiCustomName = document.getElementById("anki-custom-name");
const ankiCustomTextMap = document.getElementById("anki-custom-text-map");
const ankiCustomNoteMap = document.getElementById("anki-custom-note-map");
const ankiCustomFields = document.getElementById("anki-custom-fields");
const ankiCustomAddField = document.getElementById("anki-custom-add-field");
const ankiCustomCancel = document.getElementById("anki-custom-cancel");
const ankiCustomSave = document.getElementById("anki-custom-save");
const ankiCustomError = document.getElementById("anki-custom-error");
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
const ankiTemplateEdit = document.getElementById("anki-template-edit");
const ankiFooter = document.getElementById("anki-footer");
const ankiExportButton = document.getElementById("anki-export");
const ankiCancelButton = document.getElementById("anki-cancel");
const ankiCustomDelete = document.getElementById("anki-custom-delete");

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
  collectorFolderLabel: "",
  defaultCollectorColor: "#00eeff"
};
const CONFIG_FILE_NAME = "config.json";
const createDefaultConfig = () => ({
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
  settings: { ...DEFAULT_SETTINGS },
  ankiTemplates: []
});
let settingsState = { ...DEFAULT_SETTINGS };
let configState = createDefaultConfig();
let hasCollectorFolder = false;

const normalizeTemplate = (raw) => {
  if (!raw || !raw.id || !raw.name) return null;
  const fields = Array.isArray(raw.fields)
    ? raw.fields.map((field) => String(field || "").trim()).filter(Boolean)
    : [];
  return {
    id: String(raw.id),
    name: String(raw.name),
    isCustom: Boolean(raw.isCustom),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    textField: raw.textField ? String(raw.textField) : "",
    noteField: raw.noteField ? String(raw.noteField) : "",
    fields
  };
};

const normalizeConfig = (raw) => {
  const fallback = createDefaultConfig();
  const settings = { ...fallback.settings, ...(raw?.settings || {}) };
  const templates = Array.isArray(raw?.ankiTemplates)
    ? raw.ankiTemplates.map(normalizeTemplate).filter(Boolean)
    : [];
  return {
    schemaVersion: 1,
    updatedAt: raw?.updatedAt || fallback.updatedAt,
    settings,
    ankiTemplates: templates
  };
};

const setSettingsLocked = (locked) => {
  const isLocked = Boolean(locked);
  settingsModal?.querySelector(".settings-panel")?.classList.toggle("is-locked", isLocked);
  settingsLockBanner?.classList.toggle("hidden", !isLocked);
  settingsModeInputs.forEach((input) => {
    input.disabled = isLocked;
  });
  if (settingsDefaultColor) {
    settingsDefaultColor.disabled = isLocked;
  }
  if (settingsGlobalShortcutButton) {
    settingsGlobalShortcutButton.disabled = isLocked;
  }
  if (settingsPickCollectors) {
    settingsPickCollectors.disabled = isLocked;
  }
};

const loadConfigFromDisk = async (options = {}) => {
  const shouldCreate = options.createIfMissing !== false;
  const handle = await storage.restoreCollectorDirectory();
  hasCollectorFolder = Boolean(handle);
  setSettingsLocked(!hasCollectorFolder);
  if (!handle) {
    configState = createDefaultConfig();
    settingsState = { ...DEFAULT_SETTINGS };
    return configState;
  }
  let raw = null;
  try {
    raw = await storage.tryReadJsonFile(handle, CONFIG_FILE_NAME);
  } catch (error) {
    raw = null;
  }
  if (!raw && shouldCreate) {
    const next = createDefaultConfig();
    try {
      await storage.writeJsonFile(handle, CONFIG_FILE_NAME, next);
    } catch (error) {
      await logger.log("WARN", "fs", "Failed to create config.json", {
        message: error.message || "write failed"
      });
    }
    configState = next;
  } else {
    configState = normalizeConfig(raw || {});
  }
  settingsState = { ...DEFAULT_SETTINGS, ...(configState.settings || {}) };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settingsState });
  return configState;
};

const saveConfigToDisk = async (nextConfig) => {
  configState = {
    ...nextConfig,
    updatedAt: new Date().toISOString()
  };
  if (!hasCollectorFolder) return configState;
  const handle = await storage.restoreCollectorDirectory();
  if (!handle) {
    hasCollectorFolder = false;
    setSettingsLocked(true);
    return configState;
  }
  try {
    await storage.writeJsonFile(handle, CONFIG_FILE_NAME, configState);
  } catch (error) {
    await logger.log("WARN", "fs", "Failed to write config.json", {
      message: error.message || "write failed"
    });
  }
  return configState;
};

const updateCollectorSelectionState = () => {
  if (isCollectorSelectMode) {
    const selectedCount = selectedCollectorIds.size;
    exportButton.classList.toggle("is-selection", selectedCount > 0);
    exportBadge.classList.toggle("hidden", selectedCount === 0);
    exportBadge.textContent = selectedCount > 0 ? String(selectedCount) : "";
  } else {
    const itemSelectedCount = selectedIds.size;
    exportButton.classList.toggle("is-selection", itemSelectedCount > 0);
    exportBadge.classList.toggle("hidden", itemSelectedCount === 0);
    exportBadge.textContent = itemSelectedCount > 0 ? String(itemSelectedCount) : "";
  }
};

const readSettings = async () => {
  if (!hasCollectorFolder) {
    settingsState = { ...DEFAULT_SETTINGS };
    return settingsState;
  }
  if (!configState) {
    await loadConfigFromDisk();
  }
  settingsState = { ...DEFAULT_SETTINGS, ...(configState.settings || {}) };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settingsState });
  return settingsState;
};

const writeSettings = async (updates) => {
  const next = { ...settingsState, ...updates };
  settingsState = next;
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: next });
  if (!hasCollectorFolder) return next;
  await saveConfigToDisk({
    ...configState,
    settings: next
  });
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
  searchCollectorsPanel.textContent = "";

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
  const handle = await storage.restoreCollectorDirectory();
  hasCollectorFolder = Boolean(handle);
  setSettingsLocked(!hasCollectorFolder);
  await readSettings();
  settingsModeInputs.forEach((input) => {
    input.checked = input.value === settingsState.sidebarOpenMode;
  });
  if (settingsPickCollectors) {
    if (handle?.name) {
      settingsPickCollectors.textContent = handle.name;
      await writeSettings({ collectorFolderLabel: handle.name });
    } else if (settingsState.collectorFolderLabel) {
      settingsPickCollectors.textContent = settingsState.collectorFolderLabel;
    } else {
      settingsPickCollectors.textContent = "Thêm thư mục";
    }
  }
  if (settingsDefaultColor) {
    settingsDefaultColor.value = settingsState.defaultCollectorColor || "#00eeff";
  }
};

const openSettings = async () => {
  if (!settingsModal) return;
  await loadConfigFromDisk();
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
  tabRow: ankiTabRow,
  tabConfigButton: ankiTabConfig,
  tabReviewButton: ankiTabReview,
  configPanel: ankiConfigPanel,
  reviewPanel: ankiReviewPanel,
  templateSelect: ankiTemplateSelect,
  templateDeleteButton: ankiTemplateDelete,
  templateEditButton: ankiTemplateEdit,
  customSummary: ankiCustomSummary,
  customPanel: ankiCustomPanel,
  customBackButton: ankiCustomBack,
  customNameInput: ankiCustomName,
  customTextMap: ankiCustomTextMap,
  customNoteMap: ankiCustomNoteMap,
  customFields: ankiCustomFields,
  customAddField: ankiCustomAddField,
  customCancelButton: ankiCustomCancel,
  customDeleteButton: ankiCustomDelete,
  customSaveButton: ankiCustomSave,
  customError: ankiCustomError,
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
  footer: ankiFooter,
  getCustomTemplates: () => configState.ankiTemplates || [],
  saveCustomTemplates: async (templates) => {
    const nextConfig = {
      ...configState,
      ankiTemplates: templates
    };
    await saveConfigToDisk(nextConfig);
    return configState;
  },
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
    updateCollectorSelectionState();
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
    updateCollectorSelectionState();
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

const handlePickCollectorFolder = async () => {
  const handle = await storage.requestCollectorDirectory();
  if (!handle) return null;
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
  await loadConfigFromDisk();
  await writeSettings({ collectorFolderLabel: handle.name || "" });
  if (settingsPickCollectors) {
    settingsPickCollectors.textContent = handle.name || "Thêm thư mục";
  }
  await updateSettingsUI({ preferExistingPaths: true });
  await reloadAllData();
  return handle;
};

settingsPickCollectors?.addEventListener("click", async () => {
  await handlePickCollectorFolder();
});

settingsLockPick?.addEventListener("click", async () => {
  await handlePickCollectorFolder();
});

noFolderPick?.addEventListener("click", async () => {
  const handle = await handlePickCollectorFolder();
  if (!handle) return;
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

settingsDefaultColor?.addEventListener("change", async (event) => {
  if (!event.target?.value) return;
  await writeSettings({ defaultCollectorColor: event.target.value });
  showNotice(document, "Saved");
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

const closeCollectorSelectMode = () => {
  if (!isCollectorSelectMode) return;
  isCollectorSelectMode = false;
  collectorSelectToggle.classList.remove("active");
  selectedCollectorIds.clear();
  newCollectorButton.classList.remove("hidden");
  collectorDeleteSelected.classList.add("hidden");
  updateCollectorSelectionState();
  collectorManager.renderCollectorList();
};

document.addEventListener("pointerdown", (event) => {
  if (isSearchCollectorOpen) {
    if (
      !searchCollectorsPanel.contains(event.target) &&
      !searchCollectorsToggle.contains(event.target)
    ) {
      closeSearchCollectorPanel();
    }
  }
  
  if (isCollectorSelectMode) {
    const isCollectorAction = event.target.closest('.collector-card');
    const isToggleAction = collectorSelectToggle.contains(event.target);
    const isDeleteSelectedAction = collectorDeleteSelected.contains(event.target);
    const isExportAction = exportButton.contains(event.target) || (exportMenu && exportMenu.contains(event.target));

    if (!isCollectorAction && !isToggleAction && !isDeleteSelectedAction && !isExportAction) {
      closeCollectorSelectMode();
    }
  }
});

collectorSelectToggle.addEventListener("click", () => {
  if (isCollectorSelectMode) {
    closeCollectorSelectMode();
  } else {
    isCollectorSelectMode = true;
    collectorSelectToggle.classList.add("active");
    newCollectorButton.classList.add("hidden");
    collectorDeleteSelected.classList.remove("hidden");
    updateCollectorSelectionState();
    collectorManager.renderCollectorList();
  }
});



collectorDeleteSelected.addEventListener("click", async () => {
  if (selectedCollectorIds.size === 0) {
    if (allCollectors.length === 0) return;
    const ok = window.confirm("Xóa tất cả các collector?");
    if (!ok) return;
    const ids = allCollectors.map(c => c.id);
    for (const id of ids) {
      await storage.deleteCollector(id);
    }
  } else {
    const ids = Array.from(selectedCollectorIds);
    for (const id of ids) {
      await storage.deleteCollector(id);
    }
  }
  selectedCollectorIds.clear();
  closeCollectorSelectMode();
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
  hasCollectorFolder = hasFolder;
  setSettingsLocked(!hasFolder);
  if (noFolderState) {
    noFolderState.classList.toggle("hidden", hasFolder);
  }
  return hasFolder;
};

const compareVersions = (v1, v2) => {
  const cleanV1 = (v1 || "").replace(/^v/i, "");
  const cleanV2 = (v2 || "").replace(/^v/i, "");
  const parts1 = cleanV1.split(".").map(Number);
  const parts2 = cleanV2.split(".").map(Number);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
};

const checkVersion = async () => {
  try {
    const manifest = chrome.runtime.getManifest();
    const currentVersion = manifest.version.replace(/^v/i, "");
    const versionEl = document.querySelector(".status-version");
    if (versionEl) {
      versionEl.textContent = `RawNotes v${currentVersion}`;
    }

    const today = new Date().toISOString().split("T")[0];
    const { tc_last_version_check, tc_latest_version } = await chrome.storage.local.get([
      "tc_last_version_check",
      "tc_latest_version"
    ]);

    let latestVersion = tc_latest_version;
    if (tc_last_version_check !== today) {
      const response = await fetch("https://rawnotes.langochung.me/version.json", { cache: "no-cache" });
      if (response.ok) {
        const data = await response.json();
        latestVersion = data.version.replace(/^v/i, "");
        await chrome.storage.local.set({
          tc_last_version_check: today,
          tc_latest_version: latestVersion
        });
      }
    }

    if (latestVersion && compareVersions(latestVersion, currentVersion) > 0) {
      if (versionEl) {
        versionEl.textContent = "";
        const a = document.createElement("a");
        a.href = "https://rawnotes.langochung.me/";
        a.target = "_blank";
        a.style.color = "#e24b4a";
        a.style.textDecoration = "none";
        a.textContent = `RawNotes new version v${latestVersion}`;
        versionEl.appendChild(a);
      }
    }
  } catch (error) {
    console.error("Version check failed", error);
  }
};

const init = async () => {
  checkVersion();
  await checkAndMigrateSchema(logger);
  await storage.loadCollectorsFromDisk();
  await loadConfigFromDisk();
  await updateSettingsUI();
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
