<template>
  <section class="milkdown-editor" :class="{ 'milkdown-editor--readonly': readonly }">
    <div
      v-if="!readonly && showToolbar"
      class="milkdown-editor__toolbar"
      role="group"
      aria-label="编辑工具"
    >
      <button
        v-for="action in toolbarActions"
        :key="action.id"
        type="button"
        class="milkdown-editor__action"
        :class="{ 'milkdown-editor__action--active': toolbarState[action.id]?.active }"
        :data-format="action.id"
        :title="action.label"
        :aria-label="action.label"
        :aria-pressed="action.active ? !!toolbarState[action.id]?.active : undefined"
        :aria-haspopup="action.opensDialog ? 'dialog' : undefined"
        :disabled="!ready || toolbarState[action.id]?.enabled === false"
        @mousedown.prevent
        @click="runAction(action)"
      >
        {{ action.text }}
      </button>
      <span v-if="allowAttachments" class="milkdown-editor__separator" aria-hidden="true" />
      <button
        type="button"
        class="milkdown-editor__action"
        :disabled="!ready"
        title="插入表情"
        aria-haspopup="dialog"
        @mousedown.prevent
        @click="openEmoji"
      >
        表情
      </button>
      <button
        type="button"
        class="milkdown-editor__action"
        :disabled="!ready"
        aria-haspopup="dialog"
        @mousedown.prevent
        @click="openPexels"
      >
        图库
      </button>
      <button
        type="button"
        class="milkdown-editor__action"
        :disabled="!ready"
        title="插入或编辑 LaTeX 公式"
        aria-haspopup="dialog"
        @mousedown.prevent
        @click="openLatex()"
      >
        公式
      </button>
      <button
        type="button"
        class="milkdown-editor__action"
        :disabled="!ready"
        title="插入或编辑流程图"
        aria-haspopup="dialog"
        @mousedown.prevent
        @click="openMermaid()"
      >
        流程图
      </button>
      <button
        v-if="allowAttachments"
        type="button"
        class="milkdown-editor__action milkdown-editor__attachment-button"
        :disabled="!ready || uploading"
        :aria-busy="uploading"
        @mousedown.prevent
        @click="uploadAndInsertAttachments"
      >
        {{ uploading ? '上传中…' : '添加附件' }}
      </button>
    </div>
    <Milkdown />
    <EmojiDialog v-if="emojiSelection" @select="insertEmoji" @close="closeEmoji" />
    <PexelsDialog v-if="pexelsSelection" :on-insert="insertPexelsPhoto" @close="closePexels" />
    <LatexDialog
      v-if="latexSelection"
      :initial="latexSelection.initial"
      :editing="latexSelection.editing"
      :on-insert="insertLatex"
      @close="closeLatex"
    />
    <MermaidDialog
      v-if="mermaidSelection"
      :initial="mermaidSelection.initial"
      :editing="mermaidSelection.editing"
      :on-insert="insertMermaid"
      @close="closeMermaid"
    />
  </section>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import {
  Editor,
  EditorStatus,
  defaultValueCtx,
  editorViewCtx,
  editorViewOptionsCtx,
  rootCtx,
  parserCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { cursor, dropIndicatorConfig } from '@milkdown/kit/plugin/cursor';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { indent, indentConfig } from '@milkdown/kit/plugin/indent';
import { upload } from '@milkdown/kit/plugin/upload';
import { prism } from '@milkdown/plugin-prism';
import { undo, redo } from '@milkdown/kit/prose/history';
import { Plugin, type SelectionBookmark } from '@milkdown/kit/prose/state';
import { $prose, getMarkdown as serializeMarkdown } from '@milkdown/kit/utils';
import { Milkdown, useEditor } from '@milkdown/vue';
import '@milkdown/kit/prose/view/style/prosemirror.css';
import '@milkdown/kit/prose/gapcursor/style/gapcursor.css';
import '@milkdown/kit/prose/tables/style/tables.css';
import type { FileInfo } from '@/service/api/document-api';
import { ModalType, useModalStore } from '@/stores/modal';
import { useNotificationStore } from '@/stores/notification';
import { errorMessage } from '@/utils/error';
import {
  createAttachmentExtension,
  type AttachmentExtension,
} from '@/components/milkdown/attachment';
import { createEditorContent } from '@/components/milkdown/editor-content';
import { createEditorPaste } from '@/components/milkdown/editor-paste';
import {
  createImageImport,
  createImportedImage,
  imageAttachmentHash,
} from '@/components/milkdown/image-import';
import { TextSelection } from '@milkdown/kit/prose/state';
import { createEmojiExtension } from '@/components/milkdown/emoji';
import EmojiDialog from '@/components/milkdown/EmojiDialog.vue';
import type { Emoji } from '@/constant/emoji';
import PexelsDialog from '@/components/milkdown/PexelsDialog.vue';
import type { PexelsPhoto } from '@/service/api/pexels-api';
import LatexDialog from '@/components/milkdown/LatexDialog.vue';
import { createLatexExtension, type LatexAttrs } from '@/components/milkdown/latex';
import MermaidDialog from '@/components/milkdown/MermaidDialog.vue';
import { createMermaidExtension } from '@/components/milkdown/mermaid';
import {
  createTextColorExtension,
  normalizeHexColor,
  type TextColorKind,
} from '@/components/milkdown/text-color';
import {
  createEditorInteractions,
  createFormattingActions,
  type EditorAction,
} from '@/components/milkdown/editor-interactions';

const props = withDefaults(
  defineProps<{
    defaultValue?: string;
    attachments?: FileInfo[];
    uploadAttachments?: () => Promise<FileInfo[]>;
    importImages?: (files: File[]) => Promise<FileInfo[]>;
    loadImage?: (hash: string, signal: AbortSignal, documentKey?: string) => Promise<Blob>;
    documentKey?: string;
    allowAttachments?: boolean;
    onPreviewAttachment?: (file: FileInfo) => void;
    readonly?: boolean;
    showToolbar?: boolean;
  }>(),
  {
    defaultValue: '',
    attachments: () => [],
    uploadAttachments: undefined,
    importImages: undefined,
    loadImage: undefined,
    documentKey: '',
    allowAttachments: true,
    onPreviewAttachment: undefined,
    readonly: false,
    showToolbar: true,
  }
);

const emit = defineEmits<{
  ready: [markdown: string];
  change: [markdown: string];
}>();

const editorRef = shallowRef<Editor | null>(null);
const attachmentExtensionRef = shallowRef<AttachmentExtension | null>(null);
const ready = ref(false);
const uploading = ref(false);
const toolbarState = shallowRef<Record<string, { active: boolean; enabled: boolean }>>({});
const modal = useModalStore();
const notification = useNotificationStore();
const pendingAttachments: FileInfo[] = [];
const bookmarks = new Map<symbol, SelectionBookmark>();
const emojiSelection = shallowRef<{ key: symbol; editor: Editor; version: number } | null>(null);
const pexelsSelection = shallowRef<{ key: symbol; editor: Editor; version: number } | null>(null);
const latexSelection = shallowRef<{
  key: symbol;
  editor: Editor;
  version: number;
  initial?: LatexAttrs;
  editing: boolean;
} | null>(null);
const mermaidSelection = shallowRef<{
  key: symbol;
  editor: Editor;
  version: number;
  initial?: string;
  editing: boolean;
} | null>(null);
let disposed = false;
let readonlyVersion = 0;
let publishedMarkdown = props.defaultValue;

const imageImport = createImageImport({
  readonly: () => props.readonly,
  attachments: () => props.attachments,
  documentKey: () => props.documentKey,
  importFiles: (files) => {
    if (!props.importImages) throw new Error('当前页面不支持图片导入');
    return props.importImages(files);
  },
  loadImage: (hash, signal, documentKey) => {
    if (!props.loadImage) throw new Error('当前页面无法读取图片附件');
    return props.loadImage(hash, signal, documentKey);
  },
});
const paste = createEditorPaste({
  readonly: () => props.readonly,
  onError: (message) => notification.show(message, 'error'),
  importImages: imageImport.importImages,
  importSource: imageImport.importSource,
});
const content = createEditorContent({
  readonly: () => props.readonly,
  onError: (message) => notification.show(message, 'error'),
  imageImport: imageImport,
  onAttachment: (view, pos, node) => {
    const hash = imageAttachmentHash(node.attrs.src);
    const file = props.attachments.find((file) => file.hash === hash);
    const type = view.state.schema.nodes.attachment;
    if (!file || !type || props.readonly) return;
    view.dispatch(
      view.state.tr.replaceRangeWith(pos, pos + node.nodeSize, type.create(file)).scrollIntoView()
    );
    view.focus();
  },
});
const emojiExtension = createEmojiExtension();
const latexExtension = createLatexExtension({ readonly: () => props.readonly, onEdit: openLatex });
const mermaidExtension = createMermaidExtension({
  readonly: () => props.readonly,
  onEdit: openMermaid,
});
const textColors = createTextColorExtension();
const colorActions: EditorAction[] = (['textColor', 'highlight'] as const).flatMap((kind) => {
  const label = kind === 'textColor' ? '文字颜色' : '背景色';
  return [
    {
      id: kind,
      label,
      text: label,
      opensDialog: true,
      enabled: (ctx: Ctx) => textColors.enabled(ctx, kind),
      active: (ctx: Ctx) => textColors.active(ctx, kind),
      run: () => editTextColor(kind),
    },
    {
      id: `${kind}-clear`,
      label: `清除${label}`,
      text: `清除${label}`,
      enabled: (ctx: Ctx) => textColors.enabled(ctx, kind) && textColors.active(ctx, kind),
      run: (ctx: Ctx) => {
        textColors.apply(ctx, kind, null);
        publishMarkdown(serializeMarkdown()(ctx));
        ctx.get(editorViewCtx).focus();
      },
    },
  ];
});
const interactions = createEditorInteractions({
  readonly: () => props.readonly,
  allowAttachments: () => props.allowAttachments,
  onAttachment: () => void uploadAndInsertAttachments(),
  onLink: editLink,
  onPexels: openPexels,
  colorActions,
});
const toolbarActions: EditorAction[] = [
  ...[
    { id: 'undo', label: '撤销 (Ctrl / ⌘ Z)', text: '↶', command: undo },
    { id: 'redo', label: '重做 (Ctrl / ⌘ Shift Z)', text: '↷', command: redo },
  ].map(({ id, label, text, command }) => ({
    id,
    label,
    text,
    run: (ctx: Ctx) => {
      const view = ctx.get(editorViewCtx);
      command(view.state, view.dispatch);
    },
    enabled: (ctx: Ctx) => command(ctx.get(editorViewCtx).state),
  })),
  ...createFormattingActions(editLink),
  ...colorActions,
];

function canEdit(editor = editorRef.value): editor is Editor {
  return !disposed && !props.readonly && editor?.status === EditorStatus.Created;
}

function publishMarkdown(markdown: string) {
  if (disposed || !ready.value || markdown === publishedMarkdown) return;
  publishedMarkdown = markdown;
  emit('change', markdown);
}

function refreshToolbar(ctx: Ctx) {
  toolbarState.value = Object.fromEntries(
    toolbarActions.map((action) => [
      action.id,
      { active: action.active?.(ctx) ?? false, enabled: action.enabled?.(ctx) ?? true },
    ])
  );
}

function runAction(action: EditorAction) {
  const editor = editorRef.value;
  if (!canEdit(editor)) return;
  editor.action((ctx) => {
    if (action.enabled?.(ctx) === false) return;
    action.run(ctx);
    if (!action.opensDialog) ctx.get(editorViewCtx).focus();
    refreshToolbar(ctx);
  });
}

// 弹窗与上传期间继续映射选区，返回后仍插入原来的位置。
const selectionPlugin = $prose(
  (ctx) =>
    new Plugin({
      state: {
        init: () => null,
        apply: (transaction) => {
          bookmarks.forEach((bookmark, key) =>
            bookmarks.set(key, bookmark.map(transaction.mapping))
          );
          return null;
        },
      },
      view: () => ({ update: () => refreshToolbar(ctx) }),
    })
);

function rememberSelection(editor: Editor) {
  const key = Symbol('editor-selection');
  editor.action((ctx) => bookmarks.set(key, ctx.get(editorViewCtx).state.selection.getBookmark()));
  return key;
}

function restoreSelection(ctx: Ctx, key: symbol) {
  const bookmark = bookmarks.get(key);
  if (!bookmark) return;
  const view = ctx.get(editorViewCtx);
  view.dispatch(view.state.tr.setSelection(bookmark.resolve(view.state.doc)));
}

function openEmoji() {
  const editor = editorRef.value;
  if (!canEdit(editor) || emojiSelection.value) return;
  interactions.hide();
  emojiSelection.value = { key: rememberSelection(editor), editor, version: readonlyVersion };
}

function closeEmoji() {
  const session = emojiSelection.value;
  if (!session) return;
  bookmarks.delete(session.key);
  emojiSelection.value = null;
  void nextTick(() => {
    if (canEdit(session.editor) && session.editor === editorRef.value)
      session.editor.action((ctx) => ctx.get(editorViewCtx).focus());
  });
}

function insertEmoji(emoji: Emoji) {
  const session = emojiSelection.value;
  if (
    !session ||
    !canEdit(session.editor) ||
    session.editor !== editorRef.value ||
    session.version !== readonlyVersion
  ) {
    closeEmoji();
    return;
  }
  try {
    session.editor.action((ctx) => {
      restoreSelection(ctx, session.key);
      emojiExtension.insert(ctx, emoji);
    });
    closeEmoji();
  } catch (cause) {
    notification.show(errorMessage(cause, '表情插入失败，请将光标移到正文后重试'), 'error');
  }
}

function openLatex(position?: number) {
  const editor = editorRef.value;
  if (!canEdit(editor) || latexSelection.value) return;
  interactions.hide();
  const initial = editor.action((ctx) => {
    if (position !== undefined) latexExtension.select(ctx, position);
    return latexExtension.selected(ctx);
  });
  latexSelection.value = {
    key: rememberSelection(editor),
    editor,
    version: readonlyVersion,
    initial: initial ?? undefined,
    editing: !!initial,
  };
}

function closeLatex() {
  const session = latexSelection.value;
  if (!session) return;
  bookmarks.delete(session.key);
  latexSelection.value = null;
  void nextTick(() => {
    if (canEdit(session.editor) && session.editor === editorRef.value)
      session.editor.action((ctx) => ctx.get(editorViewCtx).focus());
  });
}

function insertLatex(attrs: LatexAttrs) {
  const session = latexSelection.value;
  if (
    !session ||
    !canEdit(session.editor) ||
    session.editor !== editorRef.value ||
    session.version !== readonlyVersion
  )
    throw new Error('当前文档不可编辑，请关闭弹窗后重试');
  session.editor.action((ctx) => {
    restoreSelection(ctx, session.key);
    latexExtension.insert(ctx, attrs, session.editing);
  });
  // 公式参数提交后立即更新保存快照，避免防抖期间仍显示旧的“修改已保存”。
  publishMarkdown(session.editor.action(serializeMarkdown()));
}

function openMermaid(position?: number) {
  const editor = editorRef.value;
  if (!canEdit(editor) || mermaidSelection.value) return;
  interactions.hide();
  const initial = editor.action((ctx) => {
    if (position !== undefined) mermaidExtension.select(ctx, position);
    return mermaidExtension.selected(ctx);
  });
  mermaidSelection.value = {
    key: rememberSelection(editor),
    editor,
    version: readonlyVersion,
    initial: initial ?? undefined,
    editing: initial !== null,
  };
}

function closeMermaid() {
  const session = mermaidSelection.value;
  if (!session) return;
  bookmarks.delete(session.key);
  mermaidSelection.value = null;
  void nextTick(() => {
    if (canEdit(session.editor) && session.editor === editorRef.value)
      session.editor.action((ctx) => ctx.get(editorViewCtx).focus());
  });
}

function insertMermaid(code: string) {
  const session = mermaidSelection.value;
  if (
    !session ||
    !canEdit(session.editor) ||
    session.editor !== editorRef.value ||
    session.version !== readonlyVersion
  )
    throw new Error('当前文档不可编辑，请关闭弹窗后重试');
  session.editor.action((ctx) => {
    restoreSelection(ctx, session.key);
    mermaidExtension.insert(ctx, code, session.editing);
  });
  publishMarkdown(session.editor.action(serializeMarkdown()));
}

function openPexels() {
  const editor = editorRef.value;
  if (!canEdit(editor) || pexelsSelection.value) return;
  interactions.hide();
  pexelsSelection.value = { key: rememberSelection(editor), editor, version: readonlyVersion };
}

function closePexels() {
  const session = pexelsSelection.value;
  if (!session) return;
  bookmarks.delete(session.key);
  pexelsSelection.value = null;
  void nextTick(() => {
    if (canEdit(session.editor) && session.editor === editorRef.value)
      session.editor.action((ctx) => ctx.get(editorViewCtx).focus());
  });
}

async function insertPexelsPhoto(photo: PexelsPhoto) {
  const session = pexelsSelection.value;
  if (
    !session ||
    !canEdit(session.editor) ||
    session.editor !== editorRef.value ||
    session.version !== readonlyVersion
  )
    throw new Error('当前文档不可编辑，请关闭图库后重试');
  const view = session.editor.action((ctx) => {
    restoreSelection(ctx, session.key);
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const image = state.schema.nodes.image;
    if (
      !image ||
      !state.selection.$from.parent.canReplaceWith(
        state.selection.$from.index(),
        state.selection.$from.index(),
        image
      )
    )
      throw new Error('请将光标移到正文段落后插入图片');
    return view;
  });
  const node = await imageImport.importSource(
    view,
    view.state.schema.nodes.image!.create({
      src: photo.src.large2x || photo.src.large || photo.src.original,
      alt: photo.alt || `${photo.photographer} 的照片`,
      title: `摄影：${photo.photographer} / Pexels`,
    })
  );
  if (
    pexelsSelection.value !== session ||
    !canEdit(session.editor) ||
    session.version !== readonlyVersion
  )
    throw new Error('图片导入已取消');
  session.editor.action((ctx) => {
    restoreSelection(ctx, session.key);
    const view = ctx.get(editorViewCtx);
    view.dispatch(view.state.tr.replaceSelectionWith(node, false).scrollIntoView());
  });
  publishMarkdown(session.editor.action(serializeMarkdown()));
}

async function uploadAndInsertAttachments() {
  const editor = editorRef.value;
  if (!canEdit(editor) || uploading.value || !props.allowAttachments || !props.uploadAttachments)
    return;
  const key = rememberSelection(editor);
  const version = readonlyVersion;
  uploading.value = true;
  try {
    const files = await props.uploadAttachments();
    if (
      !canEdit(editor) ||
      editor !== editorRef.value ||
      version !== readonlyVersion ||
      !files.length
    )
      return;
    editor.action((ctx) => {
      restoreSelection(ctx, key);
      files.forEach((file) => insertImportedFile(ctx, file));
    });
  } catch (cause) {
    if (!disposed) notification.show(errorMessage(cause, '附件上传失败，请重试'), 'error');
  } finally {
    bookmarks.delete(key);
    uploading.value = false;
  }
}

function editLink() {
  const editor = editorRef.value;
  if (!canEdit(editor)) return;
  const key = rememberSelection(editor);
  const version = readonlyVersion;
  const href = editor.action((ctx) => {
    const { state } = ctx.get(editorViewCtx);
    const marks = state.storedMarks ?? state.selection.$from.marks();
    return marks.find((mark) => mark.type.name === 'link')?.attrs.href as string | undefined;
  });
  interactions.hide();
  modal.showModal(ModalType.INPUT_DIALOG, {
    title: '插入链接',
    tips: '链接地址',
    defaultValue: href ?? 'https://',
    okText: '插入',
    onOK: (value) => {
      const url = new URL(value, window.location.href);
      if (!['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol))
        throw new Error('请输入网页、邮件或电话链接');
      if (!canEdit(editor) || version !== readonlyVersion) {
        bookmarks.delete(key);
        return;
      }
      editor.action((ctx) => {
        restoreSelection(ctx, key);
        const view = ctx.get(editorViewCtx);
        const { state } = view;
        const mark = state.schema.marks.link!.create({ href: value });
        const { from, to, empty } = state.selection;
        const transaction = empty
          ? state.tr.replaceSelectionWith(state.schema.text(value, [mark]), false)
          : state.tr.addMark(from, to, mark);
        view.dispatch(transaction.scrollIntoView());
      });
      bookmarks.delete(key);
    },
    onCancel: () => bookmarks.delete(key),
  });
}

function editTextColor(kind: TextColorKind) {
  const editor = editorRef.value;
  if (!canEdit(editor) || !editor.action((ctx) => textColors.enabled(ctx, kind))) return;
  const key = rememberSelection(editor);
  const version = readonlyVersion;
  const initial = editor.action((ctx) => ({
    color: textColors.selected(ctx, kind),
    marks: ctx.get(editorViewCtx).state.storedMarks,
  }));
  interactions.hide();
  modal.showModal(ModalType.INPUT_DIALOG, {
    title: kind === 'textColor' ? '文字颜色' : '背景色',
    tips: '输入 HEX 颜色，例如 #F00 或 #FF0000；清除颜色请使用工具栏的清除按钮',
    defaultValue: initial.color ?? (kind === 'textColor' ? '#FF0000' : '#FFFF00'),
    okText: '应用',
    onOK: (value) => {
      const color = normalizeHexColor(value);
      if (!color) throw new Error('请输入 #RGB 或 #RRGGBB 格式的 HEX 颜色');
      if (!canEdit(editor) || editor !== editorRef.value || version !== readonlyVersion)
        throw new Error('当前文档不可编辑，请关闭弹窗后重试');
      editor.action((ctx) => {
        restoreSelection(ctx, key);
        const view = ctx.get(editorViewCtx);
        if (view.state.selection.empty && initial.marks)
          view.dispatch(view.state.tr.setStoredMarks(initial.marks));
        textColors.apply(ctx, kind, color);
      });
      publishMarkdown(editor.action(serializeMarkdown()));
      bookmarks.delete(key);
    },
    onCancel: () => bookmarks.delete(key),
  });
}

useEditor((root) => {
  const extension = createAttachmentExtension(
    (hash) => props.attachments.some((file) => file.hash === hash),
    (file) => {
      const attachment = props.attachments.find((item) => item.hash === file.hash);
      if (attachment) props.onPreviewAttachment?.(attachment);
    },
    {
      readonly: () => props.readonly,
      onImage: (view, pos, hash) => {
        const file = props.attachments.find((file) => file.hash === hash);
        const current = view.state.doc.nodeAt(pos);
        const paragraph = view.state.schema.nodes.paragraph;
        if (!file || !current || !paragraph || props.readonly) return;
        const image = createImportedImage(view, file, props.documentKey);
        const tr = view.state.tr.replaceWith(
          pos,
          pos + current.nodeSize,
          paragraph.create(null, image)
        );
        tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
        view.dispatch(tr.scrollIntoView());
        view.focus();
      },
    }
  );
  attachmentExtensionRef.value = extension;

  // preset 定义文档结构；交互和视觉由当前组件控制。
  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, props.defaultValue);
      ctx.update(editorViewOptionsCtx, (options) => ({
        ...options,
        editable: () => !props.readonly,
        attributes: () => ({
          class: 'milkdown-editor__content',
          'aria-label': '文档正文',
          'aria-multiline': 'true',
          'aria-readonly': String(props.readonly),
        }),
        handleDOMEvents: {
          keydown: (view, event) => {
            if (event.key !== 'Tab') return false;
            const { $from } = view.state.selection;
            for (let depth = $from.depth; depth > 0; depth--) {
              if (['code_block', 'list_item', 'table'].includes($from.node(depth).type.name))
                return false;
            }
            // 普通正文保留 Tab 导航，避免键盘焦点困在编辑器内。
            return true;
          },
        },
      }));
      ctx.set(indentConfig.key, { type: 'space' as const, size: 2 });
      ctx.update(dropIndicatorConfig.key, (config) => ({
        ...config,
        color: 'var(--editor-accent)',
      }));
      content.configure(ctx);
      textColors.configure(ctx);
      interactions.configure(ctx);
      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, previous) => {
        if (markdown !== previous) publishMarkdown(markdown);
      });
    })
    .use(paste.plugins)
    .use(content.plugins)
    .use(commonmark)
    .use(gfm)
    .use(prism)
    .use(history)
    .use(upload)
    .use(clipboard)
    .use(cursor)
    .use(listener)
    .use(indent)
    .use(extension.plugins)
    .use(emojiExtension.plugins)
    .use(latexExtension.plugins)
    .use(mermaidExtension.plugins)
    .use(textColors.plugins)
    .use(interactions.plugins)
    .use(selectionPlugin);

  editorRef.value = editor;
  editor.onStatusChange((status) => {
    if (status === EditorStatus.Created && !disposed) {
      ready.value = true;
      editor.action(refreshToolbar);
      publishedMarkdown = editor.action(serializeMarkdown());
      emit('ready', publishedMarkdown);
      pendingAttachments.splice(0).forEach((file) => insertAttachment(file));
    }
  });
  return editor;
});

