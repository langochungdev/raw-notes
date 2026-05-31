window.__rawNotesEditorReady = (async () => {
  const root = document.getElementById("editor-body");
  if (!root) return;

  try {
    const milkdownModule = await import("../vendor/milkdown.bundle.js");
    if (milkdownModule?.bootstrapMilkdownEditor) {
      const controller = await milkdownModule.bootstrapMilkdownEditor(root, {
        initialMarkdown: root.innerText || "",
        onChange: (markdown) => {
          try {
            const event = new CustomEvent("textcollector:markdown-change", {
              detail: { markdown }
            });
            window.dispatchEvent(event);
          } catch (error) {
            console.warn("Milkdown change dispatch failed:", error);
          }
        }
      });
      window.__rawNotesEditor = controller;
      console.info("Milkdown: initialized from local bundle");
      return controller;
    }
  } catch (err) {
    console.warn("Milkdown local bundle failed:", err);
  }

  console.info("Milkdown not available; using contenteditable fallback");
  return null;
})();
