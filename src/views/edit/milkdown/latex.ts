import { editorViewCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import { NodeSelection, TextSelection, Plugin } from '@milkdown/kit/prose/state';
import type { NodeView } from '@milkdown/kit/prose/view';
import type { MarkdownNode } from '@milkdown/kit/transformer';
import { $node, $prose, $remark, $view } from '@milkdown/kit/utils';
import { renderLatex } from './latex-renderer';

export const LATEX_NODE_ID = 'voex_latex';
export interface LatexAttrs {
  code: string;
  color: string;
  height: number;
  size: number;
}
export const DEFAULT_LATEX: LatexAttrs = { code: '', color: '#333333', height: 160, size: 32 };
export const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{6})$/i;

export function readLatexAttrs(value: unknown): LatexAttrs | null {
  if (!value || typeof value !== 'object') return null;
  const attrs = value as Record<string, unknown>;
  if (
    typeof attrs.code !== 'string' ||
    !attrs.code.trim() ||
    typeof attrs.color !== 'string' ||
    !HEX_COLOR.test(attrs.color) ||
    typeof attrs.height !== 'number' ||
    !Number.isSafeInteger(attrs.height) ||
    attrs.height < 1 ||
    typeof attrs.size !== 'number' ||
    !Number.isInteger(attrs.size) ||
    attrs.size < 1 ||
    attrs.size > 999
  )
    return null;
  return { code: attrs.code, color: attrs.color, height: attrs.height, size: attrs.size };
}

function serializeLatex(attrs: LatexAttrs): string {
  const { code, ...styles } = attrs;
  return `[${JSON.stringify(styles)}]latex(${JSON.stringify(code)})`;
}

function parseLatex(value: string): LatexAttrs | null {
  const raw = value.trim();
  if (!raw.startsWith('[{') || !raw.endsWith(')')) return null;
  // 分隔点右侧必须为一个完整 JSON 字符串，源码中的引号、反斜杠和换行不会丢失。
  const boundary = raw.indexOf(']latex(');
  if (boundary < 0) return null;
  try {
    const styles: unknown = JSON.parse(raw.slice(1, boundary));
    const code: unknown = JSON.parse(raw.slice(boundary + 7, -1));
    if (!styles || typeof styles !== 'object' || Array.isArray(styles)) return null;
    return readLatexAttrs({ ...DEFAULT_LATEX, ...styles, code });
  } catch {
    return null;
  }
}

function transformLatex(node: MarkdownNode, source: string): void {
  if (!node.children || ['code', 'inlineCode'].includes(node.type)) return;
  node.children = node.children.map((child) => {
    if (child.type === 'paragraph') {
      const start = child.position?.start.offset;
      const end = child.position?.end.offset;
      // 使用原始 Markdown，避免 CommonMark 先消耗 LaTeX 的反斜杠或下划线。
      const attrs =
        start !== undefined && end !== undefined ? parseLatex(source.slice(start, end)) : null;
      if (attrs) return { type: LATEX_NODE_ID, ...attrs };
    }
    transformLatex(child, source);
    return child;
  });
}

interface LatexOptions {
  readonly: () => boolean;
  onEdit: (position: number) => void;
}

