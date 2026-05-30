export const renderCollectors = (
  collectorList,
  collectors,
  activeCollectorId,
  actions
) => {
  collectorList.innerHTML = "";
  collectors.forEach((collector) => {
    const card = document.createElement("div");
    card.className = "collector-card";
    if (collector.id === activeCollectorId) {
      card.classList.add("active");
    }
    card.role = "button";
    card.tabIndex = 0;
    const name = document.createElement("div");
    name.className = "collector-name";
    name.textContent = collector.name;
    const swatch = document.createElement("span");
    swatch.className = "collector-color";
    swatch.style.background = collector.color || "#d97706";
    name.prepend(swatch);
    const meta = document.createElement("div");
    meta.className = "collector-meta";
    meta.textContent = `${collector.itemCount || 0} items`;
    const info = document.createElement("div");
    info.className = "collector-info";
    info.appendChild(name);
    info.appendChild(meta);
    const actionRow = document.createElement("div");
    actionRow.className = "collector-actions-row";
    const colorButton = document.createElement("button");
    colorButton.type = "button";
    colorButton.className = "collector-action";
    colorButton.textContent = "Color";
    colorButton.addEventListener("click", (event) => {
      event.stopPropagation();
      actions?.onColor?.(collector);
    });
    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.className = "collector-action";
    renameButton.textContent = "Rename";
    renameButton.addEventListener("click", (event) => {
      event.stopPropagation();
      actions?.onRename?.(collector);
    });
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "collector-action danger";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      actions?.onDelete?.(collector);
    });
    actionRow.appendChild(colorButton);
    actionRow.appendChild(renameButton);
    actionRow.appendChild(deleteButton);
    card.appendChild(info);
    card.appendChild(actionRow);
    card.addEventListener("click", () => actions?.onSelect?.(collector.id));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        actions?.onSelect?.(collector.id);
      }
    });
    collectorList.appendChild(card);
  });
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const renderHighlightedText = (container, text, terms) => {
  container.textContent = "";
  if (!text) return;
  if (!terms || terms.length === 0) {
    container.textContent = text;
    return;
  }
  const pattern = new RegExp(
    `(${terms.map((term) => escapeRegex(term)).join("|")})`,
    "gi"
  );
  let lastIndex = 0;
  let match = pattern.exec(text);
  while (match) {
    if (match.index > lastIndex) {
      container.appendChild(
        document.createTextNode(text.slice(lastIndex, match.index))
      );
    }
    const highlight = document.createElement("span");
    highlight.className = "text-highlight";
    highlight.textContent = match[0];
    container.appendChild(highlight);
    lastIndex = match.index + match[0].length;
    match = pattern.exec(text);
  }
  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
};

export const renderItems = (
  itemList,
  items,
  selectedIds,
  searchQuery,
  matchesById,
  actions
) => {
  itemList.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "item-empty";
    empty.textContent = searchQuery ? "No results" : "No items yet";
    itemList.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "item-card";
    const select = document.createElement("label");
    select.className = "item-select";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.id = item.id;
    checkbox.checked = selectedIds.has(item.id);
    select.appendChild(checkbox);
    const content = document.createElement("div");
    content.className = "item-content";
    const terms = matchesById?.get(item.id) || [];
    const text = document.createElement("div");
    text.className = "item-text";
    renderHighlightedText(text, item.text || "", terms);
    const source = document.createElement("div");
    source.className = "item-source";
    renderHighlightedText(
      source,
      item.source?.title || item.source?.url || "No source",
      terms
    );
    content.appendChild(text);
    if (item.note) {
      const note = document.createElement("div");
      note.className = "item-note";
      renderHighlightedText(note, item.note, terms);
      content.appendChild(note);
    }
    if (item.tags && item.tags.length > 0) {
      const tags = document.createElement("div");
      tags.className = "item-tags";
      item.tags.forEach((tag) => {
        const pill = document.createElement("span");
        pill.className = "item-tag";
        pill.textContent = tag;
        tags.appendChild(pill);
      });
      content.appendChild(tags);
    }
    if (actions?.onEdit) {
      const actionRow = document.createElement("div");
      actionRow.className = "item-actions";
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "item-action";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => actions.onEdit(item));
      actionRow.appendChild(editButton);
      content.appendChild(actionRow);
    }
    content.appendChild(source);
    card.appendChild(select);
    card.appendChild(content);
    itemList.appendChild(card);
  });
};

export const updateSelectionState = (
  selectAllInput,
  deleteSelectedButton,
  currentResults,
  selectedIds
) => {
  const total = currentResults.length;
  const selected = currentResults.filter((item) => selectedIds.has(item.id))
    .length;
  selectAllInput.indeterminate = selected > 0 && selected < total;
  selectAllInput.checked = total > 0 && selected === total;
  deleteSelectedButton.disabled = selectedIds.size === 0;
};

export const showUndoToast = (doc, message, onUndo) => {
  const toast = doc.createElement("div");
  toast.className = "toast";
  const text = doc.createElement("div");
  text.textContent = message;
  const undo = doc.createElement("button");
  undo.type = "button";
  undo.textContent = "Undo";
  undo.addEventListener("click", () => {
    toast.remove();
    onUndo();
  });
  toast.appendChild(text);
  toast.appendChild(undo);
  doc.body.appendChild(toast);
  return toast;
};

export const showNotice = (doc, message) => {
  const toast = doc.createElement("div");
  toast.className = "toast";
  const text = doc.createElement("div");
  text.textContent = message;
  toast.appendChild(text);
  doc.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
};
