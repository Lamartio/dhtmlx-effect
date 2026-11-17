import { Effect, Exit, Match, Schema, Scope, Stream, SubscriptionRef } from "effect"
import type { Row as DataRow } from "../core/rows"
import { chartModel, seriesIds } from "./chart"
import { clickable, clickModel } from "./clicks"
import { diagramModel, DiagramItemSchema } from "./diagram"
import { formModel, rulesCheck } from "./form"
import { ganttModel } from "./gantt"
import { gridModel } from "./grid"
import { calendarModel, colorpickerModel, comboboxModel, sliderModel, timepickerModel, VALUE_ACTIONS, valueModel } from "./inputs"
import { FILE_PICKER_ACTIONS, filePickerModel, VAULT_ACTIONS, VaultEntrySchema, vaultModel } from "./files"
import { BOOKING_ACTIONS, BookingCardSchema, bookingModel } from "./booking"
import { PIVOT_ACTIONS, type PivotConfig, PivotConfigSchema, pivotModel } from "./pivot"
import { SPREADSHEET_ACTIONS, SpreadsheetDataSchema, spreadsheetModel } from "./spreadsheet"
import { TODO_ACTIONS, TodoDataSchema, todoModel } from "./todo"
import { kanbanModel } from "./kanban"
import { type Input, input, stableJson } from "./model"
import { schedulerModel } from "./scheduler"
import { selectionModel, treeModel } from "./selection"
import { EventSchema, Rows, TaskSchema } from "./states"
import {
  calendarNode, colorpickerNode, comboboxNode, dataviewNode, ganttNode, gridNode, kanbanNode, listNode, publishTree, schedulerNode, sliderNode,
  cellsModel, chartNode, clicksNode, datepickerNode, diagramNode, formNode, modelNode, windowModel, windowNode, type WindowNode, type LayoutNode, layoutNode, type SidebarNode, sidebarNode, tabbarNode, type TabbarNode, tabsModel, timepickerNode, treeNode, type UiNode,
  WireNodes
} from "./tree"
import { partOf, type UiState } from "./ui-state"
import { Classes, type Utility } from "./utilities"

/**
 * The UI of a plugin, composed from Effect Schema: one Schema for each kind of node, with its config
 * and its data (the rows of a Grid, the value of a Slider). Make a node with `.make`, which checks it:
 *
 *     Column.make({ id: "main", children: [Grid.make({ id: "issues", columns, rows })] })
 *
 * `bindTree` keeps a model for each node by id, puts the data into it, and sends the tree without
 * the data to the page. `Schema.encode(UiSchema)` gives the JSON of a whole tree, data and all.
 */

