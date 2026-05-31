export const attachSelectionHandlers = ({
  itemList,
  selectAllInput,
  deleteSelectedButton,
  itemsCount,
  bulkMoveSelect,
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
  showNotice,
  updateSelectionState,
  storage,
  logger,
  doc,
  onSelectionChange
}) => {
  let pendingDelete = null;

  const notifySelectionChange = () => {
    onSelectionChange?.(selectedIds.size);
  };

  const updateBulkMoveSelect = () => {
    if (!bulkMoveSelect) return;
    const hasSelection = selectedIds.size > 0;
    bulkMoveSelect.classList.toggle("is-hidden", !hasSelection);
    bulkMoveSelect.disabled = !hasSelection;
    if (!hasSelection) return;
    const collectors = getAllCollectors();
    bulkMoveSelect.innerHTML = "";
    const placeholder = doc.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Move selected...";
    placeholder.disabled = true;
    placeholder.selected = true;
    bulkMoveSelect.appendChild(placeholder);
    collectors.forEach((collector) => {
      const option = doc.createElement("option");
      option.value = collector.id;
      option.textContent = collector.name || "Collector";
      bulkMoveSelect.appendChild(option);
    });
  };

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
    updateBulkMoveSelect();
    notifySelectionChange();
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
    updateBulkMoveSelect();
    notifySelectionChange();
  });

  bulkMoveSelect?.addEventListener("change", async () => {
    const targetId = bulkMoveSelect.value;
    bulkMoveSelect.value = "";
    if (!targetId) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const snapshot = {
      items: [...getAllItems()],
      collectors: [...getAllCollectors()]
    };

    const nextItems = getAllItems().map((item) =>
      selectedIds.has(item.id)
        ? {
            ...item,
            collectorIds: [targetId],
            collectorId: targetId,
            updatedAt: new Date().toISOString()
          }
        : item
    );

    setAllItems(nextItems);
    setAllCollectors(recalcCollectorCounts(nextItems, getAllCollectors()));
    selectedIds.clear();
    await searchService.index(nextItems);
    renderCollectors();
    refreshItems();
    updateBulkMoveSelect();
    notifySelectionChange();

    try {
      await Promise.all(ids.map((id) =>
        storage.updateItem(id, {
          collectorIds: [targetId],
          collectorId: targetId
        })
      ));
    } catch (error) {
      setAllItems(snapshot.items);
      setAllCollectors(snapshot.collectors);
      await searchService.index(snapshot.items);
      renderCollectors();
      refreshItems();
      updateBulkMoveSelect();
      notifySelectionChange();
      showNotice?.(doc, "Move failed");
      await logger.log("ERROR", "storage", "Bulk move failed", {
        message: error.message || "move failed"
      });
    }
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
    notifySelectionChange();

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

  updateBulkMoveSelect();
  notifySelectionChange();
};
