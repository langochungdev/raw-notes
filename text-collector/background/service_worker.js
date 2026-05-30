import { Logger } from "../shared/logger.js";
import { StorageService } from "../shared/storage.js";
import { checkAndMigrateSchema } from "../shared/schema_migration.js";

const logger = new Logger();
const storageService = new StorageService(logger);
const sidePanelByWindow = new Map();
const SIDE_PANEL_TTL_MS = 6000;

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
    if (message?.type === "SHARE_REQUEST") {
      const { action, payload } = message || {};
      const tab = await chrome.tabs.create({
        url: "https://rentry.co/",
        active: false
      });
      const tabId = tab.id;
      if (!tabId) {
        return { ok: false, error: "Failed to open helper tab" };
      }
      const waitForLoad = new Promise((resolve) => {
        const handler = (updatedId, info) => {
          if (updatedId === tabId && info.status === "complete") {
            chrome.tabs.onUpdated.removeListener(handler);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(handler);
      });
      try {
        await waitForLoad;
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          args: [action, payload],
          func: async (shareAction, sharePayload) => {
            try {
              const csrfEl = document.querySelector('input[name="csrfmiddlewaretoken"]');
              const csrfToken = csrfEl ? csrfEl.value : "";
              const shareUrl = sharePayload.shareUrl || "";
              if (!shareUrl) {
                return { ok: false, error: "Missing share url" };
              }
              const parsed = new URL(shareUrl);
              const slug = parsed.pathname.replace(/^\//, "");
              if (!slug) {
                return { ok: false, error: "Missing share slug" };
              }
              const endpoint =
                shareAction === "delete"
                  ? `https://rentry.co/api/delete/${slug}`
                  : `https://rentry.co/api/edit/${slug}`;
              const payload = new URLSearchParams();
              if (csrfToken) {
                payload.set("csrfmiddlewaretoken", csrfToken);
              }
              payload.set("edit_code", sharePayload.editCode || "");
              if (shareAction === "update") {
                payload.set("text", sharePayload.markdown || "");
              }
              const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  "X-CSRFToken": csrfToken
                },
                body: payload
              });
              const text = await response.text();
              if (!response.ok) {
                return { ok: false, error: text || "Share request failed" };
              }
              try {
                const parsedResponse = JSON.parse(text);
                if (parsedResponse?.status && String(parsedResponse.status) !== "200") {
                  return { ok: false, error: parsedResponse?.content || "Share request failed" };
                }
              } catch (error) {
                if (error instanceof SyntaxError) {
                  return { ok: true };
                }
                return { ok: false, error: error.message || "Share request failed" };
              }
              return { ok: true };
            } catch (error) {
              return { ok: false, error: error.message || "Share request failed" };
            }
          }
        });
        const result = results?.[0]?.result;
        return result?.ok
          ? { ok: true }
          : { ok: false, error: result?.error || "Share request failed" };
      } finally {
        await chrome.tabs.remove(tabId);
      }
    }
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
      await ensureDefaultCollector();
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

    if (message?.type === "OPEN_SIDEPANEL") {
      const windowId = sender?.tab?.windowId;
      if (!windowId) {
        return { ok: false, error: "Missing window" };
      }
      await chrome.sidePanel.open({ windowId });
      sidePanelByWindow.set(windowId, {
        isOpen: true,
        lastSeen: Date.now()
      });
      const tabs = await chrome.tabs.query({ windowId });
      await Promise.allSettled(
        tabs.map((tab) =>
          tab.id
            ? chrome.tabs.sendMessage(tab.id, {
                type: "SIDEPANEL_STATE",
                isOpen: true
              })
            : Promise.resolve()
        )
      );
      return { ok: true };
    }

    if (message?.type === "SIDEPANEL_STATE") {
      const windowId = message.windowId;
      if (!windowId) {
        return { ok: false, error: "Missing window" };
      }
      sidePanelByWindow.set(windowId, {
        isOpen: Boolean(message.isOpen),
        lastSeen: message.isOpen ? Date.now() : 0
      });
      const tabs = await chrome.tabs.query({ windowId });
      await Promise.allSettled(
        tabs.map((tab) =>
          tab.id
            ? chrome.tabs.sendMessage(tab.id, {
                type: "SIDEPANEL_STATE",
                isOpen: Boolean(message.isOpen)
              })
            : Promise.resolve()
        )
      );
      return { ok: true };
    }

    if (message?.type === "SIDEPANEL_HEARTBEAT") {
      const windowId = message.windowId;
      if (!windowId) {
        return { ok: false, error: "Missing window" };
      }
      const current = sidePanelByWindow.get(windowId);
      sidePanelByWindow.set(windowId, {
        isOpen: current?.isOpen ?? true,
        lastSeen: Date.now()
      });
      return { ok: true };
    }

    if (message?.type === "SIDEPANEL_GET_STATE") {
      const windowId = sender?.tab?.windowId;
      if (!windowId) {
        return { ok: false, error: "Missing window" };
      }
      const entry = sidePanelByWindow.get(windowId);
      const isOpen =
        Boolean(entry?.isOpen) &&
        Boolean(entry?.lastSeen) &&
        Date.now() - entry.lastSeen < SIDE_PANEL_TTL_MS;
      return { ok: true, isOpen };
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
