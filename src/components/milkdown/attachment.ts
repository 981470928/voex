import { editorViewCtx, remarkPluginsCtx } from '@milkdown/kit/core';
import type { Ctx, MilkdownPlugin } from '@milkdown/kit/ctx';
import { Fragment, type Node as ProseMirrorNode } from '@milkdown/kit/prose/model';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { NodeView } from '@milkdown/kit/prose/view';
import type { MarkdownNode, RemarkPlugin } from '@milkdown/kit/transformer';
import { $node, $view } from '@milkdown/kit/utils';
import type { FileInfo } from '@/service/api/document-api';

export const ATTACHMENT_NODE_ID = 'attachment';

const ATTACHMENT_TAG_PATTERN =
  /^<voex-attachment data-hash="([^"]*)" data-name="([^"]*)" data-mime="([^"]*)"><\/voex-attachment>$/;

interface AttachmentAttrs {
  hash: string;
  name: string;
  mime: string;
}

type AttachmentMarkdownNode = MarkdownNode & {
  hash?: unknown;
  name?: unknown;
  mime?: unknown;
};

function encodeAttribute(value: string): string {
  return encodeURIComponent(value);
}

function decodeAttribute(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function serializeAttachment(attrs: AttachmentAttrs): string {
  return `<voex-attachment data-hash="${encodeAttribute(attrs.hash)}" data-name="${encodeAttribute(attrs.name)}" data-mime="${encodeAttribute(attrs.mime)}"></voex-attachment>`;
}

function parseAttachmentTag(value: string): AttachmentAttrs | null {
  const match = value.trim().match(ATTACHMENT_TAG_PATTERN);
  if (!match) return null;

  const hash = decodeAttribute(match[1] ?? '');
  const name = decodeAttribute(match[2] ?? '');
  const mime = decodeAttribute(match[3] ?? '');
  if (!hash || name === null || mime === null) return null;

  return { hash, name, mime };
}

function getHtmlValue(node: MarkdownNode): string | null {
  if (node.type === 'html' && typeof node.value === 'string') return node.value;

  if (node.type !== 'paragraph' || !node.children?.length) return null;
  if (!node.children.every((child) => child.type === 'html' && typeof child.value === 'string')) {
    return null;
  }
  return node.children.map((child) => child.value as string).join('');
}

function transformAttachmentNodes(node: MarkdownNode): void {
  if (!node.children) return;

  node.children = node.children.map((child) => {
    const htmlValue = getHtmlValue(child);
    const attrs = htmlValue ? parseAttachmentTag(htmlValue) : null;
    if (attrs) {
      return {
        type: ATTACHMENT_NODE_ID,
        hash: attrs.hash,
        name: attrs.name,
        mime: attrs.mime,
      } as AttachmentMarkdownNode;
    }

    transformAttachmentNodes(child);
    return child;
  });
}

function createRemarkAttachmentPlugin(): MilkdownPlugin {
  return (ctx) => {
    const remarkPlugin: RemarkPlugin<Record<string, unknown>> = {
      plugin: () => (tree) => transformAttachmentNodes(tree as MarkdownNode),
      options: {},
    };
    ctx.update(remarkPluginsCtx, (plugins) => [...plugins, remarkPlugin]);

    return () => {
      return () => {
        ctx.update(remarkPluginsCtx, (plugins) =>
          plugins.filter((plugin) => plugin !== remarkPlugin)
        );
      };
    };
  };
}

function getNodeAttrs(node: ProseMirrorNode): AttachmentAttrs {
  return {
    hash: typeof node.attrs.hash === 'string' ? node.attrs.hash : '',
    name: typeof node.attrs.name === 'string' ? node.attrs.name : '',
    mime: typeof node.attrs.mime === 'string' ? node.attrs.mime : '',
  };
}

function createAttachmentIcon(): SVGSVGElement {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  const path = document.createElementNS(namespace, 'path');
  svg.setAttribute('class', 'milkdown-attachment__icon-svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  path.setAttribute(
    'd',
    'M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48'
  );
  svg.append(path);
  return svg;
}

function createAttachmentNodeView(
  initialNode: ProseMirrorNode,
  isAvailable: (hash: string) => boolean,
  onPreview: (file: Pick<FileInfo, 'hash' | 'name' | 'mime'>) => void,
  refreshers: Set<() => void>
): NodeView {
  let node = initialNode;

  const dom = document.createElement('div');
  dom.className = 'milkdown-attachment';
  dom.dataset.type = ATTACHMENT_NODE_ID;
  dom.setAttribute('role', 'group');

  const icon = document.createElement('span');
  icon.className = 'milkdown-attachment__icon';
  icon.append(createAttachmentIcon());

  const info = document.createElement('span');
  info.className = 'milkdown-attachment__info';

  const name = document.createElement('span');
  name.className = 'milkdown-attachment__name';

  const meta = document.createElement('span');
  meta.className = 'milkdown-attachment__meta';

  const unavailable = document.createElement('span');
  unavailable.className = 'milkdown-attachment__unavailable';
  unavailable.textContent = '附件不可用';

  const preview = document.createElement('button');
  preview.className = 'milkdown-attachment__preview';
  preview.type = 'button';
  preview.textContent = '预览';
  preview.contentEditable = 'false';
  preview.setAttribute('contenteditable', 'false');

  // 使用 onclick 属性，绕过 ProseMirror 的事件处理
  preview.onclick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const attrs = getNodeAttrs(node);
    if (attrs.hash) onPreview({ hash: attrs.hash, name: attrs.name, mime: attrs.mime });
  };

  // 阻止 pointerdown 事件传播到 ProseMirror
  preview.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });

  info.append(name, meta, unavailable);
  dom.append(icon, info, preview);

  const refresh = () => {
    const attrs = getNodeAttrs(node);
    const available = isAvailable(attrs.hash);
    name.textContent = attrs.name || '未命名附件';
    name.title = attrs.name || '未命名附件';
    meta.textContent = attrs.mime || '未知类型';
    preview.hidden = !available;
    preview.title = `预览 ${attrs.name || '未命名附件'}`;
    preview.setAttribute('aria-label', `预览 ${attrs.name || '未命名附件'}`);
    unavailable.hidden = available;
    dom.classList.toggle('milkdown-attachment--unavailable', !available);
    dom.setAttribute('aria-label', `附件 ${attrs.name || '未命名附件'}`);
  };

  refreshers.add(refresh);
  refresh();

  return {
    dom,
    update(nextNode) {
      if (nextNode.type !== node.type) return false;
      node = nextNode;
      refresh();
      return true;
    },
    selectNode() {
      dom.classList.add('milkdown-attachment--selected');
    },
    deselectNode() {
      dom.classList.remove('milkdown-attachment--selected');
    },
    stopEvent(event) {
      const target = event.target;
      // 如果事件目标是预览按钮或其子元素，阻止 ProseMirror 处理
      if (target instanceof globalThis.Node && preview.contains(target)) {
        return true;
      }
      return false;
    },
    ignoreMutation() {
      return true;
    },
    destroy() {
      refreshers.delete(refresh);
    },
  };
}

