import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { closeHistory } from '@milkdown/kit/prose/history';
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView, NodeView } from '@milkdown/kit/prose/view';
import type { CardViewContext } from './card-list';
import {
  CARD_LIST,
  CARD_ITEM,
  MIN_CARD_IMAGE_SIZE,
  MAX_CARD_IMAGE_SIZE,
  cardAncestor,
  cardImageSize,
  emptyCard,
  safeCardImage,
  type CardLayout,
} from './card-list-model';

type GetPos = () => number | undefined;
function button(doc: Document, label: string, icon?: string) {
  const element = doc.createElement('button');
  element.type = 'button';
  element.className = 'milkdown-cards__button';
  element.title = label;
  element.setAttribute('aria-label', label);
  if (icon) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#icon-${icon}`);
    svg.append(use);
    element.append(svg);
  } else element.textContent = label;
  element.onmousedown = (event) => event.preventDefault();
  return element;
}

export function createCardListView(
  initial: ProseNode,
  view: EditorView,
  getPos: GetPos,
  options: CardViewContext
): NodeView {
  const doc = view.dom.ownerDocument;
  let node = initial;
  let selected = false;
  let destroyed = false;
  const canEdit = () => !destroyed && !view.isDestroyed && !options.readonly();
  const dom = doc.createElement('section');
  dom.className = 'milkdown-cards';
  dom.dataset.type = CARD_LIST;
  dom.setAttribute('role', 'group');
  dom.setAttribute('aria-label', '卡片列表');
  const tools = doc.createElement('div');
  tools.className = 'milkdown-cards__tools';
  tools.contentEditable = 'false';
  tools.dataset.minimapIgnore = '';
  const select = button(doc, '选中整个卡片列表', 'grid');
  const title = doc.createElement('span');
  title.className = 'milkdown-cards__title';
  const add = button(doc, '添加卡片', 'add');
  const controls = doc.createElement('div');
  controls.className = 'milkdown-cards__controls';
  const horizontal = button(doc, '横向布局', 'grid');
  const vertical = button(doc, '纵向布局', 'list');
  const sizeLabel = doc.createElement('label');
  sizeLabel.className = 'milkdown-cards__size';
  sizeLabel.append('图片尺寸');
  const size = doc.createElement('input');
  size.type = 'range';
  size.min = String(MIN_CARD_IMAGE_SIZE);
  size.max = String(MAX_CARD_IMAGE_SIZE);
  size.step = '1';
  size.setAttribute('aria-label', '所有卡片的图片尺寸');
  const output = doc.createElement('output');
  sizeLabel.append(size, output);
  controls.append(horizontal, vertical, sizeLabel);
  tools.append(select, title, controls, add);
  const contentDOM = doc.createElement('div');
  contentDOM.className = 'milkdown-cards__items';
  dom.append(tools, contentDOM);

  function selectList() {
    const pos = getPos();
    if (!canEdit() || pos === undefined) return;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    view.focus();
  }
  select.onclick = selectList;
  function changeLayout(layout: CardLayout) {
    const pos = getPos();
    if (!canEdit() || !selected || pos === undefined) return;
    if (layout === 'horizontal' && node.childCount > 4) {
      options.onError('横向布局最多 4 张卡片，请先移除多余卡片');
      return;
    }
    const tr = closeHistory(view.state.tr).setNodeMarkup(pos, undefined, { ...node.attrs, layout });
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)));
  }
  horizontal.onclick = () => changeLayout('horizontal');
  vertical.onclick = () => changeLayout('vertical');
  add.onclick = () => {
    const pos = getPos();
    if (
      !canEdit() ||
      pos === undefined ||
      (node.attrs.layout === 'horizontal' && node.childCount >= 4)
    )
      return;
    const end = pos + node.nodeSize - 1;
    const tr = closeHistory(view.state.tr).insert(end, emptyCard(view.state.schema));
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 2)).scrollIntoView());
    view.focus();
  };
  const previewSize = () => {
    if (!canEdit() || !selected) return;
    const value = cardImageSize(size.value);
    dom.style.setProperty('--card-image-size', `${value}px`);
    output.value = `${value}px`;
  };
  size.oninput = previewSize;
  size.onchange = () => {
    const pos = getPos();
    if (!canEdit() || !selected || pos === undefined) return;
    const imageSize = cardImageSize(size.value);
    if (imageSize !== node.attrs.imageSize) {
      const tr = closeHistory(view.state.tr).setNodeMarkup(pos, undefined, { ...node.attrs, imageSize });
      view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)));
    }
  };
  size.onkeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      refresh();
      selectList();
    }
  };
  size.onpointercancel = () => refresh();
  function refresh() {
    const editable = canEdit();
    dom.dataset.layout = node.attrs.layout;
    dom.dataset.imageSize = String(node.attrs.imageSize);
    dom.dataset.readonly = String(!editable);
    dom.classList.toggle('milkdown-cards--selected', selected && editable);
    dom.style.setProperty('--card-count', String(node.childCount));
    dom.style.setProperty('--card-image-size', `${node.attrs.imageSize}px`);
    tools.hidden = !editable;
    controls.hidden = !selected || !editable;
    select.disabled = !editable;
    select.setAttribute('aria-pressed', String(selected));
    title.textContent = `卡片列表 · ${node.childCount}`;
    add.disabled = !editable || (node.attrs.layout === 'horizontal' && node.childCount >= 4);
    add.title = add.disabled ? '横向布局最多 4 张卡片' : '添加卡片';
    horizontal.disabled = !editable || node.childCount > 4;
    horizontal.title = node.childCount > 4 ? '横向布局最多 4 张卡片，请先移除多余卡片' : '横向布局';
    vertical.disabled = !editable;
    horizontal.setAttribute('aria-pressed', String(node.attrs.layout === 'horizontal'));
    vertical.setAttribute('aria-pressed', String(node.attrs.layout === 'vertical'));
    size.disabled = !selected || !editable;
    size.value = String(node.attrs.imageSize);
    output.value = `${node.attrs.imageSize}px`;
  }
  options.refreshers.add(refresh);
  refresh();
  queueMicrotask(() => { if (!destroyed) refresh(); });
  return {
    dom,
    contentDOM,
    update(next) {
      if (next.type !== node.type) return false;
      node = next;
      refresh();
      return true;
    },
    selectNode() {
      selected = true;
      refresh();
    },
    deselectNode() {
      selected = false;
      refresh();
    },
    stopEvent: (event) => event.target instanceof Node && tools.contains(event.target),
    ignoreMutation: (mutation) =>
      mutation.type !== 'selection' && !contentDOM.contains(mutation.target),
    destroy() {
      destroyed = true;
      options.refreshers.delete(refresh);
    },
  };
}

