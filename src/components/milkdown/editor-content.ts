import { editorViewOptionsCtx } from '@milkdown/kit/core';
import type { Ctx, MilkdownPlugin } from '@milkdown/kit/ctx';
import { uploadConfig } from '@milkdown/kit/plugin/upload';
import { listItemSchema } from '@milkdown/kit/preset/commonmark';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import {
  Decoration,
  DecorationSet,
  type EditorView,
  type NodeViewConstructor,
} from '@milkdown/kit/prose/view';
import { $prose, $view } from '@milkdown/kit/utils';

interface EditorContentOptions {
  readonly: () => boolean;
  onError: (message: string) => void;
}

export interface EditorContent {
  plugins: MilkdownPlugin[];
  configure: (ctx: Ctx) => void;
  readonlyChanged: () => void;
  destroy: () => void;
}

const FILE_UPLOAD_MESSAGE = '请通过添加附件上传文件';

function hasOtherFiles(files: FileList | undefined): boolean {
  return !!files && Array.from(files).some((file) => !file.type.startsWith('image/'));
}

export function createEditorContent(options: EditorContentOptions): EditorContent {
  const guardKey = new PluginKey('voex-editor-content');
  const readers = new Set<FileReader>();
  const taskRefreshers = new Set<() => void>();
  let currentView: EditorView | null = null;
  let disposed = false;
  let readonlyEpoch = 0;

  const isReadonly = () => disposed || options.readonly();

  function cancelReaders() {
    Array.from(readers).forEach((reader) => reader.abort());
  }

  function readImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      readers.add(reader);

      const cleanup = () => {
        readers.delete(reader);
        reader.onload = null;
        reader.onerror = null;
        reader.onabort = null;
      };

      reader.onload = () => {
        const result = reader.result;
        cleanup();
        if (typeof result === 'string') resolve(result);
        else reject(new Error('图片读取失败，请重试'));
      };
      reader.onerror = () => {
        cleanup();
        reject(new Error('图片读取失败，请重试'));
      };
      reader.onabort = () => {
        cleanup();
        reject(new Error('图片读取已取消'));
      };

      try {
        reader.readAsDataURL(file);
      } catch (cause) {
        cleanup();
        reject(cause);
      }
    });
  }

  const createListItemView: NodeViewConstructor = (initialNode, view, getPos) => {
    let node = initialNode;
    const isTask = typeof node.attrs.checked === 'boolean';
    const dom = document.createElement('li');
    const contentDOM = isTask ? document.createElement('div') : dom;
    const checkbox = isTask ? document.createElement('input') : null;

    const refresh = () => {
      dom.dataset.label = String(node.attrs.label);
      dom.dataset.listType = String(node.attrs.listType);
      dom.dataset.spread = String(node.attrs.spread);
      if (!checkbox) return;

      dom.dataset.itemType = 'task';
      dom.dataset.checked = String(node.attrs.checked);
      checkbox.checked = node.attrs.checked === true;
      checkbox.disabled = isReadonly();
      checkbox.setAttribute('aria-label', checkbox.checked ? '标记为未完成' : '标记为完成');
    };

    if (checkbox) {
      checkbox.type = 'checkbox';
      checkbox.className = 'milkdown-editor__task-checkbox';
      checkbox.contentEditable = 'false';
      contentDOM.className = 'milkdown-editor__list-content';
      checkbox.onmousedown = (event) => event.preventDefault();
      checkbox.onchange = () => {
        const pos = getPos();
        if (isReadonly() || view.isDestroyed || pos === undefined) {
          refresh();
          return;
        }

        view.dispatch(
          view.state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            checked: checkbox.checked,
          })
        );
        view.focus();
      };
      dom.append(checkbox, contentDOM);
      taskRefreshers.add(refresh);
    }
    refresh();

    return {
      dom,
      contentDOM,
      update(nextNode) {
        if (nextNode.type !== node.type || (typeof nextNode.attrs.checked === 'boolean') !== isTask)
          return false;

        node = nextNode;
        refresh();
        return true;
      },
      stopEvent: (event) => event.target === checkbox,
      ignoreMutation: (mutation) =>
        mutation.type !== 'selection' &&
        (mutation.target === checkbox ||
          (mutation.type === 'attributes' && mutation.target === dom)),
      destroy() {
        taskRefreshers.delete(refresh);
        if (checkbox) {
          checkbox.onmousedown = null;
          checkbox.onchange = null;
        }
      },
    };
  };

  const guard = $prose(
    () =>
      new Plugin({
        key: guardKey,
        // editable 只约束用户输入，异步操作和外部命令还需拦截 transaction。
        filterTransaction: (transaction) => !isReadonly() || !transaction.docChanged,
        props: {
          handleDOMEvents: {
            paste: (_view, event) => {
              if (!isReadonly()) return false;
              event.preventDefault();
              return true;
            },
            drop: (_view, event) => {
              if (!isReadonly()) return false;
              event.preventDefault();
              return true;
            },
          },
          handlePaste(view, event, slice) {
            if (isReadonly()) return true;
            const data = event.clipboardData;
            if (!hasOtherFiles(data?.files)) return false;

            options.onError(FILE_UPLOAD_MESSAGE);
            // 拒绝整批混合文件，但保留剪贴板同时携带的正文。
            if (data?.getData('text/plain') || data?.getData('text/html')) {
              view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
            }
            return true;
          },
          handleDrop(view, event, _slice, moved) {
            if (isReadonly()) return true;
            if (moved || view.dragging || !hasOtherFiles(event.dataTransfer?.files)) return false;
            options.onError(FILE_UPLOAD_MESSAGE);
            return true;
          },
          decorations(state) {
            if (isReadonly() || !state.selection.empty) return DecorationSet.empty;
            const { $from } = state.selection;
            if (
              $from.depth === 0 ||
              $from.parent.type.name !== 'paragraph' ||
              $from.parent.content.size > 0
            )
              return DecorationSet.empty;

            return DecorationSet.create(state.doc, [
              Decoration.node($from.before(), $from.after(), {
                class: 'milkdown-editor__empty',
                'data-placeholder': '输入 / 插入内容',
              }),
            ]);
          },
        },
        view(view) {
          currentView = view;
          return { destroy };
        },
      })
  );

  function configure(ctx: Ctx) {
    ctx.update(editorViewOptionsCtx, (config) => ({
      ...config,
      dispatchTransaction(this: EditorView, transaction) {
        // upload 完成后仍会 dispatch，卸载后的空 transaction 也需丢弃。
        if (disposed || this.isDestroyed) return;
        if (config.dispatchTransaction) config.dispatchTransaction.call(this, transaction);
        else this.updateState(this.state.apply(transaction));
      },
    }));
    ctx.update(uploadConfig.key, (config) => ({
      ...config,
      enableHtmlFileUploader: false,
      uploadWidgetFactory: (pos, spec) => {
        const dom = document.createElement('span');
        dom.className = 'milkdown-editor__upload';
        dom.contentEditable = 'false';
        dom.setAttribute('role', 'status');
        dom.textContent = '正在导入图片…';
        return Decoration.widget(pos, dom, spec);
      },
      uploader: async (files, schema) => {
        if (isReadonly()) return [];
        if (hasOtherFiles(files)) {
          options.onError(FILE_UPLOAD_MESSAGE);
          return [];
        }

        const epoch = readonlyEpoch;
        try {
          const imageType = schema.nodes.image;
          if (!imageType) throw new Error('图片功能尚未就绪');
          const nodes = await Promise.all(
            Array.from(files).map(async (file) =>
              imageType.create({ src: await readImage(file), alt: file.name })
            )
          );
          // 权限先关闭再恢复时，旧操作也不能继续写入。
          return isReadonly() || epoch !== readonlyEpoch ? [] : nodes;
        } catch (cause) {
          if (!isReadonly() && epoch === readonlyEpoch) {
            options.onError(cause instanceof Error ? cause.message : '图片读取失败，请重试');
          }
          // upload 的成功分支负责移除占位符，失败也返回空节点。
          return [];
        }
      },
    }));
  }

  function readonlyChanged() {
    readonlyEpoch++;
    cancelReaders();
    taskRefreshers.forEach((refresh) => refresh());
    if (!disposed && currentView && !currentView.isDestroyed) {
      currentView.dispatch(currentView.state.tr.setMeta(guardKey, true));
    }
  }

  function destroy() {
    if (disposed) return;
    disposed = true;
    readonlyEpoch++;
    cancelReaders();
    taskRefreshers.clear();
    currentView = null;
  }

  return {
    plugins: [guard, $view(listItemSchema.node, () => createListItemView)],
    configure,
    readonlyChanged,
    destroy,
  };
}