watch(
  () => props.readonly,
  () => {
    readonlyVersion++;
    paste.readonlyChanged();
    imageImport.readonlyChanged();
    content.readonlyChanged();
    attachmentExtensionRef.value?.refreshAvailability();
    latexExtension.readonlyChanged();
    mermaidExtension.readonlyChanged();
    interactions.hide();
    closeEmoji();
    closePexels();
    closeLatex();
    closeMermaid();
    if (props.readonly) pendingAttachments.length = 0;
    if (editorRef.value?.status === EditorStatus.Created) {
      editorRef.value.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        view.setProps({ editable: () => !props.readonly });
        view.dispatch(view.state.tr);
      });
    }
  },
  { flush: 'sync' }
);

watch(
  () => props.attachments.map((file) => file.hash),
  () => attachmentExtensionRef.value?.refreshAvailability()
);

onBeforeUnmount(() => {
  disposed = true;
  ready.value = false;
  pendingAttachments.length = 0;
  bookmarks.clear();
  content.destroy();
  paste.destroy();
  imageImport.destroy();
  interactions.hide();
  attachmentExtensionRef.value = null;
  // Milkdown Vue 负责 editor.destroy()，此处仅清理组件自己的状态。
  editorRef.value = null;
});

function insertImportedFile(ctx: Ctx, file: FileInfo): boolean {
  if (!file.mime.startsWith('image/'))
    return attachmentExtensionRef.value?.insertAttachment(ctx, file) ?? false;
  const view = ctx.get(editorViewCtx);
  const node = createImportedImage(view, file, props.documentKey);
  view.dispatch(view.state.tr.replaceSelectionWith(node, false).scrollIntoView());
  view.focus();
  return true;
}

