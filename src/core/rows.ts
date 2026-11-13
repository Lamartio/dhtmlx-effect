/**
 * A list of rows as changes, not as snapshots: what `plan-diff.ts` does for the Gantt, for any row with an
 * id. DHTMLX keeps its own data collection and wants each change by id: `add`, `update`, `move`,
 * `remove`. A full `parse` draws all again and loses the selection, the scroll and the open folders.
 */
export type Row = { readonly id: string; readonly parent?: string | undefined }

export type RowOp<R extends Row> =
  | { readonly _tag: "add"; readonly row: R; readonly index: number }
  | { readonly _tag: "update"; readonly row: R }
  | { readonly _tag: "move"; readonly id: string; readonly parent: string | undefined; readonly index: number }
  | { readonly _tag: "remove"; readonly id: string }

/** Two rows are the same when each field is the same value: a shallow compare, as a row is flat. */
export const sameRow = <R extends Row>(a: R, b: R): boolean => {
  if (a === b) return true
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}

/** The index of each row among the rows with the same parent. */
const places = (rows: ReadonlyArray<Row>) => {
  const seen = new Map<string | undefined, number>()
  const out = new Map<string, { readonly parent: string | undefined; readonly index: number }>()
  for (const row of rows) {
    const index = seen.get(row.parent) ?? 0
    seen.set(row.parent, index + 1)
    out.set(row.id, { parent: row.parent, index })
  }
  return out
}

/**
 * The changes from `before` to `after`, by id: removes first, then adds and moves in the order of
 * `after`, so a parent is there before its children, then the updates. A row that only moved
 * because a row before it came or went is not a move: the collection moves it by itself.
 */
export const diffRows = <R extends Row>(before: ReadonlyArray<R>, after: ReadonlyArray<R>): ReadonlyArray<RowOp<R>> => {
  if (before === after) return []
  const old = new Map(before.map((row) => [row.id, row]))
  const ids = new Set(after.map((row) => row.id))
  const ops: Array<RowOp<R>> = before.filter((row) => !ids.has(row.id)).map((row) => ({ _tag: "remove", id: row.id }))
  // The order of each parent as the collection has it after the removes, kept up to date as the ops go.
  const order = new Map<string | undefined, Array<string>>()
  for (const row of before) {
    if (!ids.has(row.id)) continue
    const list = order.get(row.parent) ?? []
    list.push(row.id)
    order.set(row.parent, list)
  }
  const parentOf = new Map(before.filter((row) => ids.has(row.id)).map((row) => [row.id, row.parent]))
  const now = places(after)
  const updates: Array<RowOp<R>> = []
  for (const row of after) {
    const place = now.get(row.id)!
    const siblings = order.get(place.parent) ?? []
    order.set(place.parent, siblings)
    const previous = old.get(row.id)
    if (previous === undefined) {
      ops.push({ _tag: "add", row, index: place.index })
      siblings.splice(place.index, 0, row.id)
      continue
    }
    const from = parentOf.get(row.id)
    // The rows before this one are in place, so a row that did not move is at its index: one look,
    // not a search, which keeps a list of 10,000 rows fast.
    if (from !== place.parent || siblings[place.index] !== row.id) {
      const at = from === place.parent ? siblings.indexOf(row.id) : -1
      if (at === -1) {
        const was = order.get(from)
        if (was !== undefined) was.splice(was.indexOf(row.id), 1)
      } else siblings.splice(at, 1)
      siblings.splice(place.index, 0, row.id)
      parentOf.set(row.id, place.parent)
      ops.push({ _tag: "move", id: row.id, parent: place.parent, index: place.index })
    }
    if (!sameRow(previous, row)) updates.push({ _tag: "update", row })
  }
  return [...ops, ...updates]
}