export function createLatexExtension(options: LatexOptions) {
  const refreshers = new Set<() => void>();
  const remarkLatex = $remark('voex-remark-latex', () => () => (tree, file) => {
    transformLatex(tree as MarkdownNode, String(file));
  });
  const latexNode = $node(LATEX_NODE_ID, () => ({
    group: 'block',
    atom: true,
    isolating: true,
    selectable: true,
    draggable: true,
    attrs: {
      code: { default: '', validate: 'string' },
      color: { default: DEFAULT_LATEX.color, validate: 'string' },
      height: { default: DEFAULT_LATEX.height, validate: 'number' },
      size: { default: DEFAULT_LATEX.size, validate: 'number' },
    },
    leafText: (node) => serializeLatex(node.attrs as LatexAttrs),
    parseDOM: [
      {
        tag: `div[data-type="${LATEX_NODE_ID}"]`,
        getAttrs: (dom) => {
          try {
            return readLatexAttrs(JSON.parse(dom.getAttribute('data-latex') ?? '')) ?? false;
          } catch {
            return false;
          }
        },
      },
    ],
    toDOM: (node) => [
      'div',
      { 'data-type': LATEX_NODE_ID, 'data-latex': JSON.stringify(node.attrs) },
      node.attrs.code as string,
    ],
    parseMarkdown: {
      match: (node) => node.type === LATEX_NODE_ID,
      runner: (state, node, type) => {
        const attrs = readLatexAttrs(node);
        if (attrs) state.addNode(type, attrs);
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === LATEX_NODE_ID,
      runner: (state, node) =>
        state.addNode('html', undefined, serializeLatex(node.attrs as LatexAttrs)),
    },
  }));
  const latexView = $view(latexNode, () => (initialNode, view, getPos): NodeView => {
    let node = initialNode;
    let renderedCode: string | undefined;
    let version = 0;
    let destroyed = false;
    const dom = document.createElement('div');
    dom.className = 'milkdown-latex';
    dom.contentEditable = 'false';
    dom.dataset.type = LATEX_NODE_ID;
    dom.setAttribute('role', 'group');
    const viewport = document.createElement('div');
    viewport.className = 'milkdown-latex__viewport';
    const feedback = document.createElement('span');
    feedback.className = 'milkdown-latex__feedback';
    feedback.setAttribute('role', 'status');
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'milkdown-latex__edit';
    edit.textContent = '编辑公式';
    edit.onmousedown = (event) => event.preventDefault();
    edit.onclick = () => {
      const position = getPos();
      if (!options.readonly() && position !== undefined) options.onEdit(position);
    };
    dom.append(viewport, feedback, edit);

    function refresh() {
      const attrs = node.attrs as LatexAttrs;
      dom.dataset.latex = JSON.stringify(attrs);
      dom.style.height = `${attrs.height}px`;
      dom.style.fontSize = `${attrs.size}px`;
      dom.style.color = attrs.color;
      dom.setAttribute('aria-label', `LaTeX 公式：${attrs.code}`);
      edit.hidden = options.readonly();
      edit.disabled = options.readonly();
      if (renderedCode === attrs.code) return;
      renderedCode = attrs.code;
      const current = ++version;
      viewport.replaceChildren();
      feedback.hidden = false;
      feedback.textContent = '正在渲染公式…';
      void renderLatex(attrs.code)
        .then((svg) => {
          if (destroyed || current !== version) return;
          viewport.replaceChildren(svg);
          feedback.hidden = true;
        })
        .catch((cause: unknown) => {
          if (destroyed || current !== version) return;
          feedback.textContent = cause instanceof Error ? cause.message : '公式渲染失败';
          renderedCode = undefined;
        });
    }
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
      stopEvent: (event) => event.target instanceof Element && !!event.target.closest('button'),
      ignoreMutation: () => true,
      destroy() {
        destroyed = true;
        version++;
        refreshers.delete(refresh);
        edit.onclick = null;
        edit.onmousedown = null;
      },
    };
  });
  const latexEditing = $prose(
    () =>
      new Plugin({
        props: {
          handleKeyDown(view, event) {
            const selection = view.state.selection;
            if (
              event.key !== 'Enter' ||
              event.isComposing ||
              options.readonly() ||
              !(selection instanceof NodeSelection) ||
              selection.node.type.name !== LATEX_NODE_ID
            )
              return false;
            options.onEdit(selection.from);
            return true;
          },
        },
      })
  );
  return {
    plugins: [...remarkLatex, latexNode, latexView, latexEditing],
    readonlyChanged: () => refreshers.forEach((refresh) => refresh()),
    selected(ctx: Ctx): LatexAttrs | null {
      const selection = ctx.get(editorViewCtx).state.selection;
      return selection instanceof NodeSelection && selection.node.type.name === LATEX_NODE_ID
        ? readLatexAttrs(selection.node.attrs)
        : null;
    },
    select(ctx: Ctx, position: number) {
      const view = ctx.get(editorViewCtx);
      if (view.state.doc.nodeAt(position)?.type.name !== LATEX_NODE_ID) return;
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)));
    },
    insert(ctx: Ctx, attrs: LatexAttrs, editing: boolean) {
      if (options.readonly() || !readLatexAttrs(attrs))
        throw new Error('当前文档不可编辑或公式参数无效');
      const view = ctx.get(editorViewCtx);
      const { state } = view;
      const selected = state.selection;
      if (editing) {
        if (!(selected instanceof NodeSelection) || selected.node.type.name !== LATEX_NODE_ID)
          throw new Error('原公式已被移除，请关闭弹窗后重试');
        view.dispatch(state.tr.setNodeMarkup(selected.from, undefined, attrs).scrollIntoView());
        return;
      }
      if (selected.$from.parent.type.spec.code) throw new Error('请将光标移到正文后插入公式');
      const transaction = state.tr.replaceSelectionWith(latexNode.type(ctx).create(attrs), false);
      const after = transaction.selection.to;
      if (after === transaction.doc.content.size) {
        const paragraph = state.schema.nodes.paragraph;
        if (paragraph) transaction.insert(after, paragraph.create());
        transaction.setSelection(TextSelection.near(transaction.doc.resolve(after), 1));
      }
      view.dispatch(transaction.scrollIntoView());
    },
  };
}
