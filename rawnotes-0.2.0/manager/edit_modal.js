export const createEditModal = ({
  modal,
  saveButton,
  cancelButton,
  textInput,
  noteInput,
  collectorRow,
  collectorSelect,
  titleEl,
  errorEl,
  doc
}) => {
  let resolver = null;
  let isOpen = false;
  let mode = "edit";
  let selectedCollectorIds = new Set();

  if (collectorRow) {
    collectorRow.classList.add("hidden");
  }

  const setError = (message) => {
    errorEl.textContent = message || "";
  };

  const close = (result) => {
    if (!isOpen) return;
    isOpen = false;
    modal.classList.add("hidden");
    const currentResolver = resolver;
    resolver = null;
    if (currentResolver) {
      currentResolver(result || null);
    }
  };

  const open = (item) => {
    mode = "edit";
    if (isOpen) {
      close(null);
    }
    isOpen = true;
    if (titleEl) {
      titleEl.textContent = "Edit Item";
    }
    if (collectorRow) {
      collectorRow.classList.add("hidden");
    }
    textInput.value = item.text || "";
    noteInput.value = item.note || "";
    setError("");
    modal.classList.remove("hidden");
    textInput.focus();
    return new Promise((resolve) => {
      resolver = resolve;
    });
  };

  const setCollectorSelections = (ids) => {
    selectedCollectorIds = new Set(ids);
  };

  const renderCollectorPills = (collectors) => {
    if (!collectorSelect) return;
    collectorSelect.textContent = "";
    collectors.forEach((collector) => {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "collector-pill";
      button.textContent = collector.name;
      const collectorColor = collector.color || "#00eeff";
      button.style.setProperty("--collector-color", collectorColor);
      button.setAttribute("role", "option");
      const isSelected = selectedCollectorIds.has(collector.id);
      if (isSelected) {
        button.classList.add("is-selected");
      }
      button.setAttribute("aria-selected", isSelected ? "true" : "false");
      button.addEventListener("click", () => {
        if (selectedCollectorIds.has(collector.id)) {
          selectedCollectorIds.delete(collector.id);
        } else {
          selectedCollectorIds.add(collector.id);
        }
        const nextSelected = selectedCollectorIds.has(collector.id);
        button.classList.toggle("is-selected", nextSelected);
        button.setAttribute("aria-selected", nextSelected ? "true" : "false");
      });
      collectorSelect.appendChild(button);
    });
  };

  const openCreate = ({ collectors, activeCollectorId }) => {
    mode = "create";
    if (isOpen) {
      close(null);
    }
    isOpen = true;
    if (titleEl) {
      titleEl.textContent = "Add Entry";
    }
    if (collectorRow && collectorSelect) {
      collectorRow.classList.remove("hidden");
      const defaultIds = activeCollectorId
        ? [activeCollectorId]
        : collectors.length > 0
          ? [collectors[0].id]
          : [];
      setCollectorSelections(defaultIds);
      renderCollectorPills(collectors);
    }
    textInput.value = "";
    noteInput.value = "";
    setError("");
    modal.classList.remove("hidden");
    textInput.focus();
    return new Promise((resolve) => {
      resolver = resolve;
    });
  };

  const buildPayload = () => {
    const text = textInput.value.trim();
    if (!text) {
      setError("Text is required");
      return null;
    }
    const note = noteInput.value.trim();
    if (mode === "create" && collectorSelect) {
      const collectorIds = Array.from(selectedCollectorIds);
      if (collectorIds.length === 0) {
        setError("Select a collector");
        return null;
      }
      return {
        text,
        note,
        collectorIds
      };
    }
    return { text, note };
  };

  saveButton.addEventListener("click", () => {
    const payload = buildPayload();
    if (!payload) return;
    close(payload);
  });

  cancelButton.addEventListener("click", () => close(null));

  modal.addEventListener("pointerdown", (event) => {
    if (event.target === modal) {
      close(null);
    }
  });

  doc.addEventListener("keydown", (event) => {
    if (!isOpen) return;
    if (event.key === "Escape") {
      close(null);
    }
  });

  return { open, openCreate, close };
};