export const Calendar = WireNodes.calendar.mapFields((fields) => ({ ...fields, value: Schema.optional(Schema.String) }))
export const Timepicker = WireNodes.timepicker.mapFields((fields) => ({ ...fields, value: Schema.optional(Schema.String) }))
export const Slider = WireNodes.slider.mapFields((fields) => ({ ...fields, value: Schema.optional(Schema.Number) }))
export const Colorpicker = WireNodes.colorpicker.mapFields((fields) => ({ ...fields, value: Schema.optional(Schema.String) }))
export const Combobox = WireNodes.combobox.mapFields((fields) => ({ ...fields, value: Schema.optional(Schema.String) }))
export const Grid = WireNodes.grid.mapFields((fields) => ({ ...fields, rows: Rows }))
export const List = WireNodes.list.mapFields((fields) => ({ ...fields, rows: Rows }))
export const DataView = WireNodes.dataview.mapFields((fields) => ({ ...fields, rows: Rows }))
export const Tree = WireNodes.tree.mapFields((fields) => ({ ...fields, rows: Rows }))
export const Gantt = WireNodes.gantt.mapFields((fields) => ({ ...fields, tasks: Schema.Array(TaskSchema) }))
export const Scheduler = WireNodes.scheduler.mapFields((fields) => ({ ...fields, events: Schema.Array(EventSchema) }))
export const Kanban = WireNodes.kanban.mapFields((fields) => ({ ...fields, rows: Rows }))
export const Form = WireNodes.form.mapFields((fields) => ({ ...fields, values: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)) }))
/** A Chart: its config, its rows, and the series that start hidden. */
export const Chart = WireNodes.chart.mapFields((fields) => ({ ...fields, rows: Rows, hidden: Schema.optional(Schema.Array(Schema.String)) }))
/** A RichText editor: its text as data, in its `format`. */
export const RichText = WireNodes.richtext.mapFields((fields) => ({ ...fields, value: Schema.optional(Schema.String) }))
/** A To Do List: its tasks, projects and people as data. */
export const Todo = WireNodes.todo.mapFields((fields) => ({ ...fields, data: TodoDataSchema }))
/** A Booking: its cards as data. */
export const Booking = WireNodes.booking.mapFields((fields) => ({ ...fields, cards: Schema.Array(BookingCardSchema) }))
/** A Pivot: its rows and its build as data. */
export const Pivot = WireNodes.pivot.mapFields((fields) => ({ ...fields, rows: Rows, config: Schema.optional(PivotConfigSchema) }))
/** A Spreadsheet: its cells as data. */
export const Spreadsheet = WireNodes.spreadsheet.mapFields((fields) => ({ ...fields, data: SpreadsheetDataSchema }))
/** A Vault: the files that it starts with, as data. */
export const VaultNode = WireNodes.vault.mapFields((fields) => ({ ...fields, files: Schema.optional(Schema.Array(VaultEntrySchema)) }))
/** A file picker: no data. */
export const FilePicker = WireNodes.filepicker
/** A Diagram: its kind and config, and its items as data. */
export const Diagram = WireNodes.diagram.mapFields((fields) => ({ ...fields, items: Schema.Array(DiagramItemSchema) }))
export const DatePicker = WireNodes.datepicker.mapFields((fields) => ({ ...fields, value: Schema.optional(Schema.String) }))
/** A Toolbar, a Button, a Menu and a Ribbon have no data: their items are config, and a click goes to the plugin. */
export const Toolbar = WireNodes.toolbar
export const Button = WireNodes.button
export const Menu = WireNodes.menu
export const Ribbon = WireNodes.ribbon

const Widgets = [Calendar, Timepicker, Slider, Colorpicker, Combobox, Grid, List, DataView, Tree, Gantt, Scheduler, Kanban, Toolbar, Button, Menu, Ribbon, Form, DatePicker, Chart, Diagram, RichText, Todo, Booking, Pivot, Spreadsheet, VaultNode, FilePicker] as const
type Widget = (typeof Widgets)[number]["Type"]

/** A frame of the composed UI, with composed children. */
export type Frame = { readonly _tag: "column" | "row"; readonly id: string; readonly size?: number | undefined; readonly classes?: ReadonlyArray<Utility> | undefined; readonly children: ReadonlyArray<Ui> }
/** Tabs of the composed UI, each with a label and a child; `value` is the id of the tab that opens first. */
export type Tabs = {
  readonly _tag: "tabbar"
  readonly id: string
  readonly size?: number | undefined
  readonly value?: string | undefined
  readonly tabs: ReadonlyArray<{ readonly label: string; readonly child: Ui }>
}
/** A sidebar of the composed UI: an item for each child; `value` is the id of the item that is chosen first. */
export type Side = {
  readonly _tag: "sidebar"
  readonly id: string
  readonly size?: number | undefined
  readonly value?: string | undefined
  readonly width?: number | undefined
  readonly items: ReadonlyArray<{ readonly label: string; readonly icon?: string | undefined; readonly child: Ui }>
}
/** A layout of the composed UI: a cell for each child; `hidden` are the ids of the cells that start hidden. */
export type Cells = {
  readonly _tag: "layout"
  readonly id: string
  readonly size?: number | undefined
  readonly direction: "rows" | "cols"
  readonly type?: "line" | "wide" | "space" | "none" | undefined
  readonly hidden?: ReadonlyArray<string> | undefined
  readonly cells: ReadonlyArray<{
    readonly child: Ui
    readonly header?: string | undefined
    readonly size?: number | string | undefined
    readonly resizable?: boolean | undefined
    readonly collapsable?: boolean | undefined
  }>
}
/** A window of the composed UI, with a child; `open` is whether it is open. */
export type Win = {
  readonly _tag: "window"
  readonly id: string
  readonly title: string
  readonly open?: boolean | undefined
  readonly width?: number | undefined
  readonly height?: number | undefined
  readonly modal?: boolean | undefined
  readonly child: Ui
}
/** A node of the composed UI: a widget with its data, a frame, tabs, a sidebar, a layout or a window. */
export type Ui = Widget | Frame | Tabs | Side | Cells | Win

