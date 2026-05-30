const createIcon = (name) => {
  const icons = {
    folder: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" fill="currentColor"/></svg>`,
    file: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V7h3.5L13 3.5Z" fill="currentColor"/></svg>`,
    chevron: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    dots: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/></svg>`,
    add: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    folderPlus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 14v6M11 17h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
  };
  return icons[name] || "";
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

export const createVaultTree = ({
  treeRootEl,
  getRootHandle,
  getActivePath,
  getExpandedPaths,
  toggleExpandedPath,
  onOpenFile,
  onRenameEntry,
  onDeleteEntry,
  onStatsChange
}) => {
  const hiddenNames = new Set([".rawnotes-share", ".rawnotes-share.json"]);
  const isHiddenEntry = (entry) => entry.name.startsWith(".") || hiddenNames.has(entry.name);
  const menu = document.createElement("div");
  menu.className = "tree-menu hidden";
  document.body.appendChild(menu);

  let menuState = null;

  const hideMenu = () => {
    menu.classList.add("hidden");
    menu.innerHTML = "";
    menuState = null;
  };

  const openMenu = (anchor, entryInfo, labelEl) => {
    const rect = anchor.getBoundingClientRect();
    menuState = { entryInfo, labelEl };
    menu.innerHTML = `
      <button type="button" data-action="rename">Rename</button>
      <button type="button" data-action="delete" class="danger">Delete</button>
    `;
    menu.style.left = `${Math.min(rect.left, window.innerWidth - 180)}px`;
    menu.style.top = `${rect.bottom + 6}px`;
    menu.classList.remove("hidden");
  };

  const startRename = async (entryInfo, labelEl) => {
    if (!labelEl) return;
    const originalText = labelEl.textContent || "";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "tree-rename-input";
    input.value = originalText;
    labelEl.replaceWith(input);
    input.focus();
    input.select();

    const finish = async (apply) => {
      input.removeEventListener("blur", onBlur);
      input.removeEventListener("keydown", onKeydown);
      if (!apply) {
        input.replaceWith(labelEl);
        return;
      }
      const nextName = input.value.trim();
      if (nextName && nextName !== entryInfo.entry.name) {
        await onRenameEntry?.(entryInfo, nextName);
      } else {
        input.replaceWith(labelEl);
      }
    };

    const onBlur = () => {
      finish(true);
    };

    const onKeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    };

    input.addEventListener("blur", onBlur);
    input.addEventListener("keydown", onKeydown);
  };

  menu.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || !menuState) return;
    const action = button.dataset.action;
    const { entryInfo, labelEl } = menuState;
    hideMenu();
    if (action === "rename") {
      await startRename(entryInfo, labelEl);
    }
    if (action === "delete") {
      const ok = window.confirm(`Delete ${entryInfo.entry.name}?`);
      if (ok) {
        await onDeleteEntry?.(entryInfo);
      }
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!menu.classList.contains("hidden") && !menu.contains(event.target)) {
      hideMenu();
    }
  });

  const countFiles = async (dirHandle) => {
    let total = 0;
    for await (const child of dirHandle.values()) {
      if (isHiddenEntry(child)) {
        continue;
      }
      if (child.kind === "file") {
        total += 1;
      } else if (child.kind === "directory") {
        total += await countFiles(child);
      }
    }
    return total;
  };

  const renderEntry = async (entry, parentHandle, parentPath, depth) => {
    if (isHiddenEntry(entry)) {
      return null;
    }
    const currentPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    const isFolder = entry.kind === "directory";
    const isExpanded = getExpandedPaths().has(currentPath);
    const isActive = getActivePath() === currentPath;

    const node = document.createElement("div");
    node.className = `tree-node ${isActive ? "active" : ""}`;

    const row = document.createElement("div");
    row.className = "tree-row";
    row.style.setProperty("--tree-depth", String(depth));
    row.dataset.path = currentPath;
    row.dataset.kind = entry.kind;

    const left = document.createElement("div");
    left.className = "tree-row-left";

    const chevron = document.createElement("button");
    chevron.type = "button";
    chevron.className = "tree-chevron";
    chevron.innerHTML = createIcon("chevron");
    if (!isFolder) {
      chevron.classList.add("hidden");
    } else {
      chevron.style.transform = isExpanded ? "rotate(90deg)" : "rotate(0deg)";
      chevron.addEventListener("click", async (event) => {
        event.stopPropagation();
        toggleExpandedPath(currentPath);
        await renderTree();
      });
    }

    const icon = document.createElement("span");
    icon.className = `tree-icon ${isFolder ? "folder" : "file"}`;
    icon.innerHTML = createIcon(isFolder ? "folder" : "file");

    const label = document.createElement("button");
    label.type = "button";
    label.className = `tree-label ${isFolder ? "folder" : "file"}`;
    label.innerHTML = escapeHtml(entry.name);
    if (isFolder) {
      label.addEventListener("click", async () => {
        toggleExpandedPath(currentPath);
        await renderTree();
      });
    } else {
      label.addEventListener("click", async () => {
        await onOpenFile?.({
          handle: entry,
          parentHandle,
          path: currentPath
        });
      });
    }

    left.appendChild(chevron);
    left.appendChild(icon);
    left.appendChild(label);

    const more = document.createElement("button");
    more.type = "button";
    more.className = "tree-more ti ti-dots-vertical";
    more.innerHTML = createIcon("dots");
    more.addEventListener("click", (event) => {
      event.stopPropagation();
      openMenu(more, { entry, parentHandle, parentPath, currentPath }, label);
    });

    row.appendChild(left);
    row.appendChild(more);
    node.appendChild(row);

    if (isFolder && isExpanded) {
      const children = document.createElement("div");
      children.className = "tree-children";
      for await (const child of entry.values()) {
        const childNode = await renderEntry(child, entry, currentPath, depth + 1);
        if (childNode) {
          children.appendChild(childNode);
        }
      }
      node.appendChild(children);
    }

    return node;
  };

  const renderTree = async () => {
    hideMenu();
    const rootHandle = getRootHandle();
    treeRootEl.innerHTML = "";
    if (!rootHandle) {
      onStatsChange?.({ fileCount: 0 });
      return;
    }

    let totalFiles = 0;
    for await (const entry of rootHandle.values()) {
      if (isHiddenEntry(entry)) {
        continue;
      }
      const entryNode = await renderEntry(entry, rootHandle, "", 0);
      if (entryNode) {
        treeRootEl.appendChild(entryNode);
      }
      if (entry.kind === "file") {
        totalFiles += 1;
      } else if (entry.kind === "directory") {
        totalFiles += await countFiles(entry);
      }
    }
    onStatsChange?.({ fileCount: totalFiles });
  };

  return {
    renderTree,
    hideMenu
  };
};
