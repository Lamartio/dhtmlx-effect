import { DataCollection, DataView, Grid, List, setTheme, Tree, TreeCollection } from "dhx-suite"
import { Effect, Option, PubSub, Scope, Stream, SubscriptionRef } from "effect"
import { diffRows, type Row, type RowOp } from "../core/rows"
import { Browser, follow } from "./browser"
import { reportedCallback, reporting } from "./problems"
import { Host, resource } from "./host"

/**
 * The bridge from an Effect store to the data of DHTMLX. One store drives one
 * collection, and each widget that shows the collection follows it: a change goes in once, as
 * changes by id, and each widget draws only what changed.
 */
type Collection = DataCollection | TreeCollection

/** What DHTMLX keeps for a row: a copy, as DHTMLX writes into the objects it gets. */
const itemOf = <R extends Row>(row: R, map: ((row: R) => object) | undefined) => ({ ...(map === undefined ? row : map(row)), id: row.id })

const apply = <R extends Row>(data: Collection, ops: ReadonlyArray<RowOp<R>>, map: ((row: R) => object) | undefined) => {
  const tree = data instanceof TreeCollection
  const root = tree ? data.getRoot() : undefined
  for (const op of ops) {
    switch (op._tag) {
      case "remove":
        if (data.exists(op.id)) data.remove(op.id)
        break
      case "add":
        if (tree) data.add(itemOf(op.row, map), op.index, op.row.parent ?? root)
        else data.add(itemOf(op.row, map), op.index)
        break
      case "move":
        if (tree) data.move(op.id, op.index, undefined, op.parent ?? root)
        else data.move(op.id, op.index)
        break
      case "update": {
        const { id: _, parent: __, ...fields } = itemOf(op.row, map) as Record<string, unknown>
        data.update(op.row.id, fields)
        break
      }
    }
  }
}

const bind = <R extends Row, C extends Collection>(kind: string, make: () => C, rows: SubscriptionRef.SubscriptionRef<ReadonlyArray<R>>, map?: (row: R) => object) =>
  Effect.gen(function* () {
    const data = yield* resource(kind, make, (data) => data.removeAll())
    yield* SubscriptionRef.changes(rows).pipe(
      Stream.zipWithPrevious,
      Stream.runForEach(([before, after]) =>
        Effect.sync(() => {
          if (Option.isNone(before)) {
            data.removeAll()
            if (data instanceof TreeCollection) apply(data, diffRows([], after), map)
            else data.parse(after.map((row) => itemOf(row, map)))
          } else apply(data, diffRows(before.value, after), map)
        })),
      reporting("A data collection, while it followed its store"),
      Effect.forkScoped
    )
    return data
  })

/** A DataCollection that follows the rows of the store, for a Grid, a List or a DataView. `map` shapes a row for DHTMLX. */
export const dataCollection = <R extends Row>(rows: SubscriptionRef.SubscriptionRef<ReadonlyArray<R>>, map?: (row: R) => object) =>
  bind("data collection", () => new DataCollection(), rows, map)

/** A TreeCollection that follows the rows of the store: a row with `parent` goes under that row. For a Tree. */
export const treeCollection = <R extends Row>(rows: SubscriptionRef.SubscriptionRef<ReadonlyArray<R>>, map?: (row: R) => object) =>
  bind("tree collection", () => new TreeCollection(), rows, map)

/** The selection API that List, DataView and Tree share. */
type Selection = {
  readonly add: (id: string) => void
  readonly remove: (id?: string) => void
  readonly getId: () => string | undefined
  readonly events: { readonly on: (name: never, f: (id: string) => void) => void; readonly detach: (name: never) => void }
}

/**
 * The selected row as a `SubscriptionRef`, both ways: a click sets it, and a new value selects the
 * row in the widget. `undefined` is no row.
 */
const selectedRef = (selection: Selection, selected: SubscriptionRef.SubscriptionRef<string | undefined>) =>
  Effect.gen(function* () {
    // A select that came from the ref is not sent back: a set inside the set of the ref would wait
    // for its lock, and `runSync` cannot wait.
    let applying = false
    const set = (id: string | undefined) => {
      if (!applying && Effect.runSync(SubscriptionRef.get(selected)) !== id) Effect.runSync(SubscriptionRef.set(selected, id))
    }
    yield* resource(
      "listener",
      () => {
        selection.events.on("afterSelect" as never, (id) => set(String(id)))
        selection.events.on("afterUnSelect" as never, () => set(undefined))
      },
      () => {
        selection.events.detach("afterSelect" as never)
        selection.events.detach("afterUnSelect" as never)
      }
    )
    yield* follow(selected, (id) => {
      const current = selection.getId()
      if (id === current) return
      applying = true
      try {
        if (id === undefined) selection.remove()
        else selection.add(id)
      } finally {
        applying = false
      }
    })
  })

const theme = Effect.gen(function* () {
  const host = yield* Host
  const browser = yield* Browser
  yield* follow(browser.dark, (dark) => setTheme(dark ? "dark" : "light", host))
})

type Selected = { readonly selected?: SubscriptionRef.SubscriptionRef<string | undefined> }

