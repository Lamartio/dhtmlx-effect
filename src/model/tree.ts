import { Effect, Schema, type Scope, Stream, SubscriptionRef } from "effect"
import { CHART_ACTIONS, ChartConfigSchema, type ChartModel } from "./chart"
import { PivotFieldSchema } from "./pivot"
import { DIAGRAM_ACTIONS, type DiagramModel } from "./diagram"
import { CLICK_ACTIONS, type ClickModel, type MenuItem, MenuItemSchema, ToolbarItemSchema } from "./clicks"
import { FieldSchema, FORM_ACTIONS, type FormModel } from "./form"
import { GANTT_ACTIONS, type GanttModel } from "./gantt"
import { GRID_ACTIONS, type GridColumn, type GridModel } from "./grid"
import { VALUE_ACTIONS, type ValueModel, valueModel } from "./inputs"
import { changesOf, type Entry, history, type Input, input, recordInput } from "./model"
import { type KanbanColumn, type KanbanLane, KANBAN_ACTIONS, type KanbanModel } from "./kanban"
import type { Row } from "../core/rows"
import { SCHEDULER_ACTIONS, type SchedulerModel } from "./scheduler"
import { SELECTION_ACTIONS, type SelectionModel, TREE_ACTIONS, type TreeModel } from "./selection"
import { type Part, partOf, UiState } from "./ui-state"

/**
 * The UI as data, made in the plugin: a tree of nodes, each with its kind and its config. The state
 * of a widget is in the document under the id of its node, and the tree itself under `TREE_KEY`.
 * The page makes a widget for each node. A config is data only: field names, not functions, and no
 * HTML.
 */

/** The key of the tree in the document. An id of a node cannot be this. */
export const TREE_KEY = "@tree"

/** A size along the frame: a height in a column, a width in a row. With none, the node takes an equal part of what is left. */
const Size = Schema.optional(Schema.Number)
/** A short text that the page shows on hover and focus of a widget: plain text. */
const Tooltip = Schema.optional(Schema.String)

const GridColumnSchema = Schema.Struct({
  id: Schema.String,
  header: Schema.String,
  width: Schema.optional(Schema.Number),
  sortable: Schema.optional(Schema.Boolean),
  align: Schema.optional(Schema.Literals(["left", "center", "right"])),
  type: Schema.optional(Schema.Literals(["string", "number", "boolean", "date"])),
  editable: Schema.optional(Schema.Boolean),
  editor: Schema.optional(Schema.Literals(["input", "select", "combobox", "checkbox", "datePicker", "textarea"])),
  options: Schema.optional(Schema.Array(Schema.String)),
  filter: Schema.optional(Schema.Literals(["input", "select", "combo"])),
  resizable: Schema.optional(Schema.Boolean)
})

const KanbanColumnSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  limit: Schema.optional(Schema.Number),
  strictLimit: Schema.optional(Schema.Boolean),
  collapsed: Schema.optional(Schema.Boolean)
})