export const UiSchema: Schema.Codec<Ui> = Schema.Union([
  ...Widgets,
  Schema.Struct({ _tag: Schema.Literals(["column", "row"]), id: Schema.String, size: Schema.optional(Schema.Number), classes: Classes, children: Schema.Array(Schema.suspend((): Schema.Codec<Ui> => UiSchema)) }),
  Schema.Struct({
    _tag: Schema.Literal("tabbar"),
    id: Schema.String,
    size: Schema.optional(Schema.Number),
    value: Schema.optional(Schema.String),
    tabs: Schema.Array(Schema.Struct({ label: Schema.String, child: Schema.suspend((): Schema.Codec<Ui> => UiSchema) }))
  }),
  Schema.Struct({
    _tag: Schema.Literal("sidebar"),
    id: Schema.String,
    size: Schema.optional(Schema.Number),
    value: Schema.optional(Schema.String),
    width: Schema.optional(Schema.Number),
    items: Schema.Array(Schema.Struct({ label: Schema.String, icon: Schema.optional(Schema.String), child: Schema.suspend((): Schema.Codec<Ui> => UiSchema) }))
  }),
  Schema.Struct({
    _tag: Schema.Literal("layout"),
    id: Schema.String,
    size: Schema.optional(Schema.Number),
    direction: Schema.Literals(["rows", "cols"]),
    type: Schema.optional(Schema.Literals(["line", "wide", "space", "none"])),
    hidden: Schema.optional(Schema.Array(Schema.String)),
    cells: Schema.Array(Schema.Struct({
      child: Schema.suspend((): Schema.Codec<Ui> => UiSchema),
      header: Schema.optional(Schema.String),
      size: Schema.optional(Schema.Union([Schema.Number, Schema.String])),
      resizable: Schema.optional(Schema.Boolean),
      collapsable: Schema.optional(Schema.Boolean)
    }))
  }),
  Schema.Struct({
    _tag: Schema.Literal("window"),
    id: Schema.String,
    title: Schema.String,
    open: Schema.optional(Schema.Boolean),
    width: Schema.optional(Schema.Number),
    height: Schema.optional(Schema.Number),
    modal: Schema.optional(Schema.Boolean),
    child: Schema.suspend((): Schema.Codec<Ui> => UiSchema)
  })
]) as never

const frame = (tag: "column" | "row") => ({
  make: (input: { readonly id: string; readonly size?: number; readonly classes?: ReadonlyArray<Utility>; readonly children: ReadonlyArray<Ui> }): Frame => {
    const made: Frame = { _tag: tag, ...input }
    Schema.decodeUnknownSync(UiSchema)(made)
    return made
  }
})
/** A frame: its children from top to bottom. The root of a UI fills its host, with no scroll. */
export const Column = frame("column")
/** A frame: its children from left to right. */
export const Row = frame("row")

/** Checks a node with `UiSchema` and gives it: the `make` of a node that has children. */
const checked = <N extends Ui>(made: N): N => {
  Schema.decodeUnknownSync(UiSchema)(made)
  return made
}

/** A Sidebar with an item for each child; the page draws the child of the chosen item, and a click goes to the plugin. */
export const Sidebar = { make: (input: Omit<Side, "_tag">): Side => checked({ _tag: "sidebar", ...input }) }

/** A DHTMLX Layout with a cell for each child. The plugin hides and shows cells (the actions `hide` and `show`). */
export const Layout = { make: (input: Omit<Cells, "_tag">): Cells => checked({ _tag: "layout", ...input }) }

/** A DHTMLX Window over the page, with a child node. The plugin opens and closes it with `open`; the cross of the user closes it (the action `close`). */
export const Window = { make: (input: Omit<Win, "_tag">): Win => checked({ _tag: "window", ...input }) }

/** Tabs, each with a label and a child node. The page draws only the open tab; a click on a tab goes to the plugin. */
export const Tabbar = {
  make: (input: Omit<Tabs, "_tag">): Tabs => {
    const made: Tabs = { _tag: "tabbar", ...input }
    Schema.decodeUnknownSync(UiSchema)(made)
    return made
  }
}