const selectedOr = (options: Selected) =>
  options.selected === undefined ? SubscriptionRef.make<string | undefined>(undefined) : Effect.succeed(options.selected)

export type GridColumn = {
  readonly id: string
  readonly header: string
  readonly width?: number
  /** Sorts on a click on the header. Default: true. */
  readonly sortable?: boolean
  readonly align?: "left" | "center" | "right"
  /** What the values are. A `number` sorts as a number, and a `boolean` shows a checkbox. Default: `string`. */
  readonly type?: "string" | "number" | "boolean" | "date"
  /** The user can change the cells of this column: a double click opens the editor. Default: false. */
  readonly editable?: boolean
  /** The editor of a cell. Default: an input, or a checkbox for a `boolean`. */
  readonly editor?: "input" | "select" | "combobox" | "checkbox" | "datePicker" | "textarea"
  /** The choices of a `select` or a `combobox` editor, and of a `select` or `combo` filter that should not read them from the rows. */
  readonly options?: ReadonlyArray<string>
  /** A filter in the header, under the name of the column: a text input, or a list of the values. */
  readonly filter?: "input" | "select" | "combo"
  /** The user can drag the edge of the header to change the width. Default: false. */
  readonly resizable?: boolean
}

/** A cell that the user changed: the id of the row, the id of the column, and the new value. */
export type GridEdit = { readonly row: string; readonly column: string; readonly value: unknown }

const FILTERS = { input: "inputFilter", select: "selectFilter", combo: "comboFilter" } as const

/**
 * A DHTMLX Grid on a collection: columns, a sort on a click on a header, and the selected row both
 * ways. The Grid draws only the rows in view, so 10,000 rows stay fast. The theme follows `Browser.dark`.
 *
 * A column can have a filter in its header, and its cells can be editable. An edit of the user
 * comes in `edits`: the store is the truth, so the app writes the new value into the store, and the
 * collection follows it. `forEachReported` with `edits` does that in one line.
 */
export const grid = (options: { readonly data: DataCollection; readonly columns: ReadonlyArray<GridColumn> } & Selected) =>
  Effect.gen(function* () {
    const host = yield* Host
    const selected = yield* selectedOr(options)
    const view = yield* resource(
      "grid",
      () =>
        new Grid(host, {
          data: options.data as never,
          columns: options.columns.map((column) => ({
            id: column.id,
            header: [{ text: column.header }, ...(column.filter === undefined ? [] : [{ content: FILTERS[column.filter] }])],
            ...(column.width === undefined ? {} : { width: column.width }),
            ...(column.align === undefined ? {} : { align: column.align }),
            ...(column.type === undefined ? {} : { type: column.type }),
            ...(column.editable === true ? { editable: true } : {}),
            ...(column.editor === undefined ? {} : { editorType: column.editor }),
            ...(column.options === undefined ? {} : { options: [...column.options] }),
            ...(column.resizable === true ? { resizable: true } : {}),
            sortable: column.sortable ?? true
          })) as never,
          selection: "row",
          autoWidth: true,
          keyNavigation: true,
          css: "dhxe-grid"
        }),
      (view) => view.destructor()
    )
    yield* theme
    const edits = yield* Effect.acquireRelease(PubSub.unbounded<GridEdit>(), PubSub.shutdown)
    const onEdit = yield* reportedCallback("The Grid, on an edit of a cell", (value: unknown, row: { readonly id: string | number }, column: { readonly id: string | number }) => {
      Effect.runSync(PubSub.publish(edits, { row: String(row.id), column: String(column.id), value }))
    })
    yield* resource(
      "listener",
      () => view.events.on("afterEditEnd" as never, onEdit as never),
      () => view.events.detach("afterEditEnd" as never)
    )
    let applying = false
    const set = (id: string | undefined) => {
      if (!applying && Effect.runSync(SubscriptionRef.get(selected)) !== id) Effect.runSync(SubscriptionRef.set(selected, id))
    }
    const events = (view.selection as unknown as { readonly events: Selection["events"] }).events
    yield* resource(
      "listener",
      () => {
        events.on("afterSelect" as never, (row: unknown) => set(String((row as { id: string | number }).id)))
        events.on("afterUnSelect" as never, () => set(undefined))
      },
      () => {
        events.detach("afterSelect" as never)
        events.detach("afterUnSelect" as never)
      }
    )
    yield* follow(selected, (id) => {
      const current = (view.selection.getCell() as { row?: { id: string | number } } | undefined)?.row?.id
      if (id === (current === undefined ? undefined : String(current))) return
      applying = true
      try {
        if (id === undefined) view.selection.removeCell()
        else if (options.data.exists(id)) view.selection.setCell(id)
      } finally {
        applying = false
      }
    })
    return { grid: view, selected, edits: Stream.fromPubSub(edits) }
  }) as Effect.Effect<
    { readonly grid: Grid; readonly selected: SubscriptionRef.SubscriptionRef<string | undefined>; readonly edits: Stream.Stream<GridEdit> },
    never,
    Host | Browser | Scope.Scope
  >