/** The node of each widget as it goes to the page: its kind, its id and its config, with no data. */
export const WireNodes = {
  calendar: Schema.TaggedStruct("calendar", { id: Schema.String, size: Size, tooltip: Tooltip }),
  timepicker: Schema.TaggedStruct("timepicker", { id: Schema.String, size: Size, tooltip: Tooltip }),
  slider: Schema.TaggedStruct("slider", { id: Schema.String, size: Size, tooltip: Tooltip, min: Schema.optional(Schema.Number), max: Schema.optional(Schema.Number), step: Schema.optional(Schema.Number), label: Schema.optional(Schema.String) }),
  colorpicker: Schema.TaggedStruct("colorpicker", { id: Schema.String, size: Size, tooltip: Tooltip }),
  combobox: Schema.TaggedStruct("combobox", { id: Schema.String, size: Size, tooltip: Tooltip, options: Schema.Array(Schema.Struct({ value: Schema.String, label: Schema.String })), label: Schema.optional(Schema.String), placeholder: Schema.optional(Schema.String) }),
  /** A Grid; `menu` is the context menu of a row (a right click, or the Menu key). */
  grid: Schema.TaggedStruct("grid", { id: Schema.String, size: Size, tooltip: Tooltip, columns: Schema.Array(GridColumnSchema), menu: Schema.optional(Schema.Array(MenuItemSchema)) }),
  toolbar: Schema.TaggedStruct("toolbar", { id: Schema.String, size: Size, tooltip: Tooltip, items: Schema.Array(ToolbarItemSchema) }),
  button: Schema.TaggedStruct("button", {
    id: Schema.String,
    size: Size, tooltip: Tooltip,
    label: Schema.String,
    color: Schema.optional(Schema.Literals(["primary", "secondary", "danger", "success"])),
    view: Schema.optional(Schema.Literals(["flat", "link"])),
    disabled: Schema.optional(Schema.Boolean)
  }),
  /** A form from a plugin: its fields as data, with their rules (`required`, `pattern`, `min`, `max`). */
  form: Schema.TaggedStruct("form", { id: Schema.String, size: Size, tooltip: Tooltip, fields: Schema.Array(FieldSchema), submitLabel: Schema.optional(Schema.String) }),
  datepicker: Schema.TaggedStruct("datepicker", { id: Schema.String, size: Size, tooltip: Tooltip, label: Schema.optional(Schema.String), placeholder: Schema.optional(Schema.String) }),
  /** A Chart: its config as data (type, series, scales, legend), and its rows as the state of its model. */
  chart: Schema.TaggedStruct("chart", { id: Schema.String, size: Size, tooltip: Tooltip, config: ChartConfigSchema }),
  /** A Diagram (`editor: true` for the editor, where the user draws): its kind and its config as data, its items as the state of its model. */
  diagram: Schema.TaggedStruct("diagram", {
    id: Schema.String,
    size: Size, tooltip: Tooltip,
    type: Schema.optional(Schema.Literals(["default", "org", "mindmap"])),
    editor: Schema.optional(Schema.Boolean),
    config: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
  }),
  /** A RichText editor: its format and its bars as config, its text as the state of a value model. */
  richtext: Schema.TaggedStruct("richtext", {
    id: Schema.String,
    size: Size, tooltip: Tooltip,
    format: Schema.optional(Schema.Literals(["html", "markdown", "text"])),
    toolbar: Schema.optional(Schema.Boolean),
    menubar: Schema.optional(Schema.Boolean),
    readOnly: Schema.optional(Schema.Boolean)
  }),
  /** A To Do List: its tasks, projects and people as the state of its model. */
  todo: Schema.TaggedStruct("todo", { id: Schema.String, size: Size, tooltip: Tooltip, readonly: Schema.optional(Schema.Boolean) }),
  /** A Booking: the first and the last day as ISO dates; its cards are the state of its model. */
  booking: Schema.TaggedStruct("booking", { id: Schema.String, size: Size, tooltip: Tooltip, start: Schema.optional(Schema.String), end: Schema.optional(Schema.String) }),
  /** A Pivot: its fields and its panel as config; its rows and its build are the state of its model. */
  pivot: Schema.TaggedStruct("pivot", { id: Schema.String, size: Size, tooltip: Tooltip, fields: Schema.Array(PivotFieldSchema), configPanel: Schema.optional(Schema.Boolean) }),
  /** A Spreadsheet: its size and its bars as config; its cells are the state of its model. */
  spreadsheet: Schema.TaggedStruct("spreadsheet", {
    id: Schema.String,
    size: Size, tooltip: Tooltip,
    rowsCount: Schema.optional(Schema.Number),
    colsCount: Schema.optional(Schema.Number),
    editLine: Schema.optional(Schema.Boolean),
    menu: Schema.optional(Schema.Boolean),
    readonly: Schema.optional(Schema.Boolean),
    multiSheets: Schema.optional(Schema.Boolean)
  }),
  /** A Vault: the user adds files and sees them; the files are the state of its model, and the bytes go to the plugin. */
  vault: Schema.TaggedStruct("vault", { id: Schema.String, size: Size, tooltip: Tooltip, mode: Schema.optional(Schema.Literals(["list", "grid"])), toolbar: Schema.optional(Schema.Boolean), maxSize: Schema.optional(Schema.Number) }),
  /** A button that opens the file dialog; each file goes to the plugin with its bytes. */
  filepicker: Schema.TaggedStruct("filepicker", {
    id: Schema.String,
    size: Size, tooltip: Tooltip,
    label: Schema.optional(Schema.String),
    accept: Schema.optional(Schema.String),
    multiple: Schema.optional(Schema.Boolean),
    maxSize: Schema.optional(Schema.Number)
  }),
  menu: Schema.TaggedStruct("menu", { id: Schema.String, size: Size, tooltip: Tooltip, items: Schema.Array(MenuItemSchema) }),
  ribbon: Schema.TaggedStruct("ribbon", { id: Schema.String, size: Size, tooltip: Tooltip, blocks: Schema.Array(Schema.Struct({ title: Schema.String, items: Schema.Array(MenuItemSchema) })) }),
  /** A List or a DataView shows the `fields` of a row, one after the other, as text. */
  list: Schema.TaggedStruct("list", { id: Schema.String, size: Size, tooltip: Tooltip, fields: Schema.Array(Schema.String), itemHeight: Schema.optional(Schema.Number) }),
  dataview: Schema.TaggedStruct("dataview", { id: Schema.String, size: Size, tooltip: Tooltip, fields: Schema.Array(Schema.String), itemsInRow: Schema.optional(Schema.Number) }),
  /** A Tree shows the `value` of a row. */
  tree: Schema.TaggedStruct("tree", { id: Schema.String, size: Size, tooltip: Tooltip }),
  gantt: Schema.TaggedStruct("gantt", { id: Schema.String, size: Size, tooltip: Tooltip }),
  scheduler: Schema.TaggedStruct("scheduler", { id: Schema.String, size: Size, tooltip: Tooltip }),
  kanban: Schema.TaggedStruct("kanban", {
    id: Schema.String,
    size: Size, tooltip: Tooltip,
    field: Schema.String,
    columns: Schema.Array(KanbanColumnSchema),
    lanes: Schema.optional(Schema.Struct({ field: Schema.String, rows: Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String, collapsed: Schema.optional(Schema.Boolean) })) })),
    labelField: Schema.String,
    descriptionField: Schema.optional(Schema.String)
  })
} as const