/** The data of a node, which goes into its model; and the node without it, which goes to the page. */
/** The composed Schema of each kind of widget, by its `_tag`. */
const COMPOSED = {
  calendar: Calendar, timepicker: Timepicker, slider: Slider, colorpicker: Colorpicker, combobox: Combobox, grid: Grid, list: List, dataview: DataView, tree: Tree,
  gantt: Gantt, scheduler: Scheduler, kanban: Kanban, toolbar: Toolbar, button: Button, menu: Menu, ribbon: Ribbon, form: Form, datepicker: DatePicker, chart: Chart, diagram: Diagram, richtext: RichText, todo: Todo, booking: Booking, pivot: Pivot, spreadsheet: Spreadsheet, vault: VaultNode, filepicker: FilePicker
} as const satisfies { readonly [K in Widget["_tag"]]: { readonly fields: object } }

/** The fields of a kind that are data, not config: the fields of its composed Schema that its wire Schema has not. */
const dataKeys = (tag: Widget["_tag"]): ReadonlyArray<string> =>
  Object.keys(COMPOSED[tag].fields).filter((key) => !(key in WireNodes[tag].fields))

/**
 * The data of a node, which goes into its model, and the node without it, which goes to the page.
 * A kind with one field of data gives that value; a kind with more (a Chart) gives them as one object.
 */
const split = (node: Widget): { readonly data: unknown; readonly wire: UiNode } => {
  const keys = dataKeys(node._tag)
  const all = node as unknown as Record<string, unknown>
  const wire = Object.fromEntries(Object.entries(all).filter(([key]) => !keys.includes(key))) as UiNode
  return { data: keys.length === 1 ? all[keys[0]!] : Object.fromEntries(keys.map((key) => [key, all[key]])), wire }
}

/** The model of a node, with its data in `data`, in the document under the id of the node. */
const modelOf = (node: Widget, data: SubscriptionRef.SubscriptionRef<any>, wire: UiNode): Effect.Effect<UiNode, never, UiState | Scope.Scope> => {
  const config = wire as never
  /** A ref that follows one field of the data, for a kind with more than one field of data. */
  const part = <A>(key: string, empty: A) =>
    Effect.gen(function* () {
      const ref = yield* SubscriptionRef.make<A>((yield* SubscriptionRef.get(data))[key] ?? empty)
      yield* SubscriptionRef.changes(data).pipe(Stream.runForEach((now: any) => SubscriptionRef.set(ref, now[key] ?? empty)), Effect.forkScoped)
      return ref
    })
  const clicks = (ids: ReadonlyArray<string>) => Effect.flatMap(clickModel(ids), (model) => clicksNode(wire as never, model))
  // Each kind of widget has its model here: Match.valueTags makes a kind that is missing a type error.
  return Match.valueTags(node, {
    calendar: (node) => Effect.flatMap(calendarModel({ value: data }), (model) => calendarNode(node.id, model, config)),
    timepicker: (node) => Effect.flatMap(timepickerModel({ value: data }), (model) => timepickerNode(node.id, model, config)),
    slider: (node) => Effect.flatMap(sliderModel({ value: data, ...(node.min === undefined ? {} : { min: node.min }) }), (model) => sliderNode(node.id, model, config)),
    colorpicker: (node) => Effect.flatMap(colorpickerModel({ value: data }), (model) => colorpickerNode(node.id, model, config)),
    combobox: (node) => Effect.flatMap(comboboxModel({ value: data, options: node.options }), (model) => comboboxNode(node.id, model, config)),
    grid: (node) => Effect.flatMap(gridModel({ columns: node.columns as never, rows: data, ...(node.menu === undefined ? {} : { menu: node.menu }) }), (model) => gridNode(node.id, model, config)),
    list: (node) => Effect.flatMap(selectionModel({ rows: data }), (model) => listNode(node.id, model, config)),
    dataview: (node) => Effect.flatMap(selectionModel({ rows: data }), (model) => dataviewNode(node.id, model, config)),
    tree: (node) => Effect.flatMap(treeModel({ rows: data }), (model) => treeNode(node.id, model, config)),
    gantt: (node) => Effect.flatMap(ganttModel({ tasks: data }), (model) => ganttNode(node.id, model, config)),
    scheduler: (node) => Effect.flatMap(schedulerModel({ events: data }), (model) => schedulerNode(node.id, model, config)),
    kanban: (node) =>
      Effect.flatMap(kanbanModel({ rows: data, field: node.field as never, columns: node.columns as never, ...(node.lanes === undefined ? {} : { lanes: node.lanes as never }) }), (model) => kanbanNode(node.id, model as never, config)),
    // A form with no values in the tree starts empty.
    form: (node) =>
      SubscriptionRef.update(data, (values) => values ?? {}).pipe(
        Effect.andThen(formModel(rulesCheck(node.fields), node.fields, { values: data })),
        Effect.flatMap((model) => formNode(wire as never, model))
      ),
    diagram: () => Effect.flatMap(diagramModel({ items: data }), (model) => diagramNode(wire as never, model)),
    richtext: () => Effect.flatMap(valueModel({ value: data }, ""), (model) => modelNode(wire as never, partOf(model, VALUE_ACTIONS))),
    todo: () => Effect.flatMap(todoModel({ data }), (model) => modelNode(wire as never, partOf(model, TODO_ACTIONS))),
    booking: () => Effect.flatMap(bookingModel({ cards: data }), (model) => modelNode(wire as never, partOf(model, BOOKING_ACTIONS))),
    pivot: (node) =>
      Effect.gen(function* () {
        const model = yield* pivotModel(node.fields, { rows: yield* part<ReadonlyArray<Readonly<Record<string, unknown>>>>("rows", []), config: yield* part<PivotConfig>("config", {}) })
        return yield* modelNode(wire as never, partOf(model, PIVOT_ACTIONS))
      }),
    spreadsheet: () => Effect.flatMap(spreadsheetModel({ data }), (model) => modelNode(wire as never, partOf(model, SPREADSHEET_ACTIONS))),
    vault: (node) =>
      SubscriptionRef.update(data, (files) => files ?? []).pipe(
        Effect.andThen(vaultModel({ files: data, ...(node.maxSize === undefined ? {} : { maxSize: node.maxSize }) })),
        Effect.flatMap((model) => modelNode(wire as never, partOf(model, VAULT_ACTIONS)))
      ),
    filepicker: (node) => Effect.flatMap(filePickerModel(node.maxSize === undefined ? {} : { maxSize: node.maxSize }), (model) => modelNode(wire as never, partOf(model, FILE_PICKER_ACTIONS))),
    datepicker: () => Effect.flatMap(calendarModel({ value: data }), (model) => datepickerNode(wire as never, model)),
    chart: (node) =>
      Effect.gen(function* () {
        const model = yield* chartModel(seriesIds(node.config), { rows: yield* part<ReadonlyArray<DataRow>>("rows", []), hidden: yield* part<ReadonlyArray<string>>("hidden", []) })
        return yield* chartNode(wire as never, model)
      }),
    toolbar: (node) => clicks(clickable(node.items)),
    menu: (node) => clicks(clickable(node.items)),
    ribbon: (node) => clicks(clickable(node.blocks.flatMap((block) => block.items))),
    button: (node) => clicks(node.disabled === true ? [] : [node.id])
  }) as Effect.Effect<UiNode, never, UiState | Scope.Scope>
}

