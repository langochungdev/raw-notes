export const attachManualEntry = ({
  triggerButton,
  openModal,
  storage,
  searchService,
  getActiveCollectorId,
  getAllItems,
  setAllItems,
  getAllCollectors,
  setAllCollectors,
  recalcCollectorCounts,
  renderCollectors,
  refreshItems,
  reloadItems,
  showNotice,
  doc
}) => {
  const handleOpen = async () => {
    const collectors = getAllCollectors();
    if (collectors.length === 0) {
      showNotice(doc, "Create a collector first");
      return;
    }
    const payload = await openModal({
      collectors,
      activeCollectorId: getActiveCollectorId()
    });
    if (!payload) return;
    const { text, note, collectorId } = payload;
    if (!collectorId) {
      showNotice(doc, "Select a collector");
      return;
    }
    const tempId = `temp-${crypto.randomUUID()}`;
    const snapshot = {
      items: [...getAllItems()],
      collectors: [...getAllCollectors()]
    };
    const optimisticItem = {
      id: tempId,
      collectorId,
      collectorIds: [collectorId],
      text,
      note,
      source: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const optimisticItems = [...getAllItems(), optimisticItem];
    setAllItems(optimisticItems);
    setAllCollectors(recalcCollectorCounts(optimisticItems, getAllCollectors()));
    await searchService.index(optimisticItems);
    renderCollectors();
    refreshItems();

    try {
      const saved = await storage.saveItem({
        collectorId,
        collectorIds: [collectorId],
        text,
        note,
        source: null
      });
      if (reloadItems) {
        await reloadItems();
        return;
      }
      const updatedItems = getAllItems()
        .filter((item) => item.id !== tempId)
        .concat(saved);
      setAllItems(updatedItems);
      setAllCollectors(recalcCollectorCounts(updatedItems, getAllCollectors()));
      await searchService.index(updatedItems);
      renderCollectors();
      refreshItems();
    } catch (error) {
      setAllItems(snapshot.items);
      setAllCollectors(snapshot.collectors);
      await searchService.index(snapshot.items);
      renderCollectors();
      refreshItems();
      showNotice(doc, "Save failed");
    }
  };

  triggerButton.addEventListener("click", handleOpen);
};