/** A node of a widget: its kind, its id and its config. */
export const WidgetNodeSchema = Schema.Union(Object.values(WireNodes))
export type WidgetNode = typeof WidgetNodeSchema.Type

/** A frame: its children from top to bottom (`column`) or from left to right (`row`). */
export type FrameNode = { readonly _tag: "column" | "row"; readonly id: string; readonly size?: number | undefined; readonly children: ReadonlyArray<UiNode> }
/**
 * Tabs, each with a label and a child node; the id of a tab is the id of its child. The open tab is
 * the state of a model under the id of the tabbar (`tabsModel`), and the page draws only that tab.
 */
export type TabbarNode = { readonly _tag: "tabbar"; readonly id: string; readonly size?: number | undefined; readonly tabs: ReadonlyArray<{ readonly label: string; readonly child: UiNode }> }
/** A Sidebar on the left, with an item for each child, and the child of the chosen item on the right. The chosen item is the state of a model, as for tabs. */
export type SidebarNode = {
  readonly _tag: "sidebar"
  readonly id: string
  readonly size?: number | undefined
  /** The width of the sidebar, in px. */
  readonly width?: number | undefined
  readonly items: ReadonlyArray<{ readonly label: string; readonly icon?: string | undefined; readonly child: UiNode }>
}
/**
 * A DHTMLX Layout: a cell for each child, from top to bottom (`rows`) or from left to right (`cols`).
 * The id of a cell is the id of its child. Which cells are hidden is the state of a model (`cellsModel`).
 */