export function createCardItemView(
  initial: ProseNode,
  view: EditorView,
  getPos: GetPos,
  options: CardViewContext
): NodeView {
  const doc = view.dom.ownerDocument;
  let node = initial;
  let destroyed = false;
  let busy = false;
  let feedbackMessage = '';
  let loading = false;
  let failed = false;
  let source: string | undefined;
  let loadVersion = 0;
  let operation = 0;
  const canEdit = () => !destroyed && !view.isDestroyed && !options.readonly();
  const dom = doc.createElement('div');
  dom.className = 'milkdown-card';
  dom.dataset.type = CARD_ITEM;
  const media = doc.createElement('div');
  media.className = 'milkdown-card__media';
  media.contentEditable = 'false';
  const image = doc.createElement('img');
  image.className = 'milkdown-card__image';
  image.draggable = false;
  const feedback = doc.createElement('span');
  feedback.className = 'milkdown-card__feedback';
  feedback.setAttribute('role', 'status');
  const upload = button(doc, '点击或者拖拽文档中的图片添加', 'image');
  upload.classList.add('milkdown-card__upload');
  const hint = doc.createElement('span');
  hint.textContent = '点击或者拖拽文档中的图片添加';
  upload.append(hint);
  const actions = doc.createElement('div');
  actions.className = 'milkdown-card__actions';
  const remove = button(doc, '移除图片', 'trash');
  const replace = button(doc, '替换图片', 'refresh');
  actions.append(remove, replace);
  const picker = doc.createElement('input');
  picker.type = 'file';
  picker.accept = 'image/*';
  picker.hidden = true;
  const removeCard = button(doc, '删除卡片', 'close');
  removeCard.classList.add('milkdown-card__remove');
  removeCard.contentEditable = 'false';
  removeCard.dataset.minimapIgnore = '';
  media.append(image, upload, actions, feedback, picker);
  const contentDOM = doc.createElement('div');
  contentDOM.className = 'milkdown-card__body';
  dom.append(media, contentDOM, removeCard);
  const feedbackError = (message: string) => {
    feedbackMessage = message;
    feedback.textContent = message;
    feedback.hidden = false;
    options.onError(message);
  };
  function setImage(src: string, alt: string) {
    const pos = getPos();
    if (!canEdit() || pos === undefined) return;
    view.dispatch(
      closeHistory(view.state.tr).setNodeMarkup(pos, undefined, { ...node.attrs, src, alt })
    );
  }
  function chooseFile() {
    if (!canEdit() || busy) return;
    picker.value = '';
    picker.click();
  }
  upload.onclick = chooseFile;
  replace.onclick = chooseFile;
  remove.onclick = () => {
    if (canEdit() && !busy) {
      operation++;
      feedbackMessage = '';
      setImage('', '');
      upload.focus();
    }
  };
  removeCard.onclick = () => {
    const pos = getPos();
    if (!canEdit() || pos === undefined) return;
    const parent = cardAncestor(view.state.doc.resolve(pos));
    if (!parent) return;
    const tr = closeHistory(view.state.tr);
    if (parent.node.childCount === 1)
      tr.replaceWith(
        parent.pos,
        parent.pos + parent.node.nodeSize,
        view.state.schema.nodes.paragraph!.create()
      );
    else tr.delete(pos, pos + node.nodeSize);
    view.dispatch(
      tr
        .setSelection(TextSelection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size))))
        .scrollIntoView()
    );
    view.focus();
  };
  async function importImage(
    files: File[] | null,
    dragged: ProseNode | null,
    replaceExisting: boolean,
    moveSource?: { node: ProseNode; bookmark: ReturnType<NodeSelection['getBookmark']> }
  ) {
    if (!canEdit() || busy || (!replaceExisting && node.attrs.src)) return;
    if (files && (files.length !== 1 || !files[0]!.type.startsWith('image/'))) {
      feedbackError('每张卡片只能添加一张图片，请选择图片文件');
      return;
    }
    const initialSource = node.attrs.src;
    const current = ++operation;
    const epoch = options.epoch();
    const key = Symbol('card-image-source');
    if (moveSource) options.sources.set(key, moveSource);
    busy = true;
    feedbackMessage = '';
    refresh();
    try {
      const imported = files
        ? (await options.imageImport.importImages(view, files))[0]
        : dragged
          ? await options.imageImport.importSource(view, dragged)
          : null;
      const pos = getPos();
      if (
        !imported ||
        !canEdit() ||
        current !== operation ||
        epoch !== options.epoch() ||
        pos === undefined ||
        node.attrs.src !== initialSource
      )
        return;
      const src = safeCardImage(imported.attrs.src);
      if (!src) throw new Error('图片地址无效，请重新上传');
      const tr = closeHistory(view.state.tr).setNodeMarkup(pos, undefined, {
        ...node.attrs,
        src,
        alt: imported.attrs.alt ?? '',
      });
      const origin = options.sources.get(key);
      if (origin) {
        const selected = origin.bookmark.resolve(view.state.doc);
        if (selected instanceof NodeSelection && selected.node === origin.node)
          tr.delete(selected.from, selected.to);
      }
      view.dispatch(tr.scrollIntoView());
    } catch (cause) {
      if (canEdit() && current === operation && epoch === options.epoch())
        feedbackError(cause instanceof Error ? cause.message : '图片上传失败，请重试');
    } finally {
      options.sources.delete(key);
      if (!destroyed && current === operation) {
        busy = false;
        refresh();
      }
    }
  }
  picker.onchange = () => {
    const files = Array.from(picker.files ?? []);
    if (files.length) void importImage(files, null, true);
  };
  media.ondragover = (event) => {
    if (!canEdit()) return;
    event.preventDefault();
    event.stopPropagation();
    const allowed = !node.attrs.src && !busy;
    if (event.dataTransfer) event.dataTransfer.dropEffect = allowed ? (view.dragging?.move ? 'move' : 'copy') : 'none';
    media.classList.toggle('milkdown-card__media--dragover', allowed);
  };
  media.ondragleave = (event) => {
    if (!(event.relatedTarget instanceof Node) || !media.contains(event.relatedTarget))
      media.classList.remove('milkdown-card__media--dragover');
  };
  media.ondrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    media.classList.remove('milkdown-card__media--dragover');
    const dragging = view.dragging;
    view.dragging = null;
    if (!canEdit() || busy) return;
    if (node.attrs.src) {
      feedbackError('请先移除图片，再拖入新图片');
      return;
    }
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length && !dragging) {
      void importImage(files, null, false);
      return;
    }
    const images: ProseNode[] = [];
    let otherContent = false;
    dragging?.slice.content.descendants((child) => {
      if (child.type.name === 'image') images.push(child);
      else if (child.isLeaf) otherContent = true;
    });
    if (images.length !== 1 || otherContent) {
      feedbackError('请拖拽文档中的一张图片，或点击上传');
      return;
    }
    const selected = view.state.selection;
    const origin =
      dragging?.move && selected instanceof NodeSelection && selected.node === images[0]
        ? { node: selected.node, bookmark: selected.getBookmark() }
        : undefined;
    void importImage(null, images[0]!, false, origin);
  };
  image.onload = () => {
    if (!destroyed) {
      loading = false;
      failed = false;
      refresh();
    }
  };
  image.onerror = () => {
    if (!destroyed) {
      loading = false;
      failed = true;
      refresh();
    }
  };
  function refresh() {
    const editable = canEdit();
    const src = safeCardImage(node.attrs.src);
    const filled = Boolean(src);
    dom.dataset.src = src;
    dom.dataset.alt = node.attrs.alt;
    media.dataset.filled = String(filled);
    media.setAttribute('aria-busy', String(busy || loading));
    image.alt = node.attrs.alt || '卡片图片';
    if (source !== src) {
      source = src;
      const version = ++loadVersion;
      loading = filled;
      failed = false;
      image.removeAttribute('src');
      if (src)
        void options.imageImport
          .resolveSource(src)
          .then((url) => {
            if (!destroyed && version === loadVersion) image.src = url;
          })
          .catch(() => {
            if (!destroyed && version === loadVersion) {
              loading = false;
              failed = true;
              refresh();
            }
          });
    }
    image.hidden = !filled || loading || failed;
    upload.hidden = filled || !editable || busy;
    upload.disabled = !editable || busy;
    actions.hidden = !filled || !editable;
    remove.disabled = replace.disabled = !editable || busy;
    removeCard.hidden = !editable;
    removeCard.disabled = !editable;
    feedback.hidden = !busy && !loading && !failed && !feedbackMessage;
    feedback.textContent = busy
      ? '正在导入图片…'
      : loading
        ? '正在加载图片…'
        : failed
          ? '图片加载失败，可替换后重试'
          : feedbackMessage;
  }
  options.refreshers.add(refresh);
  refresh();
  queueMicrotask(() => { if (!destroyed) refresh(); });
  return {
    dom,
    contentDOM,
    update(next) {
      if (next.type !== node.type) return false;
      node = next;
      refresh();
      return true;
    },
    stopEvent: (event) =>
      event.target instanceof Node &&
      (media.contains(event.target) || removeCard.contains(event.target)),
    ignoreMutation: (mutation) =>
      mutation.type !== 'selection' && !contentDOM.contains(mutation.target),
    destroy() {
      destroyed = true;
      operation++;
      loadVersion++;
      options.refreshers.delete(refresh);
      image.onload = image.onerror = null;
    },
  };
}
