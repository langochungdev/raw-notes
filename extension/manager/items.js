export const createItemManager = ({
  storage,
  searchService,
  renderItems,
  updateSelectionState,
  showNotice,
  openEditModal,
  onCopyShare,
  onCopyText,
  reloadItems,
  itemsTitle,
  itemList,
  selectAllInput,
  deleteSelectedButton,
  itemsCount,
  getActiveCollectorId,
  getSearchCollectorIds,
  getSearchQuery,
  getSelectedIds,
  setCurrentResults,
  setAllItems,
  getAllItems,
  getAllCollectors,
  setAllCollectors,
  recalcCollectorCounts,
  renderCollectors
}) => {
  const getItemCollectorIds = (item) => {
    if (Array.isArray(item.collectorIds) && item.collectorIds.length > 0) {
      return item.collectorIds;
    }
    if (item.collectorId) {
      return [item.collectorId];
    }
    return [];
  };

  const handleItemEdit = async (item) => {
    const nextValues = await openEditModal(item);
    if (!nextValues) return;
    const { text, note, tags } = nextValues;
    const snapshot = [...getAllItems()];
    const updatedItems = getAllItems().map((entry) =>
      entry.id === item.id
        ? {
            ...entry,
            text,
            note,
            tags,
            updatedAt: new Date().toISOString()
          }
        : entry
    );
    setAllItems(updatedItems);
    await searchService.index(updatedItems);
    refreshItems();
    try {
      await storage.updateItem(item.id, { text, note, tags });
      await reloadItems?.();
    } catch (error) {
      setAllItems(snapshot);
      await searchService.index(snapshot);
      refreshItems();
      showNotice(document, "Update failed");
    }
  };

  const handleAddCollector = async (item, collectorId) => {
    if (!collectorId) return;
    const currentIds = new Set(getItemCollectorIds(item));
    if (currentIds.has(collectorId)) return;
    const now = new Date().toISOString();
    const snapshotItems = [...getAllItems()];
    const snapshotCollectors = getAllCollectors ? [...getAllCollectors()] : null;
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimisticItem = {
      id: tempId,
      collectorId,
      collectorIds: [collectorId],
      text: item.text || "",
      note: item.note || "",
      tags: Array.isArray(item.tags) ? item.tags : [],
      source: item.source || null,
      createdAt: now,
      updatedAt: now,
      shareUrl: null,
      shareEditCode: null
    };
    const updatedItems = [...getAllItems(), optimisticItem];
    setAllItems(updatedItems);
    if (setAllCollectors && recalcCollectorCounts && getAllCollectors) {
      setAllCollectors(recalcCollectorCounts(updatedItems, getAllCollectors()));
      renderCollectors?.();
    }
    await searchService.index(updatedItems);
    refreshItems();
    try {
      const saved = await storage.saveItem({
        collectorId,
        collectorIds: [collectorId],
        text: optimisticItem.text,
        note: optimisticItem.note,
        tags: optimisticItem.tags,
        source: optimisticItem.source
      });
      if (reloadItems) {
        await reloadItems();
        return;
      }
      const finalItems = getAllItems()
        .filter((entry) => entry.id !== tempId)
        .concat(saved);
      setAllItems(finalItems);
      if (setAllCollectors && recalcCollectorCounts && getAllCollectors) {
        setAllCollectors(recalcCollectorCounts(finalItems, getAllCollectors()));
        renderCollectors?.();
      }
      await searchService.index(finalItems);
      refreshItems();
    } catch (error) {
      setAllItems(snapshotItems);
      if (snapshotCollectors && setAllCollectors) {
        setAllCollectors(snapshotCollectors);
        renderCollectors?.();
      }
      await searchService.index(snapshotItems);
      refreshItems();
      showNotice(document, "Update failed");
    }
  };

  const handleItemDelete = async (item) => {
    if (!item?.id) return;
    const snapshot = [...getAllItems()];
    const selectedIds = getSelectedIds();
    selectedIds?.delete(item.id);
    const nextItems = snapshot.filter((entry) => entry.id !== item.id);
    setAllItems(nextItems);
    await searchService.index(nextItems);
    refreshItems();
    try {
      await storage.deleteItems([item.id]);
      await reloadItems?.();
    } catch (error) {
      setAllItems(snapshot);
      await searchService.index(snapshot);
      refreshItems();
      showNotice(document, "Delete failed");
    }
  };

  const refreshItems = () => {
    const searchQuery = getSearchQuery();
    const { items: searchResults, matchesById } =
      searchService.searchWithMatches(searchQuery);
    let results = searchResults;
    const searchCollectorIds = getSearchCollectorIds?.() || [];
    const isAllCollectors =
      searchCollectorIds.length === 0 || searchCollectorIds.includes("__all__");
    if (!isAllCollectors) {
      const allowed = new Set(searchCollectorIds);
      results = results.filter((item) => {
        const ids = getItemCollectorIds(item);
        return ids.some((id) => allowed.has(id));
      });
    } else {
      const activeCollectorId = getActiveCollectorId();
      if (activeCollectorId) {
        results = results.filter((item) =>
          getItemCollectorIds(item).includes(activeCollectorId)
        );
      }
    }
    setCurrentResults(results);
    const label = searchQuery ? `Results (${results.length})` : "Items";
    itemsTitle.textContent = label;
    renderItems(itemList, results, getSelectedIds(), searchQuery, matchesById, {
      onEdit: (item) => handleItemEdit(item),
      onCopyShare,
      onCopyText,
      onDelete: (item) => handleItemDelete(item),
      onAddCollector: (item, collectorId) => handleAddCollector(item, collectorId),
      getCollectors: getAllCollectors
    });
    updateSelectionState(
      selectAllInput,
      deleteSelectedButton,
      itemsCount,
      results,
      getSelectedIds()
    );
  };

  const loadItems = async () => {
    const items = await storage.getItems();
    setAllItems(items);
    await searchService.index(items);
    refreshItems();
  };

  return {
    loadItems,
    refreshItems
  };
};
