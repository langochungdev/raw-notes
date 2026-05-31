import { SCHEMA_VERSION, STORAGE_KEYS } from "./constants.js";

const MIGRATIONS = {
  1: (data) => data,
  2: (data) => ({
    ...data,
    items: (data.items || []).map((item) => ({
      tags: [],
      ...item
    }))
  }),
  3: (data) => ({
    ...data,
    items: (data.items || []).map((item) => ({
      ...item,
      shareUrl: item.shareUrl || null,
      shareEditCode: item.shareEditCode || null
    }))
  }),
  4: (data) => ({
    ...data,
    items: (data.items || []).map((item) => ({
      ...item,
      location: item.location || null
    }))
  })
};

export async function checkAndMigrateSchema(logger) {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.SCHEMA,
    STORAGE_KEYS.ITEMS
  ]);

  const schema = stored[STORAGE_KEYS.SCHEMA];
  const currentVersion = schema?.schemaVersion || 1;
  const items = stored[STORAGE_KEYS.ITEMS] || [];

  if (currentVersion >= SCHEMA_VERSION) {
    if (!schema) {
      await chrome.storage.local.set({
        [STORAGE_KEYS.SCHEMA]: { schemaVersion: SCHEMA_VERSION }
      });
    }
    return { schemaVersion: SCHEMA_VERSION, items };
  }

  let data = { items };
  for (let version = currentVersion + 1; version <= SCHEMA_VERSION; version += 1) {
    const migrate = MIGRATIONS[version];
    if (migrate) {
      data = migrate(data);
    }
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.ITEMS]: data.items,
    [STORAGE_KEYS.SCHEMA]: { schemaVersion: SCHEMA_VERSION }
  });

  if (logger) {
    await logger.log("INFO", "schema", "Migrated schema", {
      from: currentVersion,
      to: SCHEMA_VERSION
    });
  }

  return { schemaVersion: SCHEMA_VERSION, items: data.items };
}
