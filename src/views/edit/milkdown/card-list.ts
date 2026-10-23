import { editorViewCtx, schemaCtx } from '@milkdown/kit/core';
import { hrSchema } from '@milkdown/kit/preset/commonmark';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import { splitBlock } from '@milkdown/kit/prose/commands';
import type { Ctx } from '@milkdown/kit/ctx';
import { Fragment, Slice, type Node as ProseNode } from '@milkdown/kit/prose/model';
import {
  NodeSelection,
  Plugin,
  TextSelection,
  type SelectionBookmark,
} from '@milkdown/kit/prose/state';
import type { MarkdownNode } from '@milkdown/kit/transformer';
import { $inputRule, $node, $prose, $remark, $view } from '@milkdown/kit/utils';
import type { createImageImport } from './image-import';
import { createCardListView, createCardItemView } from './card-list-view';
import {
  CARD_LIST,
  CARD_ITEM,
  CARD_TEXT,
  CARD_LANGUAGE,
  DEFAULT_CARD_IMAGE_SIZE,
  cardAncestor,
  cardImageSize,
  emptyCard,
  inCardText,
  parseCardList,
  safeCardImage,
  serializeCardList,
  validCardList,
  type CardLayout,
} from './card-list-model';

export interface CardListOptions {
  readonly: () => boolean;
  imageImport: ReturnType<typeof createImageImport>;
  onError: (message: string) => void;
}
export interface CardViewContext extends CardListOptions {
  refreshers: Set<() => void>;
  epoch: () => number;
  sources: Map<symbol, { bookmark: SelectionBookmark; node: ProseNode }>;
}