function insertAttachment(file: FileInfo): boolean {
  if (disposed || props.readonly || !props.allowAttachments) return false;
  const editor = editorRef.value;
  const extension = attachmentExtensionRef.value;
  if (!editor || !extension || editor.status !== EditorStatus.Created) {
    pendingAttachments.push(file);
    return true;
  }

  try {
    return editor.action((ctx) => insertImportedFile(ctx, file));
  } catch {
    return false;
  }
}

function getMarkdown(): string {
  return editorRef.value?.status === EditorStatus.Created
    ? editorRef.value.action(serializeMarkdown())
    : props.defaultValue;
}

function normalizeMarkdown(markdown: string): string {
  const editor = editorRef.value;
  if (!editor || editor.status !== EditorStatus.Created) throw new Error('编辑器尚未就绪');
  return editor.action((ctx) => {
    const document = ctx.get(parserCtx)(markdown);
    if (!document) throw new Error('文档格式无法解析');
    return ctx.get(serializerCtx)(document);
  });
}

// Used only after an explicitly reviewed save; does not open any insertion dialogs.
function setMarkdown(markdown: string) {
  const editor = editorRef.value;
  if (!editor || editor.status !== EditorStatus.Created) throw new Error('编辑器尚未就绪');
  editor.action((ctx) => {
    const document = ctx.get(parserCtx)(markdown);
    if (!document) throw new Error('文档格式无法解析');
    content.replaceSavedDocument(ctx, document);
  });
  publishMarkdown(editor.action(serializeMarkdown()));
}

