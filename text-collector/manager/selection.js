export const attachSelectionHandlers = ({
  itemList,
  selectAllInput,
  deleteSelectedButton,
  itemsCount,
  getCurrentResults,
  selectedIds,
  getAllItems,
  setAllItems,
  getAllCollectors,
  setAllCollectors,
  recalcCollectorCounts,
  searchService,
  renderCollectors,
  refreshItems,
  showUndoToast,
  updateSelectionState,
  storage,
  logger,
  doc
}) => {
  let pendingDelete = null;

  const clearPendingDelete = () => {
    if (!pendingDelete) return;
    clearTimeout(pendingDelete.timeoutId);
    pendingDelete = null;
  };

  const restoreSnapshot = (snapshot) => {
    setAllItems(snapshot.items);
    setAllCollectors(snapshot.collectors);
    selectedIds.clear();
    searchService.index(snapshot.items).then(() => {
      renderCollectors();
      refreshItems();
    });
  };

  const finalizeDelete = async (ids, snapshot) => {
    try {
      await storage.deleteItems(ids);
      await logger.log("INFO", "storage", "Deleted items", {
        count: ids.length
      });
    } catch (error) {
      restoreSnapshot(snapshot);
    }
  };

  selectAllInput.addEventListener("change", () => {
    const currentResults = getCurrentResults();
    if (selectAllInput.checked) {
      currentResults.forEach((item) => selectedIds.add(item.id));
    } else {
      currentResults.forEach((item) => selectedIds.delete(item.id));
    }
    refreshItems();
  });

  itemList.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type !== "checkbox" || !target.dataset.id) return;
    if (target.checked) {
      selectedIds.add(target.dataset.id);
    } else {
      selectedIds.delete(target.dataset.id);
    }
    updateSelectionState(
      selectAllInput,
      deleteSelectedButton,
      itemsCount,
      getCurrentResults(),
      selectedIds
    );
  });

  deleteSelectedButton.addEventListener("click", async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (pendingDelete) {
      clearPendingDelete();
    }

    const snapshot = {
      items: [...getAllItems()],
      collectors: [...getAllCollectors()]
    };

    const nextItems = getAllItems().filter((item) => !selectedIds.has(item.id));
    setAllItems(nextItems);
    setAllCollectors(recalcCollectorCounts(nextItems, getAllCollectors()));
    selectedIds.clear();
    await searchService.index(nextItems);
    renderCollectors();
    refreshItems();

    const toast = showUndoToast(doc, `Deleted ${ids.length} items`, () => {
      clearPendingDelete();
      restoreSnapshot(snapshot);
    });

    const timeoutId = setTimeout(async () => {
      toast.remove();
      clearPendingDelete();
      await finalizeDelete(ids, snapshot);
    }, 6000);

    pendingDelete = { ids, timeoutId, snapshot };

    const handleOutsideClick = async (event) => {
      if (!pendingDelete || toast.contains(event.target)) return;
      toast.remove();
      clearPendingDelete();
      document.removeEventListener("pointerdown", handleOutsideClick, true);
      await finalizeDelete(ids, snapshot);
    };

    document.addEventListener("pointerdown", handleOutsideClick, true);
  });
};