type Kept = { readonly scope: Scope.Closeable; readonly data: SubscriptionRef.SubscriptionRef<unknown>; readonly shape: string; last: string; readonly wire: UiNode }

/**
 * Keeps the models of a composed UI, for the life of the scope. On each new tree:
 *
 * - a node that stays, with the same kind and config, keeps its model; new data goes into it, and a
 *   change of the user stays until the data in the tree changes;
 * - a node that changes its kind or its config gets a new model;
 * - a new node gets a model, and a node that goes closes its model.
 *
 * The tree without the data goes to the page (`TREE_KEY`).
 */
export const bindTree = (source: Input<Ui>): Effect.Effect<void, never, UiState | Scope.Scope> =>
  Effect.gen(function* () {
    const kept = new Map<string, Kept>()
    const wireTree = yield* SubscriptionRef.make<UiNode>({ _tag: "column", id: "", children: [] })
    yield* Effect.addFinalizer(() => Effect.forEach([...kept.values()], ({ scope }) => Scope.close(scope, Exit.void), { discard: true }))
    yield* publishTree(wireTree)

    const visit = (node: Ui, seen: Set<string>): Effect.Effect<UiNode, never, UiState> =>
      Effect.gen(function* () {
        seen.add(node.id)
        if (node._tag === "column" || node._tag === "row") {
          const children: Array<UiNode> = []
          for (const one of node.children) children.push(yield* visit(one, seen))
          return { _tag: node._tag, id: node.id, children, ...(node.size === undefined ? {} : { size: node.size }), ...(node.classes === undefined ? {} : { classes: node.classes }) }
        }
        if (node._tag === "sidebar") {
          const items: Array<SidebarNode["items"][number]> = []
          for (const item of node.items) items.push({ label: item.label, ...(item.icon === undefined ? {} : { icon: item.icon }), child: yield* visit(item.child, seen) })
          const ids = node.items.map((item) => item.child.id)
          const config = { ...(node.width === undefined ? {} : { width: node.width }), ...(node.size === undefined ? {} : { size: node.size }) }
          yield* keep(node.id, stableJson(ids), node.value ?? ids[0], (data) => Effect.flatMap(tabsModel(ids, data), (model) => sidebarNode(node.id, model, items, config)))
          return { _tag: "sidebar", id: node.id, items, ...config } satisfies SidebarNode
        }
        if (node._tag === "layout") {
          const cells: Array<LayoutNode["cells"][number]> = []
          for (const { child, ...cell } of node.cells) cells.push({ ...cell, child: yield* visit(child, seen) })
          const ids = node.cells.map((cell) => cell.child.id)
          const { hidden, cells: _cells, _tag, id, ...config } = node
          const wire: LayoutNode = { _tag: "layout", id: node.id, ...config, cells }
          yield* keep(node.id, stableJson(ids), hidden ?? [], (data) => Effect.flatMap(cellsModel(ids, { hidden: data }), (model) => layoutNode(node.id, model, { ...config, cells })))
          return wire
        }
        if (node._tag === "window") {
          const { open, child, _tag, ...config } = node
          // A window takes no room in its frame: it is over the page.
          const wire: WindowNode = { _tag: "window", ...config, size: 0, child: yield* visit(child, seen) }
          yield* keep(node.id, stableJson({ ...config, child: child.id }), open ?? false, (data) => Effect.flatMap(windowModel({ open: data }), (model) => windowNode(model, wire)))
          return wire
        }
        if (node._tag === "tabbar") {
          const tabs: Array<{ readonly label: string; readonly child: UiNode }> = []
          for (const tab of node.tabs) tabs.push({ label: tab.label, child: yield* visit(tab.child, seen) })
          const ids = node.tabs.map((tab) => tab.child.id)
          const wire: TabbarNode = { _tag: "tabbar", id: node.id, tabs, ...(node.size === undefined ? {} : { size: node.size }) }
          // The model of the open tab stays while the same tabs are there.
          yield* keep(node.id, stableJson(ids), node.value ?? ids[0], (data) => Effect.flatMap(tabsModel(ids, data), (model) => tabbarNode(node.id, model, tabs)))
          return wire
        }
        const widget = node as Widget
        const { data, wire } = split(widget)
        return yield* keep(node.id, stableJson(wire), data, (ref) => modelOf(widget, ref, wire))
      })

    /**
     * The model under `id`: kept while its `shape` stays, with new data put in; made again when the
     * shape changes. Gives the node of the page that its maker gave.
     */
    const keep = <N extends UiNode>(id: string, shape: string, data: unknown, make: (data: SubscriptionRef.SubscriptionRef<any>) => Effect.Effect<N, never, UiState | Scope.Scope>) =>
      Effect.gen(function* () {
        const was = kept.get(id)
        if (was !== undefined && was.shape === shape) {
          const next = stableJson(data)
          if (next !== was.last) {
            was.last = next
            yield* SubscriptionRef.set(was.data, data)
          }
          return was.wire as N
        }
        if (was !== undefined) yield* Scope.close(was.scope, Exit.void)
        const scope = yield* Scope.make()
        const ref = yield* SubscriptionRef.make<unknown>(data)
        const made = yield* make(ref).pipe(Scope.provide(scope))
        kept.set(id, { scope, data: ref, shape, last: stableJson(data), wire: made })
        return made
      })

    const trees = yield* input<Ui | undefined>(source as Input<Ui | undefined>, undefined)
    yield* SubscriptionRef.changes(trees).pipe(
      Stream.runForEach((tree) =>
        Effect.gen(function* () {
          if (tree === undefined) return
          const seen = new Set<string>()
          const next = yield* visit(tree, seen)
          for (const [id, one] of kept) {
            if (seen.has(id)) continue
            kept.delete(id)
            yield* Scope.close(one.scope, Exit.void)
          }
          yield* SubscriptionRef.set(wireTree, next)
        })),
      Effect.forkScoped({ startImmediately: true })
    )
  })
