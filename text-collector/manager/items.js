export const createItemManager = ({
  storage,
  searchService,
  renderItems,
  updateSelectionState,
  showNotice,
  openEditModal,
  reloadItems,
  itemsTitle,
  itemList,
  selectAllInput,
  deleteSelectedButton,
  getActiveCollectorId,
  getSearchQuery,
  getSelectedIds,
  setCurrentResults,
  setAllItems,
  getAllItems
}) => {
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

  const refreshItems = () => {
    const searchQuery = getSearchQuery();
    const { items: searchResults, matchesById } =
      searchService.searchWithMatches(searchQuery);
    let results = searchResults;
    const activeCollectorId = getActiveCollectorId();
    if (activeCollectorId) {
      results = results.filter((item) => item.collectorId === activeCollectorId);
    }
    setCurrentResults(results);
    const label = searchQuery ? `Results (${results.length})` : "Items";
    itemsTitle.textContent = label;
    renderItems(itemList, results, getSelectedIds(), searchQuery, matchesById, {
      onEdit: (item) => handleItemEdit(item)
    });
    updateSelectionState(
      selectAllInput,
      deleteSelectedButton,
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