export type LayoutNode = {
  readonly _tag: "layout"
  readonly id: string
  readonly size?: number | undefined
  readonly direction: "rows" | "cols"
  readonly type?: "line" | "wide" | "space" | "none" | undefined
  readonly cells: ReadonlyArray<{
    readonly child: UiNode
    readonly header?: string | undefined
    /** A size in px or %, such as `240` or `"30%"`, along the layout. */
    readonly size?: number | string | undefined
    readonly resizable?: boolean | undefined
    readonly collapsable?: boolean | undefined
  }>
}
/**
 * A DHTMLX Window over the page, with a child node in it. It takes no room in its frame. Whether it
 * is open is the state of a model (`windowModel`): the plugin opens it, and the cross of the user is
 * the action `close`.
 */
export type WindowNode = {
  readonly _tag: "window"
  readonly id: string
  readonly size?: number | undefined
  readonly title: string
  readonly width?: number | undefined
  readonly height?: number | undefined
  readonly modal?: boolean | undefined
  readonly child: UiNode
}
export type UiNode = WidgetNode | FrameNode | TabbarNode | SidebarNode | LayoutNode | WindowNode

/** The children of a node: of a frame, of tabs, of a sidebar, of a layout. A widget has none. */
export const childrenOf = (node: UiNode): ReadonlyArray<UiNode> =>
  "children" in node
    ? node.children
    : node._tag === "tabbar"
      ? node.tabs.map((tab) => tab.child)
      : node._tag === "sidebar"
        ? node.items.map((item) => item.child)
        : node._tag === "layout"
          ? node.cells.map((cell) => cell.child)
          : node._tag === "window"
            ? [node.child]
            : []

export const UiNodeSchema: Schema.Codec<UiNode> = Schema.Union([
  WidgetNodeSchema,
  Schema.Struct({
    _tag: Schema.Literals(["column", "row"]),
    id: Schema.String,
    size: Size,
    children: Schema.Array(Schema.suspend((): Schema.Codec<UiNode> => UiNodeSchema))
  }),
  Schema.Struct({
    _tag: Schema.Literal("tabbar"),
    id: Schema.String,
    size: Size,
    tabs: Schema.Array(Schema.Struct({ label: Schema.String, child: Schema.suspend((): Schema.Codec<UiNode> => UiNodeSchema) }))
  }),
  Schema.Struct({
    _tag: Schema.Literal("sidebar"),
    id: Schema.String,
    size: Size,
    width: Schema.optional(Schema.Number),
    items: Schema.Array(Schema.Struct({ label: Schema.String, icon: Schema.optional(Schema.String), child: Schema.suspend((): Schema.Codec<UiNode> => UiNodeSchema) }))
  }),
  Schema.Struct({
    _tag: Schema.Literal("layout"),
    id: Schema.String,
    size: Size,
    direction: Schema.Literals(["rows", "cols"]),
    type: Schema.optional(Schema.Literals(["line", "wide", "space", "none"])),
    cells: Schema.Array(Schema.Struct({
      child: Schema.suspend((): Schema.Codec<UiNode> => UiNodeSchema),
      header: Schema.optional(Schema.String),
      size: Schema.optional(Schema.Union([Schema.Number, Schema.String])),
      resizable: Schema.optional(Schema.Boolean),
      collapsable: Schema.optional(Schema.Boolean)
    }))
  }),
  Schema.Struct({
    _tag: Schema.Literal("window"),
    id: Schema.String,
    size: Size,
    title: Schema.String,
    width: Schema.optional(Schema.Number),
    height: Schema.optional(Schema.Number),
    modal: Schema.optional(Schema.Boolean),
    child: Schema.suspend((): Schema.Codec<UiNode> => UiNodeSchema)
  })
]) as never

