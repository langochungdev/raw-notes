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

  async exportCollector(collectorId) {
    const collectors = await this.getCollectors();
    const items = await this.getItems();
    const collector = collectors.find((entry) => entry.id === collectorId);
    if (!collector) {
      throw new Error("Collector not found");
    }
    return {
      schemaVersion: 2,
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
    await setHandle(STORAGE_KEYS.FS_HANDLE, handle);
    return handle;
  }

  async requestVaultDirectory() {
    const handle = await window.showDirectoryPicker();
    await setHandle(STORAGE_KEYS.VAULT_HANDLE, handle);
    return handle;
  }

  async restoreCollectorDirectory() {
    return getHandle(STORAGE_KEYS.FS_HANDLE);
  }

  async restoreVaultDirectory() {
    const handle = await getHandle(STORAGE_KEYS.VAULT_HANDLE);
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
    const collectors = await this.getCollectors();
    await this.writeJsonFile(handle, "schema.json", {
      schemaVersion: 2
    });
    await this.writeJsonFile(handle, "collectors.json", collectors);
  }

  async writeCollectorItemsToDisk(collector, allItems, syncCollectors = true) {
    const handle = await this.restoreCollectorDirectory();
    if (!handle) return;
    const collectorDir = await handle.getDirectoryHandle(collector.name, {
      create: true
    });
    const items = allItems.filter((item) => item.collectorId === collector.id);
    await this.writeJsonFile(collectorDir, "items.json", items);
    if (syncCollectors) {
      await this.writeAllCollectorsToDisk();
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
    const fileHandle = await dirHandle.getFileHandle(fileName, {
      create: true
    });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  }
}
