import { Logger } from "../shared/logger.js";
import { StorageService } from "../shared/storage.js";
import { checkAndMigrateSchema } from "../shared/schema_migration.js";

const logger = new Logger();
const storageService = new StorageService(logger);

async function ensureDefaultCollector() {
  const collectors = await storageService.getCollectors();
  if (collectors.length > 0) return collectors[0];
  return storageService.createCollector({ name: "Default" });
}

async function init() {
  await checkAndMigrateSchema(logger);
  await ensureDefaultCollector();
}

chrome.runtime.onInstalled.addListener(() => {
  init();
});

chrome.runtime.onStartup.addListener(() => {
  init();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const run = async () => {
    if (message?.type === "SAVE_ITEM") {
      const collectorId = message.collectorId || (await ensureDefaultCollector()).id;
      const item = await storageService.saveItem({
        collectorId,
        text: message.text,
        note: message.note || "",
        source: message.source,
        tags: message.tags || []
      });
      await logger.log("INFO", "storage", "Saved item", { id: item.id });
      return { ok: true, item };
    }

    if (message?.type === "GET_COLLECTORS") {
      const collectors = await storageService.getCollectors();
      return { ok: true, collectors };
    }

    if (message?.type === "CREATE_COLLECTOR") {
      const collector = await storageService.createCollector(message.data);
      return { ok: true, collector };
    }

    if (message?.type === "DELETE_COLLECTOR") {
      await storageService.deleteCollector(message.id);
      return { ok: true };
    }

    if (message?.type === "GET_ITEMS") {
      const items = await storageService.getItems();
      return { ok: true, items };
    }

    return { ok: false, error: "Unknown message" };
  };

  run()
    .then((result) => sendResponse(result))
    .catch(async (error) => {
      await logger.log("ERROR", "runtime", error.message || "Unknown error", {
        stack: error.stack || null
      });
      sendResponse({ ok: false, error: error.message || "Unknown error" });
    });

  return true;
});
