import { Effect, Exit, Schema, Scope, Stream, SubscriptionRef } from "effect"
import type { Row as DataRow } from "../core/rows"
import { chartModel, seriesIds } from "./chart"
import { clickable, clickModel } from "./clicks"
import { formModel, rulesCheck } from "./form"
import { ganttModel } from "./gantt"
import { gridModel } from "./grid"
import { calendarModel, colorpickerModel, comboboxModel, sliderModel, timepickerModel } from "./inputs"
import { kanbanModel } from "./kanban"
import { type Input, input, stableJson } from "./model"
import { schedulerModel } from "./scheduler"
import { selectionModel, treeModel } from "./selection"
import {
  calendarNode, colorpickerNode, comboboxNode, dataviewNode, ganttNode, gridNode, kanbanNode, listNode, publishTree, schedulerNode, sliderNode,
  cellsModel, chartNode, clicksNode, datepickerNode, formNode, type LayoutNode, layoutNode, type SidebarNode, sidebarNode, tabbarNode, type TabbarNode, tabsModel, timepickerNode, treeNode, type UiNode,
  WireNodes
} from "./tree"
import type { UiState } from "./ui-state"

/**
 * The UI of a plugin, composed from Effect Schema: one Schema for each kind of node, with its config
 * and its data (the rows of a Grid, the value of a Slider). Make a node with `.make`, which checks it:
 *
 *     Column.make({ id: "main", children: [Grid.make({ id: "issues", columns, rows })] })
 *
 * `bindTree` keeps a model for each node by id, puts the data into it, and sends the tree without
 * the data to the page. `Schema.encode(UiSchema)` gives the JSON of a whole tree, data and all.
 */

/** A row of data: an id, and any fields. */
const Rows = Schema.Array(Schema.Record(Schema.String, Schema.Unknown).pipe(Schema.check(Schema.makeFilter((row: Record<string, unknown>) => typeof row["id"] === "string" || "A row needs an id that is a string"))))

const TaskSchema = Schema.Struct({ id: Schema.String, text: Schema.String, start: Schema.String, duration: Schema.Number, progress: Schema.Number, parent: Schema.optional(Schema.String) })
const EventSchema = Schema.Struct({ id: Schema.String, text: Schema.String, start: Schema.String, end: Schema.String })

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
export const DatePicker = WireNodes.datepicker.mapFields((fields) => ({ ...fields, value: Schema.optional(Schema.String) }))
/** A Toolbar, a Button, a Menu and a Ribbon have no data: their items are config, and a click goes to the plugin. */
export const Toolbar = WireNodes.toolbar
export const Button = WireNodes.button
export const Menu = WireNodes.menu
export const Ribbon = WireNodes.ribbon

const Widgets = [Calendar, Timepicker, Slider, Colorpicker, Combobox, Grid, List, DataView, Tree, Gantt, Scheduler, Kanban, Toolbar, Button, Menu, Ribbon, Form, DatePicker, Chart] as const
type Widget = (typeof Widgets)[number]["Type"]

/** A frame of the composed UI, with composed children. */
export type Frame = { readonly _tag: "column" | "row"; readonly id: string; readonly size?: number | undefined; readonly children: ReadonlyArray<Ui> }
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
/** A node of the composed UI: a widget with its data, a frame, tabs, a sidebar or a layout. */
export type Ui = Widget | Frame | Tabs | Side | Cells

export const UiSchema: Schema.Codec<Ui> = Schema.Union([
  ...Widgets,
  Schema.Struct({ _tag: Schema.Literals(["column", "row"]), id: Schema.String, size: Schema.optional(Schema.Number), children: Schema.Array(Schema.suspend((): Schema.Codec<Ui> => UiSchema)) }),
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
  })
]) as never

