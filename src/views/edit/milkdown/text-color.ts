import { editorViewCtx, remarkStringifyOptionsCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { MarkdownNode } from '@milkdown/kit/transformer';
import { $mark, $remark } from '@milkdown/kit/utils';

export type TextColorKind = 'textColor' | 'highlight';

const colors = {
  textColor: { attribute: 'data-voex-text-color', style: 'color' },
  highlight: { attribute: 'data-voex-highlight', style: 'background-color' },
} as const;
const kinds: TextColorKind[] = ['textColor', 'highlight'];

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value.trim())) return null;
  const hex = value.trim().slice(1).toUpperCase();
  return `#${hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex}`;
}

function readColorTag(node: MarkdownNode) {
  if (node.type !== 'html' || typeof node.value !== 'string') return null;
  for (const kind of kinds) {
    const { attribute, style } = colors[kind];
    // 仅解析本扩展生成的标签；其他 HTML 与非法颜色保持原样。
    const match = node.value.match(
      new RegExp(`^<span ${attribute}="(#[\\da-f]{6})" style="${style}: \\1">$`, 'i')
    );
    if (match) return { kind, color: normalizeHexColor(match[1])! };
  }
  return null;
}

function transformColors(node: MarkdownNode): void {
  if (!node.children || ['code', 'inlineCode', 'html'].includes(node.type)) return;
  const children = node.children;
  // 先配对所有 span，避免嵌套的普通 HTML span 提前关闭颜色范围。
  const stack: number[] = [];
  const pairs = new Map<number, number>();
  children.forEach((child, index) => {
    if (child.type !== 'html' || typeof child.value !== 'string') return;
    if (/^<span(?:\s[^>]*)?>$/i.test(child.value)) stack.push(index);
    else if (/^<\/span\s*>$/i.test(child.value)) {
      const start = stack.pop();
      if (start !== undefined) pairs.set(start, index);
    }
  });
  const result: MarkdownNode[] = [];
  for (let index = 0; index < children.length; index++) {
    const child = children[index]!;
    const tag = readColorTag(child);
    const end = pairs.get(index);
    if (tag && end !== undefined) {
      const colored: MarkdownNode = {
        type: tag.kind,
        color: tag.color,
        children: children.slice(index + 1, end),
      };
      transformColors(colored);
      result.push(colored);
      index = end;
    } else {
      transformColors(child);
      result.push(child);
    }
  }
  node.children = result;
}

export function createTextColorExtension() {
  const remarkColors = $remark('voex-remark-text-color', () => () => (tree) => {
    transformColors(tree as MarkdownNode);
  });
  const marks = kinds.map((kind) => {
    const { attribute, style } = colors[kind];
    return $mark(kind, () => ({
      attrs: { color: { validate: 'string' } },
      parseDOM: [
        {
          tag: `span[${attribute}]`,
          getAttrs: (dom) => {
            const color = normalizeHexColor(dom.getAttribute(attribute));
            return color ? { color } : false;
          },
        },
      ],
      toDOM: (mark) => {
        const color = normalizeHexColor(mark.attrs.color);
        return ['span', color ? { [attribute]: color, style: `${style}: ${color}` } : {}, 0];
      },
      parseMarkdown: {
        match: (node) => node.type === kind,
        runner: (state, node, type) => {
          const color = normalizeHexColor(node.color);
          if (color) state.openMark(type, { color });
          state.next(node.children ?? []);
          if (color) state.closeMark(type);
        },
      },
      toMarkdown: {
        match: (mark) => mark.type.name === kind,
        runner: (state, mark) => {
          state.withMark(mark, kind, undefined, { color: mark.attrs.color });
        },
      },
    }));
  });

  function configure(ctx: Ctx) {
    ctx.update(remarkStringifyOptionsCtx, (options) => {
      const handlers: Record<string, NonNullable<typeof options.handlers>['html']> = {
        ...options.handlers,
      };
      kinds.forEach((kind) => {
        handlers[kind] = (node, _parent, state, info) => {
          const color = normalizeHexColor((node as unknown as MarkdownNode).color);
          const { attribute, style } = colors[kind];
          const opening = color ? `<span ${attribute}="${color}" style="${style}: ${color}">` : '';
          const closing = color ? '</span>' : '';
          const tracker = state.createTracker(info);
          const before = tracker.move(opening);
          const content = tracker.move(
            state.containerPhrasing(node as Parameters<typeof state.containerPhrasing>[0], {
              ...tracker.current(),
              before: opening ? '>' : info.before,
              after: closing ? '<' : info.after,
            })
          );
          return before + content + tracker.move(closing);
        };
      });
      return { ...options, handlers };
    });
  }

  function enabled(ctx: Ctx, kind: TextColorKind): boolean {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const type = state.schema.marks[kind];
    if (!view.editable || view.isDestroyed || !type || !(state.selection instanceof TextSelection))
      return false;
    const { from, to, empty, $from } = state.selection;
    if (empty)
      return (
        $from.parent.type.allowsMarkType(type) &&
        !(state.storedMarks ?? $from.marks()).some((mark) => mark.type.spec.code)
      );
    let applicable = false;
    state.doc.nodesBetween(from, to, (node, _pos, parent) => {
      if (
        node.isText &&
        parent?.type.allowsMarkType(type) &&
        !node.marks.some((mark) => mark.type.spec.code)
      )
        applicable = true;
    });
    return applicable;
  }

  function selected(ctx: Ctx, kind: TextColorKind): string | null {
    const { state } = ctx.get(editorViewCtx);
    const type = state.schema.marks[kind];
    if (!type) return null;
    const { from, to, empty, $from } = state.selection;
    if (empty)
      return normalizeHexColor(type.isInSet(state.storedMarks ?? $from.marks())?.attrs.color);
    let color: string | null | undefined;
    state.doc.nodesBetween(from, to, (node) => {
      if (!node.isText) return;
      const value = normalizeHexColor(type.isInSet(node.marks)?.attrs.color);
      color = color === undefined ? value : color === value ? color : null;
    });
    return color ?? null;
  }

  function active(ctx: Ctx, kind: TextColorKind): boolean {
    const { state } = ctx.get(editorViewCtx);
    const type = state.schema.marks[kind];
    if (!type) return false;
    return state.selection.empty
      ? !!type.isInSet(state.storedMarks ?? state.selection.$from.marks())
      : state.doc.rangeHasMark(state.selection.from, state.selection.to, type);
  }

  function apply(ctx: Ctx, kind: TextColorKind, value: string | null) {
    if (!enabled(ctx, kind)) throw new Error('请将光标移到正文或选中可设置颜色的文字');
    const color = value === null ? null : normalizeHexColor(value);
    if (value !== null && !color) throw new Error('请输入 HEX 颜色，例如 #F00 或 #FF0000');
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const type = state.schema.marks[kind]!;
    const { from, to, empty } = state.selection;
    const tr = state.tr;
    if (empty) {
      if (color) tr.addStoredMark(type.create({ color }));
      else tr.removeStoredMark(type);
    } else if (color) {
      const mark = type.create({ color });
      state.doc.nodesBetween(from, to, (node, position, parent) => {
        if (
          node.isInline &&
          parent?.type.allowsMarkType(type) &&
          !node.marks.some((existing) => existing.type.spec.code)
        )
          tr.addMark(Math.max(from, position), Math.min(to, position + node.nodeSize), mark);
      });
    } else tr.removeMark(from, to, type);
    view.dispatch(tr.scrollIntoView());
  }

  return { plugins: [...remarkColors, ...marks], configure, enabled, selected, active, apply };
}
