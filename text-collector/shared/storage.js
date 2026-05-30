import { STORAGE_KEYS } from "./constants.js";

const DB_NAME = "textcollector-db";
const DB_VERSION = 1;
const STORE_NAME = "handles";

async function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function setHandle(key, handle) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(handle, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getHandle(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function removeHandle(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const SHARE_ENDPOINTS = {
  create: "https://rentry.co/api/new",
  update: "https://rentry.co/api/edit",
  delete: "https://rentry.co/api/delete"
};

let rentrySession = {
  csrfToken: null,
  expiresAt: 0
};

const sanitizeMarkdown = (value) => {
  if (!value) return "";
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = 15000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(id);
  }
};

const parseShareResponse = async (response) => {
  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }
  if (!response.ok) {
    const message = data?.errors || data?.content || "Share request failed";
    throw new Error(message);
  }
  if (!data) {
    throw new Error("Invalid share response");
  }
  return data;
};

const parseHtmlCsrfToken = (html) => {
  if (!html) return null;
  const match = html.match(/name="csrfmiddlewaretoken" value="([^"]+)"/);
  return match ? match[1] : null;
};

const getShareSlug = (shareUrl) => {
  if (!shareUrl) return "";
  try {
    const parsed = new URL(shareUrl);
    return parsed.pathname.replace(/^\//, "");
  } catch (error) {
    return "";
  }
};

const buildShareEndpoint = (base, shareUrl) => {
  const slug = getShareSlug(shareUrl);
  if (!slug) {
    throw new Error("Missing share url");
  }
  return `${base}/${slug}`;
};

export class StorageService {
  constructor(logger) {
    this.logger = logger;
  }

  async getCollectors() {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.COLLECTORS);
    return stored[STORAGE_KEYS.COLLECTORS] || [];
  }

  async getItems() {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.ITEMS);
    return stored[STORAGE_KEYS.ITEMS] || [];
  }

  async createCollector(data) {
    const collectors = await this.getCollectors();
    const collector = {
      id: crypto.randomUUID(),
      name: data.name,
      description: data.description || "",
      color: data.color || "#d97706",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      itemCount: 0
    };
    collectors.push(collector);
    await chrome.storage.local.set({ [STORAGE_KEYS.COLLECTORS]: collectors });
    await this.writeAllCollectorsToDisk();
    return collector;
  }

  async updateCollector(id, updates) {
    const collectors = await this.getCollectors();
    const next = collectors.map((collector) => {
      if (collector.id !== id) return collector;
      return {
        ...collector,
        ...updates,
        updatedAt: new Date().toISOString()
      };
    });
    await chrome.storage.local.set({ [STORAGE_KEYS.COLLECTORS]: next });
    await this.writeAllCollectorsToDisk();
    return next.find((collector) => collector.id === id) || null;
  }

  async deleteCollector(id) {
    const collectors = await this.getCollectors();
    const target = collectors.find((collector) => collector.id === id);
    const nextCollectors = collectors.filter((collector) => collector.id !== id);
    const items = await this.getItems();
    const nextItems = items.filter((item) => item.collectorId !== id);
    await chrome.storage.local.set({
      [STORAGE_KEYS.COLLECTORS]: nextCollectors,
      [STORAGE_KEYS.ITEMS]: nextItems
    });
    await this.writeAllCollectorsToDisk();
    const handle = await this.restoreCollectorDirectory();
    if (handle && target) {
      try {
        await handle.removeEntry(target.name, { recursive: true });
      } catch (error) {
        if (this.logger) {
          await this.logger.log("WARN", "fs", "Failed to remove folder", {
            name: target.name,
            message: error.message || "removeEntry failed"
          });
        }
      }
    }
    return true;
  }

  async saveItem(item) {
    const items = await this.getItems();
    const collectors = await this.getCollectors();
    const collector = collectors.find((c) => c.id === item.collectorId);
    if (!collector) {
      throw new Error("Collector not found");
    }
    const nextItem = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [],
      shareUrl: null,
      shareEditCode: null,
      ...item
    };
    items.push(nextItem);
    const nextCollectors = collectors.map((c) => {
      if (c.id !== collector.id) return c;
      return {
        ...c,
        itemCount: (c.itemCount || 0) + 1,
        updatedAt: new Date().toISOString()
      };
    });
    await chrome.storage.local.set({
      [STORAGE_KEYS.ITEMS]: items,
      [STORAGE_KEYS.COLLECTORS]: nextCollectors
    });
    await this.writeCollectorItemsToDisk(collector, items);
    return nextItem;
  }

  async updateItem(id, updates) {
    const items = await this.getItems();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error("Item not found");
    }
    const updatedItem = {
      ...items[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    items[index] = updatedItem;
    await chrome.storage.local.set({ [STORAGE_KEYS.ITEMS]: items });
    const collectors = await this.getCollectors();
    const collector = collectors.find(
      (entry) => entry.id === updatedItem.collectorId
    );
    if (collector) {
      await this.writeCollectorItemsToDisk(collector, items);
    }
    return updatedItem;
  }

  async requestShareCreate(markdown) {
    const payload = new URLSearchParams();
    payload.set("text", markdown);
    const response = await fetchWithTimeout(SHARE_ENDPOINTS.create, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: payload
    });
    const data = await parseShareResponse(response);
    const shareUrl = data?.url || data?.content?.url;
    const editCode = data?.edit_code || data?.editCode || data?.content?.edit_code;
    if (!shareUrl || !editCode) {
      throw new Error("Invalid share response");
    }
    return { shareUrl, shareEditCode: editCode };
  }

  async getRentryCsrfToken() {
    const now = Date.now();
    if (rentrySession.csrfToken && rentrySession.expiresAt > now) {
      return rentrySession.csrfToken;
    }
    const response = await fetchWithTimeout("https://rentry.co/", {
      method: "GET",
      credentials: "include",
      referrer: "https://rentry.co/",
      referrerPolicy: "origin"
    });
    const html = await response.text();
    const token = parseHtmlCsrfToken(html);
    if (!token) {
      throw new Error("CSRF token not found");
    }
    rentrySession = {
      csrfToken: token,
      expiresAt: now + 10 * 60 * 1000
    };
    return token;
  }

  async postShareRequest(endpoint, payload, useCsrf) {
    const headers = {
      "Content-Type": "application/x-www-form-urlencoded"
    };
    const options = {
      method: "POST",
      headers,
      body: payload
    };
    if (useCsrf) {
      const csrfToken = await this.getRentryCsrfToken();
      headers["X-CSRFToken"] = csrfToken;
      options.credentials = "include";
      options.referrer = "https://rentry.co/";
      options.referrerPolicy = "origin";
    } else {
      options.credentials = "omit";
    }
    const response = await fetchWithTimeout(endpoint, options);
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(responseText || "Share request failed");
    }
    try {
      const parsed = JSON.parse(responseText);
      if (parsed?.status && String(parsed.status) !== "200") {
        throw new Error(parsed?.content || "Share request failed");
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        return true;
      }
      throw error;
    }
    return true;
  }

  async requestShareUpdate(editCode, markdown, shareUrl = "") {
    const endpoint = buildShareEndpoint(SHARE_ENDPOINTS.update, shareUrl);
    const payload = new URLSearchParams();
    payload.set("edit_code", editCode);
    payload.set("text", markdown);
    try {
      await this.postShareRequest(endpoint, payload, false);
      return true;
    } catch (error) {
      try {
        await this.postShareRequest(endpoint, payload, true);
        return true;
      } catch (csrfError) {
        return this.requestShareViaTab("update", { editCode, markdown, shareUrl });
      }
    }
  }

  async requestShareDelete(editCode, shareUrl = "") {
    const endpoint = buildShareEndpoint(SHARE_ENDPOINTS.delete, shareUrl);
    const payload = new URLSearchParams();
    payload.set("edit_code", editCode);
    try {
      await this.postShareRequest(endpoint, payload, false);
      return true;
    } catch (error) {
      try {
        await this.postShareRequest(endpoint, payload, true);
        return true;
      } catch (csrfError) {
        return this.requestShareViaTab("delete", { editCode, shareUrl });
      }
    }
  }

  async requestShareViaTab(action, payload) {
    if (!chrome?.runtime?.sendMessage) {
      throw new Error("Share request blocked by origin policy");
    }
    const response = await chrome.runtime.sendMessage({
      type: "SHARE_REQUEST",
      action,
      payload
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Share request failed");
    }
    return true;
  }

  async shareMarkdownOnline(markdown) {
    const sanitized = sanitizeMarkdown(markdown);
    if (!sanitized) {
      throw new Error("Empty content");
    }
    return this.requestShareCreate(sanitized);
  }

  async updateSharedMarkdownOnline(markdown, editCode, shareUrl = "") {
    const sanitized = sanitizeMarkdown(markdown);
    if (!sanitized) {
      throw new Error("Empty content");
    }
    if (!editCode) {
      throw new Error("Missing edit code");
    }
    await this.requestShareUpdate(editCode, sanitized, shareUrl);
    return true;
  }

  async deleteSharedMarkdownOnline(editCode, shareUrl = "") {
    if (!editCode) {
      throw new Error("Missing edit code");
    }
    await this.requestShareDelete(editCode, shareUrl);
    return true;
  }

  async shareItemOnline(id) {
    const items = await this.getItems();
    const item = items.find((entry) => entry.id === id);
    if (!item) {
      throw new Error("Item not found");
    }
    if (item.shareEditCode) {
      return this.updateSharedItemOnline(id);
    }
    const content = sanitizeMarkdown(item.note || item.text || "");
    if (!content) {
      throw new Error("Empty content");
    }
    try {
      const result = await this.requestShareCreate(content);
      return await this.updateItem(id, {
        shareUrl: result.shareUrl,
        shareEditCode: result.shareEditCode
      });
    } catch (error) {
      if (this.logger) {
        await this.logger.log("ERROR", "share", "Publish failed", {
          id,
          message: error.message || "Publish failed"
        });
      }
      throw error;
    }
  }

  async updateSharedItemOnline(id) {
    const items = await this.getItems();
    const item = items.find((entry) => entry.id === id);
    if (!item) {
      throw new Error("Item not found");
    }
    if (!item.shareEditCode) {
      throw new Error("Missing edit code");
    }
    const content = sanitizeMarkdown(item.note || item.text || "");
    if (!content) {
      throw new Error("Empty content");
    }
    try {
      await this.requestShareUpdate(item.shareEditCode, content, item.shareUrl || "");
      return await this.updateItem(id, {
        shareUrl: item.shareUrl || null,
        shareEditCode: item.shareEditCode
      });
    } catch (error) {
      if (this.logger) {
        await this.logger.log("ERROR", "share", "Sync failed", {
          id,
          message: error.message || "Sync failed"
        });
      }
      throw error;
    }
  }

  async deleteSharedItemOnline(id) {
    const items = await this.getItems();
    const item = items.find((entry) => entry.id === id);
    if (!item) {
      throw new Error("Item not found");
    }
    if (!item.shareEditCode) {
      throw new Error("Missing edit code");
    }
    try {
      await this.requestShareDelete(item.shareEditCode, item.shareUrl || "");
      return await this.updateItem(id, {
        shareUrl: null,
        shareEditCode: null
      });
    } catch (error) {
      if (this.logger) {
        await this.logger.log("ERROR", "share", "Delete failed", {
          id,
          message: error.message || "Delete failed"
        });
      }
      throw error;
    }
  }

  async exportCollector(collectorId) {
    const collectors = await this.getCollectors();
    const items = await this.getItems();
    const collector = collectors.find((entry) => entry.id === collectorId);
    if (!collector) {
      throw new Error("Collector not found");
    }
    return {
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      collector,
      items: items.filter((item) => item.collectorId === collectorId)
    };
  }

  async importCollector(data, conflictMode) {
    const collectors = await this.getCollectors();
    const items = await this.getItems();
    const existingCollectorIds = new Map(
      collectors.map((collector) => [collector.id, collector])
    );
    const existingItemIds = new Set(items.map((item) => item.id));

    const collectorsToImport = Array.isArray(data.collectors)
      ? data.collectors
      : data.collector
        ? [data.collector]
        : [];
    const itemsToImport = Array.isArray(data.items) ? data.items : [];

    if (collectorsToImport.length === 0) {
      throw new Error("Invalid import format");
    }

    let nextCollectors = [...collectors];
    let nextItems = [...items];
    const newIds = new Set();

    const generateId = () => crypto.randomUUID();

    for (const collector of collectorsToImport) {
      const originalCollectorId = collector.id;
      let targetCollectorId = collector.id;
      let shouldImport = true;

      if (existingCollectorIds.has(collector.id)) {
        if (conflictMode === "skip") {
          shouldImport = false;
        } else if (conflictMode === "duplicate") {
          targetCollectorId = generateId();
        } else {
          nextCollectors = nextCollectors.filter(
            (entry) => entry.id !== collector.id
          );
          nextItems = nextItems.filter(
            (entry) => entry.collectorId !== collector.id
          );
        }
      }

      if (!shouldImport) {
        continue;
      }

      const nextCollector = {
        ...collector,
        id: targetCollectorId,
        name:
          conflictMode === "duplicate" && existingCollectorIds.has(collector.id)
            ? `${collector.name} Copy`
            : collector.name,
        updatedAt: new Date().toISOString()
      };

      nextCollectors.push(nextCollector);

      const relatedItems = itemsToImport.filter((item) => {
        if (item.collectorId) {
          return item.collectorId === originalCollectorId;
        }
        return true;
      });

      relatedItems.forEach((item) => {
        let nextId = item.id || generateId();
        if (existingItemIds.has(nextId) || newIds.has(nextId)) {
          if (conflictMode === "skip") {
            return;
          }
          nextId = generateId();
        }
        newIds.add(nextId);
        nextItems.push({
          ...item,
          id: nextId,
          collectorId: targetCollectorId
        });
      });
    }

    const counts = new Map();
    nextItems.forEach((item) => {
      counts.set(item.collectorId, (counts.get(item.collectorId) || 0) + 1);
    });
    nextCollectors = nextCollectors.map((collector) => ({
      ...collector,
      itemCount: counts.get(collector.id) || 0
    }));

    await chrome.storage.local.set({
      [STORAGE_KEYS.COLLECTORS]: nextCollectors,
      [STORAGE_KEYS.ITEMS]: nextItems
    });
    await this.writeAllCollectorsToDisk();
    for (const collector of nextCollectors) {
      await this.writeCollectorItemsToDisk(collector, nextItems, false);
    }
    return { collectors: nextCollectors, items: nextItems };
  }

  async requestCollectorDirectory() {
    const handle = await window.showDirectoryPicker();
    return this.storeCollectorDirectoryHandle(handle);
  }

  async requestVaultDirectory() {
    const handle = await window.showDirectoryPicker();
    return this.storeVaultDirectoryHandle(handle);
  }

  async storeCollectorDirectoryHandle(handle) {
    if (!handle) return null;
    await setHandle(STORAGE_KEYS.FS_HANDLE, handle);
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.FS_HANDLE]: handle });
    } catch (error) {
      await Promise.resolve();
    }
    return handle;
  }

  async storeVaultDirectoryHandle(handle) {
    if (!handle) return null;
    await setHandle(STORAGE_KEYS.VAULT_HANDLE, handle);
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.VAULT_HANDLE]: handle });
    } catch (error) {
      await Promise.resolve();
    }
    return handle;
  }

  async restoreCollectorDirectory() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEYS.FS_HANDLE);
      if (stored?.[STORAGE_KEYS.FS_HANDLE]) {
        return stored[STORAGE_KEYS.FS_HANDLE];
      }
    } catch (error) {
      await Promise.resolve();
    }
    return getHandle(STORAGE_KEYS.FS_HANDLE);
  }

  async restoreVaultDirectory() {
    let handle = null;
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEYS.VAULT_HANDLE);
      if (stored?.[STORAGE_KEYS.VAULT_HANDLE]) {
        handle = stored[STORAGE_KEYS.VAULT_HANDLE];
      }
    } catch (error) {
      handle = null;
    }
    if (!handle) {
      handle = await getHandle(STORAGE_KEYS.VAULT_HANDLE);
    }
    try {
      console.debug("restoreVaultDirectory handle:", handle);
    } catch (e) {
      // ignore
    }
    return handle;
  }

  async clearCollectorDirectory() {
    await removeHandle(STORAGE_KEYS.FS_HANDLE);
  }

  async clearVaultDirectory() {
    await removeHandle(STORAGE_KEYS.VAULT_HANDLE);
  }

  async queryCollectorPermission() {
    const handle = await this.restoreCollectorDirectory();
    if (!handle) return "prompt";
    return handle.queryPermission({ mode: "readwrite" });
  }

  async requestCollectorPermission() {
    const handle = await this.restoreCollectorDirectory();
    if (!handle) return "prompt";
    return handle.requestPermission({ mode: "readwrite" });
  }

  async queryVaultPermission() {
    const handle = await this.restoreVaultDirectory();
    if (!handle) return "prompt";
    return handle.queryPermission({ mode: "readwrite" });
  }

  async requestVaultPermission() {
    const handle = await this.restoreVaultDirectory();
    if (!handle) return "prompt";
    return handle.requestPermission({ mode: "readwrite" });
  }

  async writeAllCollectorsToDisk() {
    const handle = await this.restoreCollectorDirectory();
    if (!handle) return;
    try {
      const collectors = await this.getCollectors();
      await this.writeJsonFile(handle, "schema.json", {
        schemaVersion: 3
      });
      await this.writeJsonFile(handle, "collectors.json", collectors);
    } catch (error) {
      if (this.logger) {
        await this.logger.log("WARN", "fs", "Failed to sync collectors", {
          message: error.message || "write failed"
        });
      }
    }
  }

  async writeCollectorItemsToDisk(collector, allItems, syncCollectors = true) {
    const handle = await this.restoreCollectorDirectory();
    if (!handle) return;
    try {
      const collectorDir = await handle.getDirectoryHandle(collector.name, {
        create: true
      });
      const items = allItems.filter((item) => item.collectorId === collector.id);
      await this.writeJsonFile(collectorDir, "items.json", items);
      if (syncCollectors) {
        await this.writeAllCollectorsToDisk();
      }
    } catch (error) {
      if (this.logger) {
        await this.logger.log("WARN", "fs", "Failed to sync collector items", {
          collectorId: collector.id,
          message: error.message || "write failed"
        });
      }
    }
  }

  async deleteItems(ids) {
    const items = await this.getItems();
    const collectors = await this.getCollectors();
    const idSet = new Set(ids);
    const nextItems = items.filter((item) => !idSet.has(item.id));
    const counts = new Map();
    nextItems.forEach((item) => {
      counts.set(item.collectorId, (counts.get(item.collectorId) || 0) + 1);
    });
    const nextCollectors = collectors.map((collector) => ({
      ...collector,
      itemCount: counts.get(collector.id) || 0,
      updatedAt: new Date().toISOString()
    }));
    await chrome.storage.local.set({
      [STORAGE_KEYS.ITEMS]: nextItems,
      [STORAGE_KEYS.COLLECTORS]: nextCollectors
    });
    await this.writeAllCollectorsToDisk();
    for (const collector of nextCollectors) {
      await this.writeCollectorItemsToDisk(collector, nextItems, false);
    }
    return true;
  }

  async writeJsonFile(dirHandle, fileName, data) {
    try {
      const fileHandle = await dirHandle.getFileHandle(fileName, {
        create: true
      });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
    } catch (error) {
      if (this.logger) {
        await this.logger.log("WARN", "fs", "Failed to write file", {
          fileName,
          message: error.message || "write failed"
        });
      }
    }
  }
}
