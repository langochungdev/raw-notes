export const recalcCollectorCounts = (items, collectors) => {
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
};

export const createCollectorManager = ({
  storage,
  collectorList,
  entryCollector,
  renderCollectors,
  getCollectorSelectMode,
  getSelectedCollectorIds,
  toggleCollectorSelected,
  getActiveCollectorId,
  setActiveCollectorId,
  getCollectors,
  setCollectors,
  loadItems,
  onActiveCollectorChange
}) => {
  const populateCollectorSelect = () => {
    entryCollector.innerHTML = "";
    getCollectors().forEach((collector) => {
      const option = document.createElement("option");
      option.value = collector.id;
      option.textContent = collector.name;
      entryCollector.appendChild(option);
    });
    if (getActiveCollectorId()) {
      entryCollector.value = getActiveCollectorId();
    }
  };

  const renderCollectorList = () => {
    renderCollectors(collectorList, getCollectors(), getActiveCollectorId(), {
      selectionMode: getCollectorSelectMode?.(),
      selectedCollectorIds: getSelectedCollectorIds?.(),
      onSelect: (id) => handleCollectorSelect(id),
      onToggleSelect: (id) => toggleCollectorSelected?.(id),
      onRename: (collector, nextName) => handleCollectorRename(collector, nextName),
      onDelete: (collector) => handleCollectorDelete(collector),
      onColor: (collector) => handleCollectorColor(collector)
    });
  };

  const normalizeColor = (value) => {
    if (!value) return null;
    const trimmed = value.trim();
    const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) return null;
    return withHash.toLowerCase();
  };

  const handleCollectorColor = async (collector) => {
    const input = window.prompt("Collector color (hex)", collector.color || "");
    if (input === null) return;
    const color = normalizeColor(input);
    if (!color || color === collector.color) return;
    await storage.updateCollector(collector.id, { color });
    await loadCollectors();
  };

  const handleCollectorRename = async (collector, nextName) => {
    const name = (nextName ?? window.prompt("New collector name", collector.name) ?? "").trim();
    if (!name || name === collector.name) return;
    await storage.updateCollector(collector.id, { name });
    await loadCollectors();
    await loadItems();
  };

  const handleCollectorDelete = async (collector) => {
    const ok = window.confirm(`Delete ${collector.name}?`);
    if (!ok) return;
    await storage.deleteCollector(collector.id);
    if (getActiveCollectorId() === collector.id) {
      setActiveCollectorId(null);
    }
    await loadCollectors();
    await loadItems();
  };

  const handleCollectorSelect = async (id) => {
    setActiveCollectorId(id);
    onActiveCollectorChange?.(id);
    await loadItems();
    renderCollectorList();
    populateCollectorSelect();
  };

  const loadCollectors = async () => {
    const collectors = await storage.getCollectors();
    setCollectors(collectors);
    if (!getActiveCollectorId() && collectors.length > 0) {
      setActiveCollectorId(collectors[0].id);
      onActiveCollectorChange?.(collectors[0].id);
    }
    renderCollectorList();
    populateCollectorSelect();
  };

  return {
    loadCollectors,
    renderCollectorList,
    populateCollectorSelect,
    handleCollectorRename,
    handleCollectorDelete,
    handleCollectorSelect
  };
};
