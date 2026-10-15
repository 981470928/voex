export interface DiffRow {
  kind: 'same' | 'add' | 'delete' | 'modify';
  before: string;
  after: string;
  oldLine?: number;
  newLine?: number;
}

/** Bounded line comparison: large disjoint edits fall back to a single changed block. */
export function diffLines(before: string, after: string): DiffRow[] {
  const a = before ? before.split('\n') : [];
  const b = after ? after.split('\n') : [];
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - suffix - 1] === b[b.length - suffix - 1]
  )
    suffix++;
  const rows: DiffRow[] = [];
  for (let i = 0; i < prefix; i++)
    rows.push({ kind: 'same', before: a[i]!, after: b[i]!, oldLine: i + 1, newLine: i + 1 });
  const x = a.slice(prefix, a.length - suffix);
  const y = b.slice(prefix, b.length - suffix);
  const edits: { kind: 'same' | 'add' | 'delete'; text: string }[] = [];
  if ((x.length + 1) * (y.length + 1) <= 2_000_000) {
    const width = y.length + 1;
    const table = new Uint32Array((x.length + 1) * width);
    for (let i = x.length - 1; i >= 0; i--)
      for (let j = y.length - 1; j >= 0; j--)
        table[i * width + j] =
          x[i] === y[j]
            ? table[(i + 1) * width + j + 1]! + 1
            : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    let i = 0;
    let j = 0;
    while (i < x.length || j < y.length) {
      if (i < x.length && j < y.length && x[i] === y[j]) {
        edits.push({ kind: 'same', text: x[i++]! });
        j++;
      } else if (
        j < y.length &&
        (i === x.length || table[i * width + j + 1]! > table[(i + 1) * width + j]!)
      )
        edits.push({ kind: 'add', text: y[j++]! });
      else edits.push({ kind: 'delete', text: x[i++]! });
    }
  } else {
    for (const text of x) edits.push({ kind: 'delete', text });
    for (const text of y) edits.push({ kind: 'add', text });
  }
  let oldLine = prefix + 1;
  let newLine = prefix + 1;
  for (let index = 0; index < edits.length;) {
    const edit = edits[index]!;
    if (edit.kind === 'same') {
      rows.push({
        kind: 'same',
        before: edit.text,
        after: edit.text,
        oldLine: oldLine++,
        newLine: newLine++,
      });
      index++;
      continue;
    }
    const removed: string[] = [];
    const added: string[] = [];
    while (index < edits.length && edits[index]!.kind !== 'same') {
      const item = edits[index++]!;
      (item.kind === 'delete' ? removed : added).push(item.text);
    }
    for (let i = 0; i < Math.max(removed.length, added.length); i++)
      rows.push({
        kind:
          i < removed.length && i < added.length ? 'modify' : i < removed.length ? 'delete' : 'add',
        before: removed[i] ?? '',
        after: added[i] ?? '',
        oldLine: i < removed.length ? oldLine++ : undefined,
        newLine: i < added.length ? newLine++ : undefined,
      });
  }
  for (let i = suffix; i > 0; i--)
    rows.push({
      kind: 'same',
      before: a[a.length - i]!,
      after: b[b.length - i]!,
      oldLine: oldLine++,
      newLine: newLine++,
    });
  return rows;
}