// The constructors for the plugin: each one puts the model in the document under the id of the
// node, for the life of the scope, and gives the node.

type Config<N extends WidgetNode> = Omit<N, "_tag" | "id">
const node = <N extends WidgetNode>(tag: N["_tag"], id: string, part: Parameters<UiState["Service"]["register"]>[1], config: object) =>
  Effect.gen(function* () {
    const ui = yield* UiState
    yield* ui.register(id, part)
    return { _tag: tag, id, ...config } as unknown as N
  })

export const column = (id: string, children: ReadonlyArray<UiNode>, size?: number): FrameNode => ({ _tag: "column", id, children, size })
export const row = (id: string, children: ReadonlyArray<UiNode>, size?: number): FrameNode => ({ _tag: "row", id, children, size })

/** The model of a tabbar: the id of the open tab, one of `ids`. Another id is refused. */
export const tabsModel = (ids: ReadonlyArray<string>, value?: Input<string>) =>
  valueModel<string>(value === undefined ? {} : { value }, ids[0] ?? "", { accepts: (id) => ids.includes(id) })

/** A sidebar in the page, with the model of its chosen item (`tabsModel` of the ids of its children) under `id`. */
export const sidebarNode = (id: string, model: ValueModel<string>, items: SidebarNode["items"], config: { readonly width?: number; readonly size?: number } = {}) =>
  Effect.gen(function* () {
    const ui = yield* UiState
    yield* ui.register(id, partOf(model, VALUE_ACTIONS))
    return { _tag: "sidebar", id, items, ...config } satisfies SidebarNode
  })

export type CellsModel = {
  /** The ids of the cells that are hidden. */
  readonly hidden: SubscriptionRef.SubscriptionRef<ReadonlyArray<string>>
  /** Hides a cell, and the cells next to it take its room. A cell that is not there is refused. */
  readonly hide: (id: string) => Effect.Effect<boolean>
  readonly show: (id: string) => Effect.Effect<boolean>
  readonly recent: Effect.Effect<ReadonlyArray<Entry>>
  readonly snapshot: Effect.Effect<{ readonly hidden: ReadonlyArray<string> }>
  readonly changes: Stream.Stream<void>
}

export type WindowModel = {
  readonly open: SubscriptionRef.SubscriptionRef<boolean>
  /** The cross of the user. */
  readonly close: Effect.Effect<boolean>
  readonly recent: Effect.Effect<ReadonlyArray<Entry>>
  readonly snapshot: Effect.Effect<{ readonly open: boolean }>
  readonly changes: Stream.Stream<void>
}

/** The actions of a `WindowModel`, by name. */
export const WINDOW_ACTIONS = ["close"] as const satisfies ReadonlyArray<keyof WindowModel>

/** The model of a window: whether it is open. The plugin sets `open`; the user can only close it. */
export const windowModel = (options: { readonly open?: Input<boolean>; readonly history?: number } = {}): Effect.Effect<WindowModel, never, Scope.Scope> =>
  Effect.gen(function* () {
    const open = yield* input(options.open, false)
    const log = yield* history(options.history ?? 0)
    yield* recordInput(log, "open", open)
    return {
      open,
      close: Effect.gen(function* () {
        yield* log.record({ _tag: "action", name: "close", value: undefined })
        if (yield* SubscriptionRef.get(open)) yield* SubscriptionRef.set(open, false)
        return true
      }),
      recent: log.recent,
      snapshot: Effect.map(SubscriptionRef.get(open), (now) => ({ open: now })),
      changes: changesOf(open)
    }
  })

/** A window in the page, with its model under `id`. */
export const windowNode = (model: WindowModel, node: WindowNode) =>
  Effect.gen(function* () {
    const ui = yield* UiState
    yield* ui.register(node.id, partOf(model, WINDOW_ACTIONS))
    return node
  })

