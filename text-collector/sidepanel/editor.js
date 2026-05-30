export const createEditorManager = ({
  fileNameInput,
  editorBody,
  rawEditor,
  getEditorMode,
  saveStatus,
  getRootHandle,
  onFileOpened,
  onFileClosed,
  onMarkDirty,
  onMarkSaved
}) => {
  let currentFileHandle = null;
  let currentParentHandle = null;
  let currentPath = "";
  let currentFileName = "";
  let saveTimer = null;

  const getEditorController = async () => {
    if (window.__rawNotesEditor) return window.__rawNotesEditor;
    if (window.__rawNotesEditorReady) {
      try {
        const controller = await window.__rawNotesEditorReady;
        return controller || window.__rawNotesEditor || null;
      } catch (error) {
        console.warn("Milkdown controller failed to initialize", error);
      }
    }
    return null;
  };

  const readEditorText = async () => {
    if (getEditorMode?.() === "raw" && rawEditor) {
      return rawEditor.value || "";
    }
    const controller = await getEditorController();
    if (controller?.getMarkdown) {
      return controller.getMarkdown();
    }
    return editorBody ? editorBody.innerText : "";
  };

  const writeEditorText = async (text) => {
    if (rawEditor) {
      rawEditor.value = text || "";
    }
    const controller = await getEditorController();
    if (controller?.setMarkdown) {
      await controller.setMarkdown(text || "");
      return;
    }
    if (editorBody) {
      editorBody.innerText = text || "";
    }
  };

  const setSaveStatus = (text) => {
    saveStatus.textContent = text;
  };

  const setEnabled = (enabled) => {
    if (!window.__rawNotesEditor && editorBody) {
      editorBody.contentEditable = enabled ? "true" : "false";
    }
    fileNameInput.disabled = !enabled;
    if (rawEditor) {
      rawEditor.disabled = !enabled;
    }
  };

  const sanitizeFileName = (name) => {
    return name
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const updateState = (handle, parentHandle, path) => {
    currentFileHandle = handle;
    currentParentHandle = parentHandle;
    currentPath = path || handle.name;
    currentFileName = handle.name;
    fileNameInput.value = handle.name;
  };

  const openFile = async ({ handle, parentHandle, path, focusTitle = false }) => {
    const file = await handle.getFile();
    const text = await file.text();
    updateState(handle, parentHandle, path);
    await writeEditorText(text);
    setEnabled(true);
    setSaveStatus("Saved");
    onMarkSaved?.();
    if (onFileOpened) {
      await onFileOpened({
        fileHandle: handle,
        parentHandle,
        path: path || handle.name,
        fileName: handle.name
      });
    }
    if (focusTitle) {
      fileNameInput.focus();
      fileNameInput.select();
    }
  };

  const writeCurrentFile = async () => {
    if (!currentFileHandle) return;
    setSaveStatus("Saving...");
    const writable = await currentFileHandle.createWritable();
    const toWrite = await readEditorText();
    await writable.write(toWrite);
    await writable.close();
    setSaveStatus("Saved");
    onMarkSaved?.();
  };

  const scheduleSave = () => {
    if (!currentFileHandle) return;
    onMarkDirty?.();
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      writeCurrentFile();
    }, 500);
  };

  const renameCurrentFile = async (nextName) => {
    if (!currentFileHandle || !currentParentHandle) return;
    const sanitized = sanitizeFileName(nextName || "");
    if (!sanitized) {
      fileNameInput.value = currentFileName;
      return;
    }
    const finalName = sanitized.endsWith(".md") ? sanitized : `${sanitized}.md`;
    if (finalName === currentFileName) return;
    const nextHandle = await currentParentHandle.getFileHandle(finalName, {
      create: true
    });
    const writable = await nextHandle.createWritable();
    await writable.write(await readEditorText());
    await writable.close();
    await currentParentHandle.removeEntry(currentFileHandle.name);
    updateState(nextHandle, currentParentHandle, currentPath.replace(/[^/]+$/, finalName));
    if (onFileOpened) {
      await onFileOpened({
        fileHandle: nextHandle,
        parentHandle: currentParentHandle,
        path: currentPath,
        fileName: finalName
      });
    }
    setSaveStatus("Saved");
    onMarkSaved?.();
  };

  const createNewFile = async ({ parentHandle = getRootHandle(), name } = {}) => {
    if (!parentHandle) return null;
    const timestamp = new Date();
    const iso = timestamp.toISOString().slice(0, 16).replace(/:/g, "-");
    const fileName = sanitizeFileName(name || `Untitled ${iso}`) || `Untitled ${iso}`;
    const finalName = fileName.endsWith(".md") ? fileName : `${fileName}.md`;
    const fileHandle = await parentHandle.getFileHandle(finalName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write("");
    await writable.close();
    await openFile({
      handle: fileHandle,
      parentHandle,
      path: finalName,
      focusTitle: true
    });
    return fileHandle;
  };

  const deleteCurrentFile = async () => {
    if (!currentFileHandle || !currentParentHandle) return false;
    const ok = window.confirm(`Delete ${currentFileName}?`);
    if (!ok) return false;
    await currentParentHandle.removeEntry(currentFileHandle.name);
    currentFileHandle = null;
    currentParentHandle = null;
    currentFileName = "";
    currentPath = "";
    fileNameInput.value = "";
    await writeEditorText("");
    setEnabled(false);
    setSaveStatus("");
    onMarkSaved?.();
    if (onFileClosed) {
      await onFileClosed();
    }
    return true;
  };

  const clearCurrentFile = async () => {
    currentFileHandle = null;
    currentParentHandle = null;
    currentFileName = "";
    currentPath = "";
    fileNameInput.value = "";
    await writeEditorText("");
    setEnabled(false);
    setSaveStatus("");
    onMarkSaved?.();
    if (onFileClosed) {
      await onFileClosed();
    }
  };

  const getCurrentFileName = () => currentFileName;
  const getCurrentPath = () => currentPath;
  const getCurrentFileHandle = () => currentFileHandle;
  const getCurrentText = async () => readEditorText();
  const setCurrentText = async (text) => {
    await writeEditorText(text || "");
  };
  const focusFileNameInput = () => {
    fileNameInput.focus();
    fileNameInput.select();
  };

  const focusEditor = async () => {
    if (getEditorMode?.() === "raw" && rawEditor) {
      rawEditor.focus();
      return;
    }
    const controller = await getEditorController();
    if (controller?.focus) {
      controller.focus();
      return;
    }
    editorBody?.focus();
  };

  const insertMarkdown = async (markdown) => {
    if (getEditorMode?.() === "raw" && rawEditor) {
      const value = rawEditor.value || "";
      const start = rawEditor.selectionStart ?? value.length;
      const end = rawEditor.selectionEnd ?? value.length;
      const insertText = markdown || "";
      rawEditor.value = value.slice(0, start) + insertText + value.slice(end);
      const cursorPos = start + insertText.length;
      rawEditor.selectionStart = cursorPos;
      rawEditor.selectionEnd = cursorPos;
      rawEditor.focus();
      scheduleSave();
      return;
    }
    const controller = await getEditorController();
    if (controller?.insertMarkdown) {
      controller.insertMarkdown(markdown || "");
      return;
    }
    if (editorBody) {
      editorBody.innerText += markdown || "";
      scheduleSave();
    }
  };

  const insertTemplate = async (template, marker = "[[CURSOR]]") => {
    const cursorMarker = marker || "[[CURSOR]]";
    const insertText = template || "";
    if (getEditorMode?.() === "raw" && rawEditor) {
      const value = rawEditor.value || "";
      const start = rawEditor.selectionStart ?? value.length;
      const end = rawEditor.selectionEnd ?? value.length;
      const markerIndex = insertText.indexOf(cursorMarker);
      const cleanText = markerIndex === -1 ? insertText : insertText.replace(cursorMarker, "");
      rawEditor.value = value.slice(0, start) + cleanText + value.slice(end);
      const cursorPos = start + (markerIndex === -1 ? cleanText.length : markerIndex);
      rawEditor.selectionStart = cursorPos;
      rawEditor.selectionEnd = cursorPos;
      rawEditor.focus();
      scheduleSave();
      return;
    }
    const controller = await getEditorController();
    if (controller?.insertTemplate) {
      controller.insertTemplate(insertText, cursorMarker);
      return;
    }
    if (editorBody) {
      editorBody.innerText += insertText.replace(cursorMarker, "");
      scheduleSave();
    }
  };

  const setReadOnly = async (readOnly) => {
    const controller = await getEditorController();
    if (controller?.setReadOnly) {
      controller.setReadOnly(Boolean(readOnly));
    }
  };

  return {
    openFile,
    scheduleSave,
    renameCurrentFile,
    createNewFile,
    deleteCurrentFile,
    clearCurrentFile,
    setEnabled,
    getCurrentFileName,
    getCurrentPath,
    getCurrentFileHandle,
    getCurrentText,
    setCurrentText,
    focusFileNameInput,
    focusEditor,
    insertMarkdown,
    insertTemplate,
    setReadOnly,
    writeCurrentFile
  };
};
