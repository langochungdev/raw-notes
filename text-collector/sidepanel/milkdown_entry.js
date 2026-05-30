import { Editor, rootCtx, defaultValueCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { replaceAll, insert } from "@milkdown/kit/utils";

export async function mountMilkdownEditor(root, options = {}) {
  if (!root) {
    throw new Error("Milkdown root element is required");
  }

  const state = {
    editor: null,
    onChange: typeof options.onChange === "function" ? options.onChange : null,
    suppressChange: false,
    currentMarkdown: options.initialMarkdown || ""
  };

  const create = async (markdown) => {
    const editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, markdown || "");
      })
      .config((ctx) => {
        const listenerApi = ctx.get(listenerCtx);
        listenerApi.markdownUpdated((ctx2, nextMarkdown, prevMarkdown) => {
          if (state.suppressChange) {
            return;
          }
          if (nextMarkdown !== prevMarkdown) {
            state.currentMarkdown = nextMarkdown;
            state.onChange?.(nextMarkdown);
          }
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
      .create();

    state.editor = editor;
    return editor;
  };

  await create(state.currentMarkdown);

  const controller = {
    async setMarkdown(markdown) {
      const nextMarkdown = markdown || "";
      state.currentMarkdown = nextMarkdown;
      if (!state.editor) {
        await create(nextMarkdown);
        return;
      }
      state.suppressChange = true;
      try {
        state.editor.action(replaceAll(nextMarkdown, true));
      } finally {
        queueMicrotask(() => {
          state.suppressChange = false;
        });
      }
    },
    insertMarkdown(markdown) {
      if (!state.editor) return;
      state.editor.action(insert(markdown || "", true));
    },
    getMarkdown() {
      return state.currentMarkdown;
    },
    focus() {
      state.editor?.action((ctx) => {
        const view = ctx.get("editorView");
        view?.focus();
      });
    },
    destroy() {
      state.editor?.destroy?.();
      state.editor = null;
    }
  };

  return controller;
}

export async function bootstrapMilkdownEditor(root, options = {}) {
  const controller = await mountMilkdownEditor(root, options);
  window.__rawNotesEditor = controller;
  return controller;
}