/** The actions of a `CellsModel`, by name. */
export const CELLS_ACTIONS = ["hide", "show"] as const satisfies ReadonlyArray<keyof CellsModel>

/** The model of a layout: which of the cells `ids` are hidden. */
export const cellsModel = (ids: ReadonlyArray<string>, options: { readonly hidden?: Input<ReadonlyArray<string>>; readonly history?: number } = {}): Effect.Effect<CellsModel, never, Scope.Scope> =>
  Effect.gen(function* () {
    const hidden = yield* input<ReadonlyArray<string>>(options.hidden, [])
    const log = yield* history(options.history ?? 0)
    yield* recordInput(log, "hidden", hidden)
    const toggle = (name: "hide" | "show", id: string) =>
      Effect.gen(function* () {
        if (!ids.includes(id)) return false
        yield* log.record({ _tag: "action", name, value: id })
        const now = yield* SubscriptionRef.get(hidden)
        if (now.includes(id) === (name === "hide")) return true
        yield* SubscriptionRef.set(hidden, name === "hide" ? [...now, id] : now.filter((one) => one !== id))
        return true
      })
    return {
      hidden,
      hide: (id) => toggle("hide", id),
      show: (id) => toggle("show", id),
      recent: log.recent,
      snapshot: Effect.map(SubscriptionRef.get(hidden), (now) => ({ hidden: now })),
      changes: changesOf(hidden)
    }
  })

/** A layout in the page, with its model under `id`. */
export const layoutNode = (id: string, model: CellsModel, config: Omit<LayoutNode, "_tag" | "id">) =>
  Effect.gen(function* () {
    const ui = yield* UiState
    yield* ui.register(id, partOf(model, CELLS_ACTIONS))
    return { _tag: "layout", id, ...config } satisfies LayoutNode
  })

/** A tabbar in the page, with its model under `id`. */
export const tabbarNode = (id: string, model: ValueModel<string>, tabs: TabbarNode["tabs"], size?: number) =>
  Effect.gen(function* () {
    const ui = yield* UiState
    yield* ui.register(id, partOf(model, VALUE_ACTIONS))
    return { _tag: "tabbar", id, tabs, ...(size === undefined ? {} : { size }) } satisfies TabbarNode
  })

type Node<T extends WidgetNode["_tag"]> = Extract<WidgetNode, { readonly _tag: T }>

export const calendarNode = (id: string, model: ValueModel<string | undefined>, config: Config<Node<"calendar">> = {}) => node<Node<"calendar">>("calendar", id, partOf(model, VALUE_ACTIONS), config)
export const timepickerNode = (id: string, model: ValueModel<string>, config: Config<Node<"timepicker">> = {}) => node<Node<"timepicker">>("timepicker", id, partOf(model, VALUE_ACTIONS), config)
export const sliderNode = (id: string, model: ValueModel<number>, config: Config<Node<"slider">> = {}) => node<Node<"slider">>("slider", id, partOf(model, VALUE_ACTIONS), config)
export const colorpickerNode = (id: string, model: ValueModel<string>, config: Config<Node<"colorpicker">> = {}) => node<Node<"colorpicker">>("colorpicker", id, partOf(model, VALUE_ACTIONS), config)
export const comboboxNode = (id: string, model: ValueModel<string | undefined>, config: Config<Node<"combobox">>) => node<Node<"combobox">>("combobox", id, partOf(model, VALUE_ACTIONS), config)
/** A Grid in the page. Its model needs its rows, so the page can draw them. */
export const gridNode = (id: string, model: GridModel, config: { readonly columns: ReadonlyArray<GridColumn>; readonly size?: number; readonly menu?: ReadonlyArray<MenuItem> }) => node<Node<"grid">>("grid", id, partOf(model, GRID_ACTIONS), config)
export const listNode = (id: string, model: SelectionModel, config: Config<Node<"list">>) => node<Node<"list">>("list", id, partOf(model, SELECTION_ACTIONS), config)
export const dataviewNode = (id: string, model: SelectionModel, config: Config<Node<"dataview">>) => node<Node<"dataview">>("dataview", id, partOf(model, SELECTION_ACTIONS), config)
export const treeNode = (id: string, model: TreeModel, config: Config<Node<"tree">> = {}) => node<Node<"tree">>("tree", id, partOf(model, TREE_ACTIONS), config)
export const ganttNode = (id: string, model: GanttModel, config: Config<Node<"gantt">> = {}) => node<Node<"gantt">>("gantt", id, partOf(model, GANTT_ACTIONS), config)
export const schedulerNode = (id: string, model: SchedulerModel, config: Config<Node<"scheduler">> = {}) => node<Node<"scheduler">>("scheduler", id, partOf(model, SCHEDULER_ACTIONS), config)
export const kanbanNode = <R extends Row>(
  id: string,
  model: KanbanModel<R>,
  config: {
    readonly field: keyof R & string
    readonly columns: ReadonlyArray<KanbanColumn>
    readonly lanes?: { readonly field: keyof R & string; readonly rows: ReadonlyArray<KanbanLane> }
    readonly labelField: keyof R & string
    readonly descriptionField?: keyof R & string
    readonly size?: number
  }
) => node<Node<"kanban">>("kanban", id, partOf(model as never, KANBAN_ACTIONS as never), config)