function insertAttachmentAtSelection(
  ctx: Ctx,
  attachmentNode: ReturnType<typeof $node>,
  file: FileInfo
): boolean {
  const view = ctx.get(editorViewCtx);
  const { state } = view;
  const nodeType = attachmentNode.type(ctx);
  const paragraphType = state.schema.nodes.paragraph;
  const attachment = nodeType.create({
    hash: file.hash,
    name: file.name,
    mime: file.mime,
  });
  const { $from } = state.selection;
  let transaction = state.tr;
  let selectionPosition: number;

  if ($from.depth > 0) {
    const topLevelNode = $from.node(1);
    const before = $from.before(1);
    const after = $from.after(1);
    const isEmptyParagraph = topLevelNode.type === paragraphType && topLevelNode.content.size === 0;

    if (isEmptyParagraph && paragraphType) {
      const paragraph = paragraphType.create();
      transaction = transaction.replaceWith(
        before,
        after,
        Fragment.fromArray([attachment, paragraph])
      );
      selectionPosition = before + attachment.nodeSize;
    } else {
      const nodes = [attachment];
      if (after === state.doc.content.size && paragraphType) nodes.push(paragraphType.create());
      transaction = transaction.insert(after, Fragment.fromArray(nodes));
      selectionPosition = after + attachment.nodeSize;
    }
  } else {
    const insertionPosition = state.selection.to;
    const nodes = [attachment];
    if (insertionPosition === state.doc.content.size && paragraphType) {
      nodes.push(paragraphType.create());
    }
    transaction = transaction.insert(insertionPosition, Fragment.fromArray(nodes));
    selectionPosition = insertionPosition + attachment.nodeSize;
  }

  transaction = transaction.setSelection(
    TextSelection.near(transaction.doc.resolve(selectionPosition), 1)
  );
  view.dispatch(transaction.scrollIntoView());
  view.focus();
  return true;
}

