import { LOG_LIMIT, STORAGE_KEYS } from "./constants.js";

export class Logger {
  async log(level, module, message, data = null) {
    try {
      const entry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level,
        module,
        message,
        data
      };
      const stored = await chrome.storage.local.get(STORAGE_KEYS.LOGS);
      const logs = stored[STORAGE_KEYS.LOGS] || [];
      logs.push(entry);
      const trimmed = logs.slice(-LOG_LIMIT);
      await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: trimmed });
      return entry;
    } catch (error) {
      throw error;
    }
  }

  async getLogs(filter = {}) {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.LOGS);
    const logs = stored[STORAGE_KEYS.LOGS] || [];
    const { level, module } = filter;
    return logs.filter((entry) => {
      if (level && entry.level !== level) return false;
      if (module && entry.module !== module) return false;
      return true;
    });
  }

  async clearLogs() {
    await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: [] });
  }

  async copyLogs() {
    const logs = await this.getLogs();
    return JSON.stringify(logs, null, 2);
  }
}
