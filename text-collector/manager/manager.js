import { StorageService } from "../shared/storage.js";
import { Logger } from "../shared/logger.js";
import { checkAndMigrateSchema } from "../shared/schema_migration.js";
import { SearchService } from "../shared/search.js";
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
const pickFolderButton = document.getElementById("pick-folder");
const manualEntryToggle = document.getElementById("manual-entry-toggle");
const filterToggle = document.getElementById("filter-toggle");
const searchInput = document.getElementById("search");
const selectAllInput = document.getElementById("select-all");
const deleteSelectedButton = document.getElementById("delete-selected");
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
const manualPanel = document.getElementById("manual-panel");
const entryText = document.getElementById("entry-text");
const entryNote = document.getElementById("entry-note");
const entryTags = document.getElementById("entry-tags");
const entryCollector = document.getElementById("entry-collector");
const editModal = document.getElementById("edit-modal");
const editSaveButton = document.getElementById("save-edit");
const editCancelButton = document.getElementById("cancel-edit");
const editText = document.getElementById("edit-text");
const editNote = document.getElementById("edit-note");
const editTags = document.getElementById("edit-tags");
const editError = document.getElementById("edit-error");

let activeCollectorId = null;
let searchQuery = "";
let allItems = [];
let allCollectors = [];
let currentResults = [];
const selectedIds = new Set();
let reloadAllData = async () => {};

const handleCopyShare = async (item) => {
  if (!item?.shareUrl) return;
  try {
    await navigator.clipboard.writeText(item.shareUrl);
    showNotice(document, "Link copied");
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

const searchService = new SearchService();

const editModalManager = createEditModal({
  modal: editModal,
  saveButton: editSaveButton,
  cancelButton: editCancelButton,
  textInput: editText,
  noteInput: editNote,
  tagsInput: editTags,
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
  reloadItems: () => reloadAllData(),
  itemsTitle,
  itemList,
  selectAllInput,
  deleteSelectedButton,
  getActiveCollectorId: () => activeCollectorId,
  getSearchQuery: () => searchQuery,
  getSelectedIds: () => selectedIds,
  setCurrentResults: (results) => {
    currentResults = results;
  },
  setAllItems: (items) => {
    allItems = items;
  },
  getAllItems: () => allItems
});

const collectorManager = createCollectorManager({
  storage,
  collectorList,
  entryCollector,
  renderCollectors,
  getActiveCollectorId: () => activeCollectorId,
  setActiveCollectorId: (id) => {
    activeCollectorId = id;
    updateSearchPlaceholder();
  },
  getCollectors: () => allCollectors,
  setCollectors: (collectors) => {
    allCollectors = collectors;
    updateSearchPlaceholder();
  },
  loadItems: itemManager.loadItems,
  onActiveCollectorChange: () => updateSearchPlaceholder()
});

reloadAllData = async () => {
  await collectorManager.loadCollectors();
  await itemManager.loadItems();
  updateSearchPlaceholder();
};


newCollectorButton.addEventListener("click", async () => {
  const name = window.prompt("Collector name");
  if (!name) return;
  await storage.createCollector({ name });
  await reloadAllData();
});

pickFolderButton.addEventListener("click", async () => {
  await storage.requestCollectorDirectory();
  await storage.writeAllCollectorsToDisk();
  await logger.log("INFO", "fs", "Picked collector folder");
});

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value;
  itemManager.refreshItems();
});

manualEntryToggle.addEventListener("click", () => {
  manualPanel.classList.toggle("hidden");
});

filterToggle.addEventListener("click", () => {
  searchInput.focus();
});

attachImportExport({
  importButton,
  exportButton,
  storage,
  logger,
  getActiveCollectorId: () => activeCollectorId,
  getCollectors: () => allCollectors,
  loadCollectors: collectorManager.loadCollectors,
  loadItems: itemManager.loadItems,
  showNotice,
  doc: document
});

attachManualEntry({
  form: manualEntryForm,
  entryText,
  entryNote,
  entryTags,
  entryCollector,
  storage,
  searchService,
  getActiveCollectorId: () => activeCollectorId,
  getAllItems: () => allItems,
  setAllItems: (items) => {
    allItems = items;
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
  getCurrentResults: () => currentResults,
  selectedIds,
  getAllItems: () => allItems,
  setAllItems: (items) => {
    allItems = items;
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