defineExpose({ getMarkdown, insertAttachment, normalizeMarkdown, setMarkdown });
</script>

<style lang="stylus">
.milkdown-mermaid
  position relative
  box-sizing border-box
  width 100%
  min-height 120px
  margin 12px 0
  padding 48px 16px 16px
  border 1px solid var(--color-border-primary)
  border-radius 6px
  background var(--color-bg-panel)
  outline 1px solid transparent

  &.ProseMirror-selectednode
    outline 2px solid var(--color-accent)

  &[data-state='error'] .milkdown-mermaid__feedback
    color var(--color-red)

  &__viewport
    overflow auto
    text-align center
    svg
      display block
      max-width 100%
      height auto
      margin 0 auto

  &__feedback
    display block
    padding 16px 0
    overflow-wrap anywhere
    white-space pre-wrap
    font-size 13px
    color var(--color-text-secondary)
    &[hidden]
      display none

  &__edit
    position absolute
    top 8px
    right 8px
    min-height 30px
    padding 4px 8px
    border 1px solid var(--color-border-primary)
    border-radius 6px
    background var(--color-bg-panel)
    color var(--color-text-primary)
    font-family inherit
    font-size 12px
    cursor pointer
    &:hover:not(:disabled)
      background var(--color-bg-translucent)
    &:active:not(:disabled)
      filter brightness(.9)
    &:focus-visible
      outline 2px solid var(--color-accent)
      outline-offset 2px
    &:disabled
      cursor not-allowed
      opacity .6
    &[hidden]
      display none