const frame = (tag: "column" | "row") => ({
  make: (input: { readonly id: string; readonly size?: number; readonly children: ReadonlyArray<Ui> }): Frame => {
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

/** Tabs, each with a label and a child node. The page draws only the open tab; a click on a tab goes to the plugin. */
export const Tabbar = {
  make: (input: Omit<Tabs, "_tag">): Tabs => {
    const made: Tabs = { _tag: "tabbar", ...input }
    Schema.decodeUnknownSync(UiSchema)(made)
    return made
  }
}

/** The data of a node, which goes into its model; and the node without it, which goes to the page. */
const split = (node: Widget): { readonly data: unknown; readonly wire: UiNode } => {
  if (node._tag === "chart") {
    // A Chart has two parts of data: its rows and its hidden series.
    const { rows, hidden, ...wire } = node
    return { data: { rows, hidden: hidden ?? [] }, wire: wire as UiNode }
  }
  const { value, rows, tasks, events, values, ...wire } = node as Widget & { value?: unknown; rows?: unknown; tasks?: unknown; events?: unknown; values?: unknown }
  return { data: value ?? rows ?? tasks ?? events ?? values, wire: wire as UiNode }
}

/** The model of a node, with its data in `data`, in the document under the id of the node. */
const modelOf = (node: Widget, data: SubscriptionRef.SubscriptionRef<any>, wire: UiNode): Effect.Effect<UiNode, never, UiState | Scope.Scope> => {
  const config = wire as never
  switch (node._tag) {
    case "calendar":
      return Effect.flatMap(calendarModel({ value: data }), (model) => calendarNode(node.id, model, config))
    case "timepicker":
      return Effect.flatMap(timepickerModel({ value: data }), (model) => timepickerNode(node.id, model, config))
    case "slider":
      return Effect.flatMap(sliderModel({ value: data, ...(node.min === undefined ? {} : { min: node.min }) }), (model) => sliderNode(node.id, model, config))
    case "colorpicker":
      return Effect.flatMap(colorpickerModel({ value: data }), (model) => colorpickerNode(node.id, model, config))
    case "combobox":
      return Effect.flatMap(comboboxModel({ value: data, options: node.options }), (model) => comboboxNode(node.id, model, config))
    case "grid":
      return Effect.flatMap(gridModel({ columns: node.columns as never, rows: data, ...(node.menu === undefined ? {} : { menu: node.menu }) }), (model) => gridNode(node.id, model, config))
    case "list":
      return Effect.flatMap(selectionModel({ rows: data }), (model) => listNode(node.id, model, config))
    case "dataview":
      return Effect.flatMap(selectionModel({ rows: data }), (model) => dataviewNode(node.id, model, config))
    case "tree":
      return Effect.flatMap(treeModel({ rows: data }), (model) => treeNode(node.id, model, config))
    case "gantt":
      return Effect.flatMap(ganttModel({ tasks: data }), (model) => ganttNode(node.id, model, config))
    case "scheduler":
      return Effect.flatMap(schedulerModel({ events: data }), (model) => schedulerNode(node.id, model, config))
    case "form":
      // A form with no values in the tree starts empty.
      return SubscriptionRef.update(data, (values) => values ?? {}).pipe(
        Effect.andThen(formModel(rulesCheck(node.fields), node.fields, { values: data })),
        Effect.flatMap((model) => formNode(wire as never, model))
      )
    case "chart":
      return Effect.gen(function* () {
        // The two parts of the data, each as a ref that follows the data of the node.
        const part = <A>(key: "rows" | "hidden") =>
          Effect.gen(function* () {
            const ref = yield* SubscriptionRef.make<A>((yield* SubscriptionRef.get(data))[key])
            yield* SubscriptionRef.changes(data).pipe(Stream.runForEach((now: any) => SubscriptionRef.set(ref, now[key])), Effect.forkScoped)
            return ref
          })
        const model = yield* chartModel(seriesIds(node.config), { rows: yield* part<ReadonlyArray<DataRow>>("rows"), hidden: yield* part<ReadonlyArray<string>>("hidden") })
        return yield* chartNode(wire as never, model)
      })
    case "datepicker":
      return Effect.flatMap(calendarModel({ value: data }), (model) => datepickerNode(wire as never, model))
    case "toolbar":
    case "menu":
      return Effect.flatMap(clickModel(clickable(node.items)), (model) => clicksNode(wire as never, model))
    case "ribbon":
      return Effect.flatMap(clickModel(clickable(node.blocks.flatMap((block) => block.items))), (model) => clicksNode(wire as never, model))
    case "button":
      return Effect.flatMap(clickModel(node.disabled === true ? [] : [node.id]), (model) => clicksNode(wire as never, model))
    case "kanban":
      return Effect.flatMap(kanbanModel({ rows: data, field: node.field as never, columns: node.columns as never, ...(node.lanes === undefined ? {} : { lanes: node.lanes as never }) }), (model) => kanbanNode(node.id, model as never, config))
  }
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
          return { _tag: node._tag, id: node.id, children, ...(node.size === undefined ? {} : { size: node.size }) }
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