/**
 * A DHTMLX Tree on a tree collection: folders that open and close, and the selected item both ways.
 * `expanded` holds the open folders, both ways too. An item shows its `value`. The theme follows `Browser.dark`.
 */
export const tree = (options: {
  readonly data: TreeCollection
  readonly expanded?: SubscriptionRef.SubscriptionRef<ReadonlyArray<string>>
  /** An item as HTML, in place of its `value`. Escape the text with `escapeHtml`. */
  readonly template?: (item: Record<string, unknown>, isFolder: boolean) => string
} & Selected) =>
  Effect.gen(function* () {
    const host = yield* Host
    const selected = yield* selectedOr(options)
    const expanded = options.expanded ?? (yield* SubscriptionRef.make<ReadonlyArray<string>>([]))
    const view = yield* resource("tree", () => new Tree(host, { data: options.data as never, css: "dhxe-tree", ...(options.template === undefined ? {} : { template: options.template as never }) }), (view) => view.destructor())
    yield* theme
    yield* selectedRef(view.selection as unknown as Selection, selected)
    // A change from `expanded` opens folders, and DHTMLX tells of each one: that event must not go
    // back into `expanded`, or the two follow each other for ever.
    let applying = false
    const open = (id: string, on: boolean) => {
      if (applying) return
      const ids = Effect.runSync(SubscriptionRef.get(expanded))
      if (ids.includes(id) === on) return
      Effect.runSync(SubscriptionRef.set(expanded, on ? [...ids, id] : ids.filter((one) => one !== id)))
    }
    yield* resource(
      "listener",
      () => {
        view.events.on("afterExpand" as never, (id: string | number) => open(String(id), true))
        view.events.on("afterCollapse" as never, (id: string | number) => open(String(id), false))
      },
      () => {
        view.events.detach("afterExpand" as never)
        view.events.detach("afterCollapse" as never)
      }
    )
    yield* follow(expanded, (ids) => {
      const wanted = new Set(ids)
      const changes: Array<[string, boolean]> = []
      options.data.forEach((item: { id: string | number }) => {
        const id = String(item.id)
        if (!options.data.haveItems(id)) return
        const opened = (options.data.getItem(id) as { opened?: boolean }).opened === true
        if (wanted.has(id) !== opened) changes.push([id, wanted.has(id)])
      })
      applying = true
      try {
        for (const [id, on] of changes) {
          if (on) view.expand(id)
          else view.collapse(id)
        }
      } finally {
        applying = false
      }
    })
    return { tree: view, selected, expanded }
  }) as Effect.Effect<{
    readonly tree: Tree
    readonly selected: SubscriptionRef.SubscriptionRef<string | undefined>
    readonly expanded: SubscriptionRef.SubscriptionRef<ReadonlyArray<string>>
  }, never, Host | Browser | Scope.Scope>

/** A row or a tile as HTML. Escape the text of a row with `escapeHtml`: the result goes in as HTML. */
export type Template = (item: Record<string, unknown>) => string

export const escapeHtml = (text: unknown) =>
  String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)

/** A DHTMLX List on a collection: one row for each item, and the selected row both ways. */
export const list = (options: { readonly data: DataCollection; readonly template: Template; readonly itemHeight?: number } & Selected) =>
  Effect.gen(function* () {
    const host = yield* Host
    const selected = yield* selectedOr(options)
    const view = yield* resource(
      "list",
      () =>
        new List(host, {
          data: options.data as never,
          template: options.template as never,
          selection: true,
          keyNavigation: true,
          virtual: true,
          itemHeight: options.itemHeight ?? 36,
          css: "dhxe-list"
        }),
      (view) => view.destructor()
    )
    yield* theme
    yield* selectedRef(view.selection as unknown as Selection, selected)
    return { list: view, selected }
  }) as Effect.Effect<{ readonly list: List; readonly selected: SubscriptionRef.SubscriptionRef<string | undefined> }, never, Host | Browser | Scope.Scope>

/**
 * A DHTMLX DataView on a collection: one tile for each item, in rows of tiles, and the selected tile
 * both ways. Fewer tiles in a row on a narrow window.
 */
export const dataView = (options: { readonly data: DataCollection; readonly template: Template; readonly itemsInRow?: number } & Selected) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const selected = yield* selectedOr(options)
    const wide = options.itemsInRow ?? 4
    const view = yield* resource(
      "dataview",
      () =>
        new DataView(host, {
          data: options.data as never,
          template: options.template as never,
          itemsInRow: wide,
          gap: 8,
          selection: true,
          keyNavigation: true,
          css: "dhxe-dataview"
        }),
      (view) => view.destructor()
    )
    yield* theme
    yield* selectedRef(view.selection as unknown as Selection, selected)
    yield* follow(browser.viewport, (viewport) => {
      const inRow = viewport.width < 480 ? 1 : viewport.width < 720 ? Math.min(2, wide) : wide
      if (view.config.itemsInRow !== inRow) {
        view.config.itemsInRow = inRow
        view.paint()
      }
    })
    return { dataView: view, selected }
  }) as Effect.Effect<{ readonly dataView: DataView; readonly selected: SubscriptionRef.SubscriptionRef<string | undefined> }, never, Host | Browser | Scope.Scope>
