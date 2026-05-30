export const createEditModal = ({
  modal,
  saveButton,
  cancelButton,
  textInput,
  noteInput,
  tagsInput,
  errorEl,
  doc
}) => {
  let resolver = null;
  let isOpen = false;

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
    if (isOpen) {
      close(null);
    }
    isOpen = true;
    textInput.value = item.text || "";
    noteInput.value = item.note || "";
    tagsInput.value = (item.tags || []).join(", ");
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
    const tags = tagsInput.value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    return { text, note, tags };
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

  return { open, close };
};
