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
      collectorSelect.innerHTML = "";
      collectors.forEach((collector) => {
        const option = doc.createElement("option");
        option.value = collector.id;
        option.textContent = collector.name;
        collectorSelect.appendChild(option);
      });
      if (activeCollectorId) {
        collectorSelect.value = activeCollectorId;
      }
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
      return {
        text,
        note,
        collectorId: collectorSelect.value || null
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