.milkdown-editor--readonly .milkdown-mermaid
  padding-top 16px

.milkdown-latex
  position relative
  box-sizing border-box
  width 100%
  margin 12px 0
  overflow hidden
  outline 1px solid transparent

  &.ProseMirror-selectednode
    outline 2px solid var(--color-accent)

  &__viewport
    position absolute
    inset 0
    display flex
    align-items center
    justify-content center
    overflow hidden
    svg
      display block
      flex-shrink 0
      max-width none
      max-height none

  &__feedback
    position absolute
    inset 0
    display flex
    align-items center
    justify-content center
    padding 12px
    overflow-wrap anywhere
    font-size 13px
    text-align center
    color var(--color-text-secondary)
    &[hidden]
      display none

  &__edit
    position absolute
    top 6px
    right 6px
    min-height 30px
    padding 4px 8px
    border 1px solid var(--color-border-primary)
    border-radius 6px
    background var(--color-bg-panel)
    color var(--color-text-primary)
    font-family inherit
    font-size 12px
    cursor pointer
    opacity 0
    pointer-events none
    &:hover:not(:disabled)
      background var(--color-bg-translucent)
    &:active:not(:disabled)
      filter brightness(.9)
    &:focus-visible
      outline 2px solid var(--color-accent)
      outline-offset 2px
    &:disabled
      cursor not-allowed
    &[hidden]
      display none

  &:hover, &:focus-within, &.ProseMirror-selectednode
    .milkdown-latex__edit
      opacity 1
      pointer-events auto