/** A form in the page, with its model under the id of the node. */
export const formNode = <A>(node: Extract<WidgetNode, { readonly _tag: "form" }>, model: FormModel<A>) =>
  Effect.gen(function* () {
    const ui = yield* UiState
    yield* ui.register(node.id, partOf(model as FormModel, FORM_ACTIONS))
    return node
  })

/** A DatePicker in the page: one day, with the model of a Calendar. */
export const datepickerNode = (node: Extract<WidgetNode, { readonly _tag: "datepicker" }>, model: ValueModel<string | undefined>) =>
  Effect.gen(function* () {
    const ui = yield* UiState
    yield* ui.register(node.id, partOf(model, VALUE_ACTIONS))
    return node
  })

/** A Chart in the page, with its model under the id of the node. */
export const chartNode = (node: Extract<WidgetNode, { readonly _tag: "chart" }>, model: ChartModel) =>
  Effect.gen(function* () {
    const ui = yield* UiState
    yield* ui.register(node.id, partOf(model, CHART_ACTIONS))
    return node
  })

/** A node in the page, with its model under the id of the node. */
export const modelNode = <N extends WidgetNode>(node: N, part: Part) =>
  Effect.gen(function* () {
    const ui = yield* UiState
    yield* ui.register(node.id, part)
    return node
  })

/** A Diagram in the page, with its model under the id of the node. */
export const diagramNode = (node: Extract<WidgetNode, { readonly _tag: "diagram" }>, model: DiagramModel) =>
  Effect.gen(function* () {
    const ui = yield* UiState
    yield* ui.register(node.id, partOf(model, DIAGRAM_ACTIONS))
    return node
  })

/** A Toolbar, a Button, a Menu or a Ribbon in the page, with its model of clicks under `id`. */
export const clicksNode = <N extends Extract<WidgetNode, { readonly _tag: "toolbar" | "button" | "menu" | "ribbon" }>>(node: N, model: ClickModel) =>
  Effect.gen(function* () {
    const ui = yield* UiState
    yield* ui.register(node.id, partOf(model, CLICK_ACTIONS))
    return node
  })

/** Puts the tree in the document for the life of the scope. A new value of `tree` goes to the page as a patch. */
export const publishTree = (tree: SubscriptionRef.SubscriptionRef<UiNode>): Effect.Effect<void, never, UiState | Scope.Scope> =>
  Effect.flatMap(UiState, (ui) => ui.register(TREE_KEY, { snapshot: SubscriptionRef.get(tree), changes: Stream.as(SubscriptionRef.changes(tree), undefined) }))
