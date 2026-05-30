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
    const selectionMode = actions?.selectionMode;
    const selectedCollectorIds = actions?.selectedCollectorIds;
    let selectInput = null;
    if (selectionMode) {
      selectInput = document.createElement("input");
      selectInput.type = "checkbox";
      selectInput.className = "collector-select";
      selectInput.checked = selectedCollectorIds?.has(collector.id) || false;
      selectInput.addEventListener("click", (event) => {
        event.stopPropagation();
        actions?.onToggleSelect?.(collector.id);
      });
    }
    const swatch = document.createElement("span");
    swatch.className = "collector-color";
    swatch.style.background = collector.color || "#d9a441";
    const name = document.createElement("div");
    name.className = "collector-name";
    name.textContent = collector.name;
    const info = document.createElement("div");
    info.className = "collector-info";
    if (selectInput) {
      info.appendChild(selectInput);
    }
    info.appendChild(swatch);
    info.appendChild(name);
    const count = document.createElement("div");
    count.className = "collector-count";
    count.textContent = `${collector.itemCount || 0}`;
    card.appendChild(info);
    card.appendChild(count);
    card.addEventListener("click", () => {
      if (selectionMode) {
        actions?.onToggleSelect?.(collector.id);
        return;
      }
      actions?.onSelect?.(collector.id);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (selectionMode) {
          actions?.onToggleSelect?.(collector.id);
        } else {
          actions?.onSelect?.(collector.id);
        }
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

const formatRelativeTime = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const diffMs = Date.now() - date.getTime();
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
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
    content.appendChild(text);
    if (item.note) {
      const note = document.createElement("div");
      note.className = "item-note";
      renderHighlightedText(note, item.note, terms);
      content.appendChild(note);
    }
    const meta = document.createElement("div");
    meta.className = "item-meta";
    const sourceUrl = item.source?.url || "";
    const sourceLabel = item.source?.url || item.source?.title || "No source";
    const source = sourceUrl ? document.createElement("a") : document.createElement("div");
    source.className = "item-source";
    if (sourceUrl && source instanceof HTMLAnchorElement) {
      source.href = sourceUrl;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
    }
    renderHighlightedText(source, sourceLabel, terms);
    const time = document.createElement("div");
    time.className = "item-time";
    time.textContent = formatRelativeTime(item.updatedAt || item.createdAt);
    meta.appendChild(source);
    meta.appendChild(time);
    if (item.tags && item.tags.length > 0) {
      const tags = document.createElement("div");
      tags.className = "item-tags";
      item.tags.forEach((tag) => {
        const pill = document.createElement("span");
        pill.className = "item-tag";
        pill.textContent = tag;
        tags.appendChild(pill);
      });
      meta.appendChild(tags);
    }
    if (item.shareUrl) {
      const shareRow = document.createElement("div");
      shareRow.className = "item-share";
      const shareIcon = document.createElement("span");
      shareIcon.className = "item-share-icon";
      shareIcon.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 12a5 5 0 0 1 5-5h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <path d="M17 12a5 5 0 0 1-5 5H9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <path d="M8 12h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      `;
      const shareText = document.createElement("div");
      shareText.className = "item-share-text";
      shareText.textContent = "Shared";
      shareRow.appendChild(shareIcon);
      shareRow.appendChild(shareText);
      if (actions?.onCopyShare) {
        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.className = "item-share-copy";
        copyButton.textContent = "Copy link";
        copyButton.addEventListener("click", () => actions.onCopyShare(item));
        shareRow.appendChild(copyButton);
      }
      content.appendChild(shareRow);
    }
    content.appendChild(meta);
    card.appendChild(select);
    card.appendChild(content);
    if (actions?.onEdit || actions?.onCopyText) {
      const actionRow = document.createElement("div");
      actionRow.className = "item-actions";
      if (actions?.onCopyText) {
        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.className = "item-action";
        copyButton.textContent = "Copy";
        copyButton.addEventListener("click", () => actions.onCopyText(item));
        actionRow.appendChild(copyButton);
      }
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "item-action";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => actions.onEdit(item));
      actionRow.appendChild(editButton);
      card.appendChild(actionRow);
    }
    itemList.appendChild(card);
  });
};

export const updateSelectionState = (
  selectAllInput,
  deleteSelectedButton,
  itemsCount,
  currentResults,
  selectedIds
) => {
  const total = currentResults.length;
  const selected = currentResults.filter((item) => selectedIds.has(item.id))
    .length;
  selectAllInput.indeterminate = selected > 0 && selected < total;
  selectAllInput.checked = total > 0 && selected === total;
  deleteSelectedButton.disabled = selectedIds.size === 0;
  deleteSelectedButton.classList.toggle("is-hidden", selectedIds.size === 0);
  if (itemsCount) {
    itemsCount.textContent = `${total} items`;
  }
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