.milkdown-editor
  --editor-bg: var(--color-bg-primary, #fff)
  --editor-panel: var(--color-bg-panel, #fff)
  --editor-hover: var(--color-bg-translucent, #f5f5f5)
  --editor-text: var(--color-text-primary, #1a1a1a)
  --editor-secondary: var(--color-text-secondary, #555)
  --editor-muted: var(--color-text-tertiary, #666)
  --editor-border: var(--color-border-primary, #dcdcdc)
  --editor-accent: var(--color-accent, #0066cc)
  --editor-selected: var(--color-accent-tint, #e8f2ff)
  --editor-code-string: #116329
  --editor-code-value: #953800
  --editor-code-function: #8250df
  --editor-code-deleted: #b42318
  position relative
  min-height 100%
  color var(--editor-text)
  background var(--editor-bg)

  [data-theme='dark'] &
    --editor-code-string: #98c379
    --editor-code-value: #e5c07b
    --editor-code-function: #61afef
    --editor-code-deleted: #e06c75

  .milkdown
    position relative
    font-family inherit

  &__toolbar
    position sticky
    top 0
    z-index 10
    display flex
    align-items center
    gap 2px
    min-height 45px
    padding 6px 12px
    overflow-x auto
    border-bottom 1px solid var(--editor-border)
    background var(--editor-bg)

  &__action
    display inline-flex
    align-items center
    justify-content center
    flex-shrink 0
    min-width 32px
    height 32px
    padding 0 8px
    border-radius 6px
    background transparent
    color var(--editor-secondary)
    font-family inherit
    font-size 13px
    line-height 1
    cursor pointer
    transition background .15s, color .15s

    &:hover:not(:disabled)
      background var(--editor-hover)
      color var(--editor-text)

    &:focus-visible
      outline 2px solid var(--editor-accent)
      outline-offset -2px

    &:active:not(:disabled)
      background var(--editor-selected)

    &:disabled
      opacity .4
      cursor not-allowed

    &--active, &[aria-pressed='true']
      background var(--editor-selected)
      color var(--editor-accent)

    &[data-format='bold'], &[data-format='strong']
      font-weight 700

    &[data-format='italic'], &[data-format='emphasis']
      font-style italic

    &[data-format='strike_through']
      text-decoration line-through

    &[data-format='undo'], &[data-format='redo']
      font-size 20px

  &__attachment-button
    min-width 80px

  &__separator
    width 1px
    height 18px
    margin 0 6px
    background var(--editor-border)
    flex-shrink 0

  &__content
    box-sizing border-box
    width 100%
    max-width 860px
    min-height 360px
    margin 0 auto
    padding 36px 52px 100px
    outline none
    color var(--editor-text)
    font-family inherit
    font-size 15px
    line-height 1.8
    overflow-wrap anywhere
    caret-color var(--editor-accent)

    &:focus-visible
      outline none

    > :first-child
      margin-top 0

    p
      min-height 1.8em
      margin 8px 0

    h1, h2, h3, h4, h5, h6
      margin 28px 0 10px
      font-weight 600
      line-height 1.4
      letter-spacing -.015em

    h1
      font-size 30px

    h2
      font-size 24px

    h3
      font-size 20px

    h4, h5, h6
      font-size 16px

    strong
      font-weight 650

    a
      color var(--editor-accent)
      text-decoration underline
      text-underline-offset 3px

    blockquote
      margin 16px 0
      padding 2px 16px
      border-left 3px solid var(--editor-border)
      color var(--editor-secondary)

    ul, ol
      padding-left 26px
      margin 8px 0

    ul
      list-style disc

    ol
      list-style decimal

    li
      margin 4px 0

      p
        margin 0

      ul, ol
        margin 4px 0

    li[data-item-type='task']
      position relative
      list-style none

    li[data-checked='true'] > .milkdown-editor__list-content > p
      color var(--editor-muted)
      text-decoration line-through

    code
      padding 2px 5px
      border-radius 4px
      background var(--editor-hover)
      font-family 'Cascadia Code', Consolas, monospace
      font-size .88em

    pre
      margin 16px 0
      padding 16px
      overflow-x auto
      border 1px solid var(--editor-border)
      border-radius 8px
      background var(--editor-panel)
      white-space pre
      overflow-wrap normal
      tab-size 2

      code
        padding 0
        background transparent
        line-height 1.6

      // Prism 只标记 token，局部配色随编辑器主题切换。
      .token.comment, .token.prolog, .token.doctype, .token.cdata
        color var(--editor-muted)

      .token.punctuation, .token.operator
        color var(--editor-secondary)

      .token.keyword, .token.atrule, .token.attr-name, .token.tag
        color var(--editor-accent)

      .token.string, .token.char, .token.attr-value, .token.inserted
        color var(--editor-code-string)

      .token.number, .token.boolean, .token.constant, .token.regex
        color var(--editor-code-value)

      .token.function, .token.class-name, .token.builtin
        color var(--editor-code-function)

      .token.deleted
        color var(--editor-code-deleted)

      .token.bold
        font-weight 700

      .token.italic
        font-style italic

    hr
      margin 24px 0
      border 0
      border-top 1px solid var(--editor-border)

    img
      max-width 100%
      height auto
      border-radius 6px
      vertical-align middle

    .milkdown-emoji
      display inline-block
      width 1.1em
      height 1.1em
      vertical-align -0.15em
      line-height 1

      &__image
        display block
        width 100%
        height 100%
        border-radius 0

      &__fallback
        display block

      [hidden]
        display none

    table
      display block
      max-width 100%
      margin 16px 0
      overflow-x auto
      border-collapse collapse

    td, th
      position relative
      min-width 120px
      padding 8px 12px
      border 1px solid var(--editor-border)
      vertical-align top
      text-align left

    th
      background var(--editor-hover)
      font-weight 600

    .selectedCell:after
      background var(--editor-selected)
      opacity .4

    .ProseMirror-selectednode
      outline 2px solid var(--editor-accent)
      outline-offset 2px

    .ProseMirror-gapcursor:after
      border-top-color var(--editor-text)

  &__task-checkbox
    position absolute
    top 6px
    left -24px
    width 16px
    height 16px
    margin 0
    accent-color var(--editor-accent)
    cursor pointer

    &:disabled
      cursor default

    &:focus-visible
      outline 2px solid var(--editor-accent)
      outline-offset 2px

  &__image
    position relative
    display inline-block
    max-width 100%
    vertical-align middle
    border-radius 6px
    line-height 0

    &[data-align]
      display block
      width fit-content

    &[data-align='left']
      margin-left 0
      margin-right auto

    &[data-align='center']
      margin-left auto
      margin-right auto

    &[data-align='right']
      margin-left auto
      margin-right 0

      .milkdown-editor__image-handle
        left -7px
        right auto
        cursor nesw-resize

    [hidden]
      display none !important

    &--selected
      outline 2px solid var(--editor-accent)
      outline-offset 2px

    &--resizing
      user-select none

    &:focus-visible
      outline 2px solid var(--editor-accent)
      outline-offset 2px

  &__image-media
    display block
    width 100%
    height auto

  &__image-handle
    position absolute
    right -7px
    bottom -7px
    z-index 2
    width 20px
    height 20px
    padding 0
    border 2px solid var(--editor-bg)
    border-radius 5px
    background var(--editor-accent)
    color var(--editor-bg)
    cursor nwse-resize
    touch-action none

    &:hover
      filter brightness(1.15)

    &:focus-visible
      outline 2px solid var(--editor-accent)
      outline-offset 3px

  &__image-controls
    position fixed
    z-index 30
    display flex
    align-items center
    flex-wrap wrap
    gap 8px
    width 320px
    max-width calc(100vw - 24px)
    padding 8px
    border 1px solid var(--editor-border)
    border-radius 6px
    background var(--editor-panel)
    box-shadow var(--shadow-medium)
    color var(--editor-text)
    font-size 12px
    line-height 1.5

    input
      width 76px
      height 32px
      padding 0 6px
      border 1px solid var(--editor-border)
      border-radius 4px
      background var(--editor-bg)
      color var(--editor-text)
      font-size 12px

      &[aria-invalid='true']
        border-color var(--color-red)

    button
      height 32px
      padding 0 8px
      border 1px solid var(--editor-border)
      border-radius 4px
      color var(--editor-text)
      background var(--editor-hover)
      white-space nowrap
      cursor pointer

      &:hover:not(:disabled)
        background var(--editor-selected)

      &:active:not(:disabled)
        filter brightness(.9)

    input, button
      &:focus-visible
        outline 2px solid var(--editor-accent)
        outline-offset 1px

      &:disabled
        opacity .5
        cursor not-allowed

  &__image-label
    display inline-flex
    align-items center
    gap 6px

  &__image-alignment
    display flex
    flex-basis 100%
    gap 4px
    padding-top 6px
    border-top 1px solid var(--editor-border)

    button
      flex 1

      &[aria-pressed='true']
        color var(--editor-accent)
        background var(--editor-selected)
        border-color var(--editor-accent)

  &__image-validation
    flex-basis 100%
    color var(--color-red)
    line-height 1.5

  &__image-error
    display inline-flex
    align-items center
    justify-content center
    min-width 140px
    min-height 72px
    padding 12px
    background var(--editor-hover)
    color var(--editor-muted)
    font-size 13px
    line-height 1.5

  @media (pointer: coarse)
    &__image-handle
      width 28px
      height 28px

    &__image-controls input, &__image-controls button
      min-height 40px

  &__list-content
    min-width 0

  &__empty[data-placeholder]:before
    float left
    height 0
    color var(--editor-muted)
    content attr(data-placeholder)
    pointer-events none

  &__upload
    display inline-block
    padding 4px 10px
    border 1px dashed var(--editor-border)
    border-radius 6px
    color var(--editor-muted)
    font-size 13px

  &__popover
    position absolute
    z-index 20
    border 1px solid var(--editor-border)
    border-radius 8px
    background var(--editor-panel)
    box-shadow var(--shadow-medium, 0 4px 24px #0002)
    color var(--editor-text)
    font-family inherit
    font-size 13px

    &[data-show='false'], &[hidden]
      display none

  &__format
    display flex
    flex-wrap wrap
    gap 2px
    padding 4px
    max-width calc(100vw - 24px)

  &__slash
    width 260px
    max-width calc(100vw - 24px)
    max-height unquote('min(360px, 60vh)')
    padding 6px
    overflow-y auto
    overscroll-behavior contain

  &__slash-title
    padding 6px 8px
    color var(--editor-muted)
    font-size 11px

  &__slash-item
    display flex
    align-items center
    gap 10px
    width 100%
    padding 7px 8px
    border-radius 6px
    background transparent
    color var(--editor-secondary)
    font-family inherit
    text-align left
    cursor pointer

    &:hover, &[aria-selected='true'], &:focus-visible
      outline none
      background var(--editor-selected)
      color var(--editor-accent)

    &:active
      background var(--editor-hover)

  &__slash-icon
    display inline-flex
    align-items center
    justify-content center
    flex-shrink 0
    width 28px
    height 28px
    border 1px solid var(--editor-border)
    border-radius 5px
    font-size 13px
    font-weight 600

  &__slash-label
    font-size 13px

  &__slash-hint
    margin-left auto
    color var(--editor-muted)
    font-size 11px

  &__slash .milkdown-editor__empty
    padding 12px 8px
    color var(--editor-muted)
    font-size 13px

  &__block
    position absolute
    z-index 5
    display flex
    gap 1px
    border 0
    border-radius 0
    background transparent
    box-shadow none

    // 定位前保留尺寸和 offsetParent，避免隐藏状态下算出页面坐标。
    &[data-show='false']
      display flex
      visibility hidden
      pointer-events none

    &[hidden]
      display none

  &__block-handle, &__block-add
    display inline-flex
    align-items center
    justify-content center
    width 22px
    height 28px
    border-radius 5px
    background var(--editor-bg)
    color var(--editor-muted)
    font-size 18px
    cursor pointer

    &:hover, &:focus-visible
      background var(--editor-hover)
      color var(--editor-text)

    &:focus-visible
      outline 2px solid var(--editor-accent)
      outline-offset -2px

  &__block-handle
    cursor grab

    &:active
      cursor grabbing

  &--readonly
    .milkdown-editor__popover, .milkdown-editor__block
      display none

  @media (max-width: 720px)
    &__content
      padding 24px 32px 72px

    &__block-add
      display none

    &__toolbar
      padding 6px 8px

  @media (pointer: coarse)
    &__action
      min-width 40px
      height 40px

    &__slash-item
      min-height 44px

    &__task-checkbox
      width 20px
      height 20px

.milkdown-attachment
  display flex
  align-items center
  flex-wrap wrap
  gap 12px
  box-sizing border-box
  width 100%
  min-height 64px
  margin 10px 0
  padding 10px 12px
  border 1px solid var(--editor-border)
  border-radius 10px
  background var(--editor-panel)
  color var(--editor-text)
  transition border-color .15s, background .15s, box-shadow .15s

  &:hover
    border-color var(--editor-accent)

  &--selected
    border-color var(--editor-accent)
    box-shadow 0 0 0 2px rgba(30, 144, 255, .14)

  &--unavailable
    border-style dashed
    background var(--editor-hover)

  &__icon
    display inline-flex
    align-items center
    justify-content center
    width 40px
    height 40px
    border-radius 9px
    background var(--editor-hover)
    color var(--editor-secondary)
    flex-shrink 0

  &__icon-svg
    width 20px
    height 20px

  &__info
    display flex
    flex 1
    min-width 0
    flex-direction column
    gap 3px

  &__name
    overflow hidden
    font-size 14px
    font-weight 600
    line-height 20px
    text-overflow ellipsis
    white-space nowrap

  &__meta
    overflow hidden
    color var(--editor-muted)
    font-size 12px
    line-height 18px
    text-overflow ellipsis
    white-space nowrap

  &__unavailable
    color #d14343
    font-size 12px
    line-height 18px

  &__preview
    display inline-flex
    align-items center
    justify-content center
    min-width 56px
    height 32px
    padding 0 12px
    border 1px solid var(--editor-border)
    border-radius 7px
    background var(--editor-panel)
    color var(--editor-secondary)
    cursor pointer
    font-size 12px
    font-weight 500
    flex-shrink 0
    transition border-color .15s, background .15s, color .15s
    -webkit-tap-highlight-color transparent
    touch-action manipulation
    user-select none

    @media (hover hover)
      &:hover
        border-color var(--editor-accent)
        background var(--editor-hover)
        color var(--editor-accent)

    &:active
      border-color var(--editor-accent)
      background var(--editor-selected)
      color var(--editor-accent)

    &:focus-visible
      outline 2px solid var(--editor-accent)
      outline-offset 2px

    &[hidden]
      display none

    @media (pointer coarse)
      min-height 44px
      min-width 44px
</style>