export function createCardListExtension(options: CardListOptions) {
  let epoch = 0;
  const refreshers = new Set<() => void>();
  const sources: CardViewContext['sources'] = new Map();
  const context: CardViewContext = { ...options, refreshers, sources, epoch: () => epoch };
  const remarkCards = $remark('voex-remark-card-list', (ctx) => () => (tree) => {
    const transform = (node: MarkdownNode) => {
      if (node.type === 'code' && node.lang === CARD_LANGUAGE && typeof node.value === 'string') {
        // 无效数据仍作为代码展示，不能悄悄丢掉用户的正文。
        if (parseCardList(node.value, ctx.get(schemaCtx))) node.type = CARD_LIST;
        return;
      }
      node.children?.forEach(transform);
    };
    transform(tree as MarkdownNode);
  });
  const cardText = $node(CARD_TEXT, () => ({
    content: 'text*',
    marks: 'strong emphasis strike_through inlineCode link textColor highlight',
    defining: true,
    parseDOM: [{ tag: `p[data-type="${CARD_TEXT}"]` }],
    toDOM: () => [
      'p',
      { 'data-type': CARD_TEXT, class: 'milkdown-card__text', 'data-placeholder': '输入文字…' },
      0,
    ],
    parseMarkdown: { match: () => false, runner: () => undefined },
    toMarkdown: {
      match: (node) => node.type.name === CARD_TEXT,
      runner: (state, node) => state.openNode('paragraph').next(node.content).closeNode(),
    },
  }));
  const cardItem = $node(CARD_ITEM, () => ({
    content: `${CARD_TEXT}+`,
    isolating: true,
    defining: true,
    selectable: false,
    attrs: { src: { default: '', validate: 'string' }, alt: { default: '', validate: 'string' } },
    parseDOM: [
      {
        tag: `div[data-type="${CARD_ITEM}"]`,
        contentElement: '.milkdown-card__body',
        getAttrs: (dom) => ({ src: safeCardImage(dom.dataset.src), alt: dom.dataset.alt ?? '' }),
      },
    ],
    toDOM: (node) => [
      'div',
      { 'data-type': CARD_ITEM, 'data-src': node.attrs.src, 'data-alt': node.attrs.alt },
      ['div', { class: 'milkdown-card__body' }, 0],
    ],
    parseMarkdown: { match: () => false, runner: () => undefined },
    toMarkdown: {
      match: (node) => node.type.name === CARD_ITEM,
      runner: (state, node) => state.next(node.content),
    },
  }));
  const cardList = $node(CARD_LIST, () => ({
    group: 'block',
    content: `${CARD_ITEM}+`,
    isolating: true,
    defining: true,
    selectable: true,
    draggable: true,
    attrs: {
      layout: { default: 'vertical', validate: 'string' },
      imageSize: { default: DEFAULT_CARD_IMAGE_SIZE, validate: 'number' },
    },
    parseDOM: [
      {
        tag: `section[data-type="${CARD_LIST}"]`,
        contentElement: '.milkdown-cards__items',
        getAttrs: (dom) => ({
          layout: dom.dataset.layout === 'horizontal' ? 'horizontal' : 'vertical',
          imageSize: cardImageSize(dom.dataset.imageSize ?? DEFAULT_CARD_IMAGE_SIZE),
        }),
      },
    ],
    toDOM: (node) => [
      'section',
      {
        'data-type': CARD_LIST,
        'data-layout': node.attrs.layout,
        'data-image-size': node.attrs.imageSize,
      },
      ['div', { class: 'milkdown-cards__items' }, 0],
    ],
    parseMarkdown: {
      match: (node) => node.type === CARD_LIST,
      runner: (state, node, type) => {
        const parsed = parseCardList(String(node.value), state.schema);
        if (parsed) {
          const children: ProseNode[] = [];
          parsed.forEach((item) => children.push(item));
          state.addNode(type, parsed.attrs, children);
        }
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === CARD_LIST,
      runner: (state, node) =>
        state.addNode('code', undefined, serializeCardList(node), { lang: CARD_LANGUAGE }),
    },
  }));

  function textSlice(slice: Slice, view: Parameters<typeof createCardListView>[1]): Slice {
    const paragraphs: ProseNode[] = [];
    let inline: ProseNode[] = [];
    const flush = () => {
      paragraphs.push(view.state.schema.nodes[CARD_TEXT]!.create(null, inline));
      inline = [];
    };
    const visit = (node: ProseNode) => {
      if (node.isText) {
        const type = view.state.schema.nodes[CARD_TEXT]!;
        inline.push(node.mark(node.marks.filter((mark) => type.allowsMarkType(mark.type))));
      } else if (node.type.name === 'voex_emoji' && node.attrs.char) {
        inline.push(view.state.schema.text(String(node.attrs.char)));
      } else if (node.type.name === 'hardbreak') flush();
      else if (!node.isLeaf) {
        node.forEach(visit);
        if (node.isTextblock) flush();
      }
    };
    slice.content.forEach(visit);
    if (inline.length || !paragraphs.length) flush();
    return new Slice(Fragment.fromArray(paragraphs), 1, 1);
  }

  const safeHr = $inputRule(
    (ctx) =>
      new InputRule(/^(?:---|___\s|\*\*\*\s)$/, (state, match, start, end) => {
        if (inCardText(state.selection)) return null;
        return match[0] ? state.tr.replaceWith(start - 1, end, hrSchema.type(ctx).create()) : null;
      })
  );

  const guard = $prose(
    () =>
      new Plugin({
        state: {
          init: () => null,
          apply: (tr) => {
            sources.forEach((source, key) =>
              sources.set(key, { ...source, bookmark: source.bookmark.map(tr.mapping) })
            );
            return null;
          },
        },
        filterTransaction: (tr) => {
          if (!tr.docChanged) return true;
          let valid = true;
          tr.doc.descendants((node) => {
            if (node.type.name === CARD_LIST) {
              valid &&= validCardList(node);
              return false;
            }
          });
          return valid;
        },
        props: {
          handlePaste(view, event, slice) {
            if (!inCardText(view.state.selection)) return false;
            if (options.readonly()) return true;
            if (event.clipboardData?.files.length && !event.clipboardData.getData('text/plain')) {
              options.onError('文字区域只支持文字，请将图片添加到卡片的图片区域');
              return true;
            }
            const text = textSlice(slice, view);
            if (!text.content.textBetween(0, text.content.size) && slice.content.size) {
              options.onError('文字区域只支持文字，请使用卡片的图片区域添加图片');
              return true;
            }
            view.dispatch(view.state.tr.replaceSelection(text).scrollIntoView());
            return true;
          },
          handleDrop(view, event, slice, moved) {
            const target = event.target instanceof Element ? event.target : null;
            const position = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (
              !target?.closest('.milkdown-card__body') &&
              !(position && cardAncestor(view.state.doc.resolve(position.pos)))
            )
              return false;
            if (options.readonly()) return true;
            // 图片区域由 NodeView 处理；正文拒绝整个拖放，防止拟合到组件外部。
            let textOnly = !event.dataTransfer?.files.length;
            slice.content.descendants((node) => {
              if (node.isLeaf && !node.isText) textOnly = false;
            });
            if (!textOnly || !position) {
              options.onError('文字区域只支持文字，请将图片拖到卡片的图片区域');
              return true;
            }
            const text = textSlice(slice, view);
            if (!text.content.textBetween(0, text.content.size)) return true;
            const { selection } = view.state;
            if (moved && position.pos >= selection.from && position.pos <= selection.to)
              return true;
            const tr = view.state.tr;
            if (moved) tr.deleteSelection();
            const targetPos = tr.mapping.map(position.pos);
            tr.setSelection(TextSelection.near(tr.doc.resolve(targetPos)));
            view.dispatch(tr.replaceSelection(text).scrollIntoView());
            return true;
          },
          handleKeyDown(view, event) {
            if (options.readonly() || event.isComposing || view.composing) return false;
            const ancestor = cardAncestor(view.state.selection.$from);
            if (!ancestor) return false;
            if (event.key === 'Enter' && event.shiftKey)
              return splitBlock(view.state, view.dispatch);
            if (event.key === 'Escape') {
              view.dispatch(
                view.state.tr.setSelection(NodeSelection.create(view.state.doc, ancestor.pos))
              );
              view.focus();
              return true;
            }
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              const after = ancestor.pos + ancestor.node.nodeSize;
              const tr = view.state.tr;
              if (!tr.doc.nodeAt(after)?.isTextblock)
                tr.insert(after, view.state.schema.nodes.paragraph!.create());
              view.dispatch(
                tr.setSelection(TextSelection.near(tr.doc.resolve(after), 1)).scrollIntoView()
              );
              view.focus();
              return true;
            }
            return false;
          },
        },
      })
  );
  return {
    guardPlugins: [guard],
    plugins: [
      ...remarkCards,
      cardText,
      cardItem,
      cardList,
      safeHr,
      $view(
        cardList,
        () => (node, view, getPos) => createCardListView(node, view, getPos, context)
      ),
      $view(
        cardItem,
        () => (node, view, getPos) => createCardItemView(node, view, getPos, context)
      ),
    ],
    readonlyChanged() {
      epoch++;
      sources.clear();
      refreshers.forEach((refresh) => refresh());
    },
    insert(ctx: Ctx, layout: CardLayout) {
      const view = ctx.get(editorViewCtx);
      if (options.readonly() || view.isDestroyed || inCardText(view.state.selection)) return;
      if (view.state.selection.$from.parent.type.spec.code) return;
      const node = cardList
        .type(ctx)
        .create({ layout }, [emptyCard(view.state.schema), emptyCard(view.state.schema)]);
      const tr = view.state.tr.replaceSelectionWith(node, false);
      let position = -1;
      tr.doc.descendants((current, pos) => {
        if (current === node) position = pos;
      });
      if (position >= 0) tr.setSelection(NodeSelection.create(tr.doc, position));
      view.dispatch(tr.scrollIntoView());
      view.focus();
    },
  };
}