export interface AttachmentExtension {
  plugins: MilkdownPlugin[];
  insertAttachment: (ctx: Ctx, file: FileInfo) => boolean;
  refreshAvailability: () => void;
}

export function createAttachmentExtension(
  isAvailable: (hash: string) => boolean,
  onPreview: (file: Pick<FileInfo, 'hash' | 'name' | 'mime'>) => void
): AttachmentExtension {
  const refreshers = new Set<() => void>();
  const remarkAttachmentPlugin = createRemarkAttachmentPlugin();

  const attachmentNode = $node(ATTACHMENT_NODE_ID, () => ({
    group: 'block',
    atom: true,
    draggable: true,
    isolating: true,
    selectable: true,
    attrs: {
      hash: { default: '', validate: 'string' },
      name: { default: '', validate: 'string' },
      mime: { default: '', validate: 'string' },
    },
    parseDOM: [
      {
        tag: `div[data-type="${ATTACHMENT_NODE_ID}"]`,
        getAttrs: (dom) => {
          if (!(dom instanceof HTMLElement)) return false;
          return {
            hash: dom.dataset.hash ?? '',
            name: dom.dataset.name ?? '',
            mime: dom.dataset.mime ?? '',
          };
        },
      },
    ],
    toDOM: (node) => {
      const attrs = getNodeAttrs(node);
      return [
        'div',
        {
          'data-type': ATTACHMENT_NODE_ID,
          'data-hash': attrs.hash,
          'data-name': attrs.name,
          'data-mime': attrs.mime,
        },
        attrs.name,
      ];
    },
    parseMarkdown: {
      match: (node) => node.type === ATTACHMENT_NODE_ID,
      runner: (state, node, type) => {
        const attachment = node as AttachmentMarkdownNode;
        const hash = typeof attachment.hash === 'string' ? attachment.hash : '';
        const name = typeof attachment.name === 'string' ? attachment.name : '';
        const mime = typeof attachment.mime === 'string' ? attachment.mime : '';
        if (hash) state.addNode(type, { hash, name, mime });
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === ATTACHMENT_NODE_ID,
      runner: (state, node) => {
        state.addNode('html', undefined, serializeAttachment(getNodeAttrs(node)));
      },
    },
  }));

  const attachmentView = $view(
    attachmentNode,
    () => (node) => createAttachmentNodeView(node, isAvailable, onPreview, refreshers)
  );

  return {
    plugins: [remarkAttachmentPlugin, attachmentNode, attachmentView],
    insertAttachment: (ctx, file) => insertAttachmentAtSelection(ctx, attachmentNode, file),
    refreshAvailability: () => refreshers.forEach((refresh) => refresh()),
  };
}
