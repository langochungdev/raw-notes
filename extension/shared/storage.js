import { SCHEMA_VERSION, STORAGE_KEYS } from "./constants.js";

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

const isDirectoryHandle = (handle) =>
  Boolean(handle) &&
  handle.kind === "directory" &&
  typeof handle.queryPermission === "function" &&
  typeof handle.requestPermission === "function";

const summarizeHandle = (handle) => ({
  exists: Boolean(handle),
  kind: handle?.kind || "",
  name: handle?.name || ""
});

const normalizeCollectorBase = (name) => {
  const base = String(name || "").trim().toLowerCase();
  const sanitized = base
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized || "collector";
};

const buildCollectorToken = (id) => {
  const cleaned = String(id || "").replace(/[^a-zA-Z0-9]/g, "");
  if (cleaned.length >= 8) return cleaned.slice(0, 8).toLowerCase();
  if (cleaned.length > 0) return cleaned.toLowerCase();
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
};

const buildCollectorFileName = (collector) => {
  const base = normalizeCollectorBase(collector?.name);
  const token = buildCollectorToken(collector?.id);
  return `${base}_rn${token}.json`;
};


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

  getCollectorFileName(collector) {
    return collector?.fileName || buildCollectorFileName(collector);
  }

  normalizeCollectorData(raw) {
    const now = new Date().toISOString();
    return {
      id: raw?.id || crypto.randomUUID(),
      name: String(raw?.name || "Collector"),
      description: raw?.description || "",
      color: raw?.color || "#d97706",
      createdAt: raw?.createdAt || now,
      updatedAt: raw?.updatedAt || now,
      itemCount: Number.isFinite(raw?.itemCount) ? raw.itemCount : 0,
      fileName: raw?.fileName || ""
    };
  }

  normalizeItemData(raw, collectorId) {
    const now = new Date().toISOString();
    const rawCollectorIds = Array.isArray(raw?.collectorIds)
      ? raw.collectorIds.filter(Boolean)
      : [];
    const fallbackCollectorId = collectorId || raw?.collectorId || null;
    const collectorIds = rawCollectorIds.length > 0
      ? rawCollectorIds
      : fallbackCollectorId
        ? [fallbackCollectorId]
        : [];
    return {
      id: raw?.id || crypto.randomUUID(),
      collectorId: collectorIds[0] || fallbackCollectorId,
      collectorIds,
      text: raw?.text || "",
      note: raw?.note || "",
      tags: Array.isArray(raw?.tags) ? raw.tags : [],
      source: raw?.source || null,
      createdAt: raw?.createdAt || now,
      updatedAt: raw?.updatedAt || now,
      shareUrl: raw?.shareUrl ?? null,
      shareEditCode: raw?.shareEditCode ?? null
    };
  }

  async readJsonFileFromHandle(fileHandle) {
    const file = await fileHandle.getFile();
    const content = await file.text();
    return JSON.parse(content);
  }

  async tryReadJsonFile(dirHandle, fileName) {
    try {
      const fileHandle = await dirHandle.getFileHandle(fileName);
      return await this.readJsonFileFromHandle(fileHandle);
    } catch (error) {
      return null;
    }
  }

  async readCollectorFilesFromDirectory(handle) {
    const collectors = [];
    const items = [];
    const collectorIdSet = new Set();
    const itemsById = new Map();

    const entries = [];
    for await (const [name, entry] of handle.entries()) {
      if (entry.kind !== "file" || !name.toLowerCase().endsWith(".json")) {
        continue;
      }
      entries.push([name, entry]);
    }
    entries.sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true }));

    for (const [name, entry] of entries) {
      let data = null;
      try {
        data = await this.readJsonFileFromHandle(entry);
      } catch (error) {
        if (this.logger) {
          await this.logger.log("WARN", "fs", "Failed to read collector file", {
            name,
            message: error.message || "read failed"
          });
        }
        continue;
      }

      const collectorData = data?.collector || null;
      if (!collectorData) {
        continue;
      }

      let collector = this.normalizeCollectorData({
        ...collectorData,
        fileName: collectorData?.fileName || name
      });
      if (collectorIdSet.has(collector.id)) {
        collector = this.normalizeCollectorData({
          ...collector,
          id: crypto.randomUUID(),
          fileName: ""
        });
      }
      collectorIdSet.add(collector.id);

      const fileItems = Array.isArray(data?.items) ? data.items : [];
      const normalizedItems = fileItems.map((item) =>
        this.normalizeItemData(item, collector.id)
      );

      normalizedItems.forEach((next) => {
        const existing = itemsById.get(next.id);
        if (!existing) {
          itemsById.set(next.id, next);
          return;
        }
        const existingIds = Array.isArray(existing.collectorIds)
          ? existing.collectorIds
          : existing.collectorId
            ? [existing.collectorId]
            : [];
        const nextIds = Array.isArray(next.collectorIds)
          ? next.collectorIds
          : next.collectorId
            ? [next.collectorId]
            : [];
        const mergedIds = Array.from(new Set([...existingIds, ...nextIds]));
        let merged = existing;
        const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
        const nextTime = new Date(next.updatedAt || next.createdAt || 0).getTime();
        if (nextTime > existingTime) {
          merged = { ...next, collectorIds: mergedIds, collectorId: mergedIds[0] };
        } else {
          merged = { ...existing, collectorIds: mergedIds, collectorId: mergedIds[0] };
        }
        itemsById.set(next.id, merged);
      });

      collector.itemCount = normalizedItems.length;
      collectors.push(collector);
    }
    items.push(...itemsById.values());

    return { collectors, items };
  }

  async readLegacyCollectorsFromDirectory(handle) {
    const collectorsData = await this.tryReadJsonFile(handle, "collectors.json");
    if (!Array.isArray(collectorsData) || collectorsData.length === 0) {
      return { collectors: [], items: [], migrated: false };
    }

    const collectors = [];
    const items = [];
    const collectorIdSet = new Set();
    const itemIdSet = new Set();

    for (const rawCollector of collectorsData) {
      let collector = this.normalizeCollectorData(rawCollector);
      collector.fileName = buildCollectorFileName(collector);
      if (collectorIdSet.has(collector.id)) {
        collector = this.normalizeCollectorData({
          ...collector,
          id: crypto.randomUUID()
        });
      }
      collectorIdSet.add(collector.id);
      let collectorItems = [];
      try {
        const collectorDir = await handle.getDirectoryHandle(collector.name);
        const itemsData = await this.tryReadJsonFile(collectorDir, "items.json");
        collectorItems = Array.isArray(itemsData) ? itemsData : [];
      } catch (error) {
        collectorItems = [];
      }

      const normalizedItems = collectorItems.map((item) => {
        let next = this.normalizeItemData(item, collector.id);
        if (itemIdSet.has(next.id)) {
          next = this.normalizeItemData({
            ...next,
            id: crypto.randomUUID()
          }, collector.id);
        }
        itemIdSet.add(next.id);
        return next;
      });

      collector.itemCount = normalizedItems.length;
      collectors.push(collector);
      items.push(...normalizedItems);
    }

    return { collectors, items, migrated: true };
  }

  async loadCollectorsFromDisk() {
    const handle = await this.restoreCollectorDirectory();
    if (!handle) {
      return { loaded: false, collectors: [], items: [] };
    }

    let { collectors, items } = await this.readCollectorFilesFromDirectory(handle);
    let migratedLegacy = false;

    if (collectors.length === 0) {
      const legacy = await this.readLegacyCollectorsFromDirectory(handle);
      collectors = legacy.collectors;
      items = legacy.items;
      migratedLegacy = legacy.migrated;
    }

    if (collectors.length === 0) {
      const fallback = this.normalizeCollectorData({ name: "Default" });
      fallback.fileName = buildCollectorFileName(fallback);
      collectors = [fallback];
      items = [];
      await chrome.storage.local.set({
        [STORAGE_KEYS.COLLECTORS]: collectors,
        [STORAGE_KEYS.ITEMS]: items
      });
      await this.writeCollectorFileToDisk(fallback, [], handle);
      return { loaded: true, collectors, items, migratedLegacy };
    }

    await chrome.storage.local.set({
      [STORAGE_KEYS.COLLECTORS]: collectors,
      [STORAGE_KEYS.ITEMS]: items
    });

    if (migratedLegacy) {
      await this.writeAllCollectorsToDisk();
    }

    return { loaded: true, collectors, items, migratedLegacy };
  }

  recalcCollectorCounts(items, collectors) {
    const counts = new Map();
    items.forEach((item) => {
      const ids = Array.isArray(item.collectorIds) && item.collectorIds.length > 0
        ? item.collectorIds
        : item.collectorId
          ? [item.collectorId]
          : [];
      ids.forEach((id) => {
        counts.set(id, (counts.get(id) || 0) + 1);
      });
    });
    return collectors.map((collector) => ({
      ...collector,
      itemCount: counts.get(collector.id) || 0
    }));
  }

  async writeCollectorFileToDisk(collector, items, dirHandle = null) {
    const handle = dirHandle || (await this.restoreCollectorDirectory());
    if (!handle) return;
    const fileName = this.getCollectorFileName(collector);
    await this.writeJsonFile(handle, fileName, {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      collector,
      items
    });
  }

  async removeCollectorFileFromDisk(collector, dirHandle = null) {
    const handle = dirHandle || (await this.restoreCollectorDirectory());
    if (!handle) return;
    const fileName = this.getCollectorFileName(collector);
    try {
      await handle.removeEntry(fileName);
    } catch (error) {
      if (this.logger) {
        await this.logger.log("WARN", "fs", "Failed to remove collector file", {
          fileName,
          message: error.message || "removeEntry failed"
        });
      }
    }
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
      itemCount: 0,
      fileName: ""
    };
    collector.fileName = this.getCollectorFileName(collector);
    collectors.push(collector);
    await chrome.storage.local.set({ [STORAGE_KEYS.COLLECTORS]: collectors });
    await this.writeCollectorFileToDisk(collector, []);
    return collector;
  }

  async updateCollector(id, updates) {
    const collectors = await this.getCollectors();
    const current = collectors.find((collector) => collector.id === id) || null;
    const next = collectors.map((collector) => {
      if (collector.id !== id) return collector;
      const nextCollector = {
        ...collector,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      if (updates?.name && updates.name !== collector.name) {
        nextCollector.fileName = buildCollectorFileName(nextCollector);
      }
      return nextCollector;
    });
    await chrome.storage.local.set({ [STORAGE_KEYS.COLLECTORS]: next });
    const updated = next.find((collector) => collector.id === id) || null;
    const items = await this.getItems();
    if (updated) {
      await this.writeCollectorFileToDisk(
        updated,
        items.filter((item) => item.collectorId === updated.id)
      );
    }
    if (current && updates?.name && current.name !== updates.name) {
      const previousFile = this.getCollectorFileName(current);
      const nextFile = updated ? this.getCollectorFileName(updated) : previousFile;
      if (previousFile !== nextFile) {
        await this.removeCollectorFileFromDisk(current);
      }
    }
    return updated;
  }

  async deleteCollector(id) {
    const collectors = await this.getCollectors();
    const target = collectors.find((collector) => collector.id === id);
    const nextCollectors = collectors.filter((collector) => collector.id !== id);
    const items = await this.getItems();
    const nextItems = items
      .map((item) => {
        const ids = Array.isArray(item.collectorIds) && item.collectorIds.length > 0
          ? item.collectorIds
          : item.collectorId
            ? [item.collectorId]
            : [];
        if (!ids.includes(id)) return item;
        const filtered = ids.filter((collectorId) => collectorId !== id);
        if (filtered.length === 0) return null;
        return {
          ...item,
          collectorIds: filtered,
          collectorId: filtered[0],
          updatedAt: new Date().toISOString()
        };
      })
      .filter(Boolean);
    await chrome.storage.local.set({
      [STORAGE_KEYS.COLLECTORS]: this.recalcCollectorCounts(nextItems, nextCollectors),
      [STORAGE_KEYS.ITEMS]: nextItems
    });
    await this.writeAllCollectorsToDisk();
    if (target) {
      await this.removeCollectorFileFromDisk(target);
    }
    return true;
  }

  async saveItem(item) {
    const items = await this.getItems();
    const collectors = await this.getCollectors();
    const inputCollectorIds = Array.isArray(item.collectorIds)
      ? item.collectorIds.filter(Boolean)
      : item.collectorId
        ? [item.collectorId]
        : [];
    if (inputCollectorIds.length === 0) {
      throw new Error("Collector not found");
    }
    const targetCollectorIds = inputCollectorIds.filter((id) =>
      collectors.some((collector) => collector.id === id)
    );
    if (targetCollectorIds.length === 0) {
      throw new Error("Collector not found");
    }
    const nextItem = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [],
      shareUrl: null,
      shareEditCode: null,
      ...item,
      collectorIds: targetCollectorIds,
      collectorId: targetCollectorIds[0]
    };
    items.push(nextItem);
    const nextCollectors = this.recalcCollectorCounts(items, collectors).map(
      (collector) => ({
        ...collector,
        updatedAt: new Date().toISOString()
      })
    );
    await chrome.storage.local.set({
      [STORAGE_KEYS.ITEMS]: items,
      [STORAGE_KEYS.COLLECTORS]: nextCollectors
    });
    await this.writeAllCollectorsToDisk();
    return nextItem;
  }

  async updateItem(id, updates) {
    const items = await this.getItems();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error("Item not found");
    }
    const nextCollectorIds = Array.isArray(updates?.collectorIds)
      ? updates.collectorIds.filter(Boolean)
      : null;
    const collectorId = nextCollectorIds && nextCollectorIds.length > 0
      ? nextCollectorIds[0]
      : updates?.collectorId;
    const updatedItem = {
      ...items[index],
      ...updates,
      collectorIds:
        nextCollectorIds && nextCollectorIds.length > 0
          ? nextCollectorIds
          : updates?.collectorId
            ? [updates.collectorId]
            : items[index].collectorIds || (items[index].collectorId ? [items[index].collectorId] : []),
      collectorId: collectorId || items[index].collectorId,
      updatedAt: new Date().toISOString()
    };
    items[index] = updatedItem;
    const collectors = await this.getCollectors();
    const nextCollectors = this.recalcCollectorCounts(items, collectors).map(
      (collector) => ({
        ...collector,
        updatedAt: new Date().toISOString()
      })
    );
    await chrome.storage.local.set({
      [STORAGE_KEYS.ITEMS]: items,
      [STORAGE_KEYS.COLLECTORS]: nextCollectors
    });
    await this.writeAllCollectorsToDisk();
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
      items: items.filter((item) => {
        const ids = Array.isArray(item.collectorIds) && item.collectorIds.length > 0
          ? item.collectorIds
          : item.collectorId
            ? [item.collectorId]
            : [];
        return ids.includes(collectorId);
      })
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
          collectorId: targetCollectorId,
          collectorIds: [targetCollectorId]
        });
      });
    }

    nextCollectors = this.recalcCollectorCounts(nextItems, nextCollectors);

    await chrome.storage.local.set({
      [STORAGE_KEYS.COLLECTORS]: nextCollectors,
      [STORAGE_KEYS.ITEMS]: nextItems
    });
    await this.writeAllCollectorsToDisk();
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
    return handle;
  }

  async storeVaultDirectoryHandle(handle) {
    if (!handle) return null;
    await setHandle(STORAGE_KEYS.VAULT_HANDLE, handle);
    return handle;
  }

  async restoreCollectorDirectory() {
    const handle = await getHandle(STORAGE_KEYS.FS_HANDLE);
    if (isDirectoryHandle(handle)) {
      return handle;
    }
    if (handle) {
      await removeHandle(STORAGE_KEYS.FS_HANDLE);
    }
    return null;
  }

  async restoreVaultDirectory() {
    let handle = await getHandle(STORAGE_KEYS.VAULT_HANDLE);
    if (handle && !isDirectoryHandle(handle)) {
      await removeHandle(STORAGE_KEYS.VAULT_HANDLE);
      handle = null;
    }
    try {
      console.debug("restoreVaultDirectory handle:", handle);
    } catch (e) {
      await Promise.resolve();
    }
    return handle;
  }

  async getCollectorHandleState() {
    const idb = await getHandle(STORAGE_KEYS.FS_HANDLE);
    return {
      idb: summarizeHandle(idb)
    };
  }

  async getVaultHandleState() {
    const idb = await getHandle(STORAGE_KEYS.VAULT_HANDLE);
    return {
      idb: summarizeHandle(idb)
    };
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
      const items = await this.getItems();
      for (const collector of collectors) {
        const collectorItems = items.filter((item) => {
          const ids = Array.isArray(item.collectorIds) && item.collectorIds.length > 0
            ? item.collectorIds
            : item.collectorId
              ? [item.collectorId]
              : [];
          return ids.includes(collector.id);
        });
        await this.writeCollectorFileToDisk(collector, collectorItems, handle);
      }
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
      const items = allItems.filter((item) => {
        const ids = Array.isArray(item.collectorIds) && item.collectorIds.length > 0
          ? item.collectorIds
          : item.collectorId
            ? [item.collectorId]
            : [];
        return ids.includes(collector.id);
      });
      await this.writeCollectorFileToDisk(collector, items, handle);
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
    const nextCollectors = this.recalcCollectorCounts(nextItems, collectors).map(
      (collector) => ({
        ...collector,
        updatedAt: new Date().toISOString()
      })
    );
    await chrome.storage.local.set({
      [STORAGE_KEYS.ITEMS]: nextItems,
      [STORAGE_KEYS.COLLECTORS]: nextCollectors
    });
    await this.writeAllCollectorsToDisk();
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
