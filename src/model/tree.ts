import { Effect, Schema, type Scope, Stream, SubscriptionRef } from "effect"
import { GANTT_ACTIONS, type GanttModel } from "./gantt"
import { GRID_ACTIONS, type GridColumn, type GridModel } from "./grid"
import { VALUE_ACTIONS, type ValueModel } from "./inputs"
import { type KanbanColumn, type KanbanLane, KANBAN_ACTIONS, type KanbanModel } from "./kanban"
import type { Row } from "../core/rows"
import { SCHEDULER_ACTIONS, type SchedulerModel } from "./scheduler"
import { SELECTION_ACTIONS, type SelectionModel, TREE_ACTIONS, type TreeModel } from "./selection"
import { partOf, UiState } from "./ui-state"

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

/** A node of a widget: its kind, its id and its config. */
export const WidgetNodeSchema = Schema.Union([
  Schema.TaggedStruct("calendar", { id: Schema.String, size: Size }),
  Schema.TaggedStruct("timepicker", { id: Schema.String, size: Size }),
  Schema.TaggedStruct("slider", { id: Schema.String, size: Size, min: Schema.optional(Schema.Number), max: Schema.optional(Schema.Number), step: Schema.optional(Schema.Number), label: Schema.optional(Schema.String) }),
  Schema.TaggedStruct("colorpicker", { id: Schema.String, size: Size }),
  Schema.TaggedStruct("combobox", { id: Schema.String, size: Size, options: Schema.Array(Schema.Struct({ value: Schema.String, label: Schema.String })), label: Schema.optional(Schema.String), placeholder: Schema.optional(Schema.String) }),
  Schema.TaggedStruct("grid", { id: Schema.String, size: Size, columns: Schema.Array(GridColumnSchema) }),
  /** A List or a DataView shows the `fields` of a row, one after the other, as text. */
  Schema.TaggedStruct("list", { id: Schema.String, size: Size, fields: Schema.Array(Schema.String), itemHeight: Schema.optional(Schema.Number) }),
  Schema.TaggedStruct("dataview", { id: Schema.String, size: Size, fields: Schema.Array(Schema.String), itemsInRow: Schema.optional(Schema.Number) }),
  /** A Tree shows the `value` of a row. */
  Schema.TaggedStruct("tree", { id: Schema.String, size: Size }),
  Schema.TaggedStruct("gantt", { id: Schema.String, size: Size }),
  Schema.TaggedStruct("scheduler", { id: Schema.String, size: Size }),
  Schema.TaggedStruct("kanban", {
    id: Schema.String,
    size: Size,
    field: Schema.String,
    columns: Schema.Array(KanbanColumnSchema),
    lanes: Schema.optional(Schema.Struct({ field: Schema.String, rows: Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String, collapsed: Schema.optional(Schema.Boolean) })) })),
    labelField: Schema.String,
    descriptionField: Schema.optional(Schema.String)
  })
])
export type WidgetNode = typeof WidgetNodeSchema.Type

/** A frame: its children from top to bottom (`column`) or from left to right (`row`). */
export type FrameNode = { readonly _tag: "column" | "row"; readonly id: string; readonly size?: number | undefined; readonly children: ReadonlyArray<UiNode> }
export type UiNode = WidgetNode | FrameNode

export const UiNodeSchema: Schema.Codec<UiNode> = Schema.Union([
  WidgetNodeSchema,
  Schema.Struct({
    _tag: Schema.Literals(["column", "row"]),
    id: Schema.String,
    size: Size,
    children: Schema.Array(Schema.suspend((): Schema.Codec<UiNode> => UiNodeSchema))
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

type Node<T extends WidgetNode["_tag"]> = Extract<WidgetNode, { readonly _tag: T }>

export const calendarNode = (id: string, model: ValueModel<string | undefined>, config: Config<Node<"calendar">> = {}) => node<Node<"calendar">>("calendar", id, partOf(model, VALUE_ACTIONS), config)
export const timepickerNode = (id: string, model: ValueModel<string>, config: Config<Node<"timepicker">> = {}) => node<Node<"timepicker">>("timepicker", id, partOf(model, VALUE_ACTIONS), config)
export const sliderNode = (id: string, model: ValueModel<number>, config: Config<Node<"slider">> = {}) => node<Node<"slider">>("slider", id, partOf(model, VALUE_ACTIONS), config)
export const colorpickerNode = (id: string, model: ValueModel<string>, config: Config<Node<"colorpicker">> = {}) => node<Node<"colorpicker">>("colorpicker", id, partOf(model, VALUE_ACTIONS), config)
export const comboboxNode = (id: string, model: ValueModel<string | undefined>, config: Config<Node<"combobox">>) => node<Node<"combobox">>("combobox", id, partOf(model, VALUE_ACTIONS), config)
/** A Grid in the page. Its model needs its rows, so the page can draw them. */
export const gridNode = (id: string, model: GridModel, config: { readonly columns: ReadonlyArray<GridColumn>; readonly size?: number }) => node<Node<"grid">>("grid", id, partOf(model, GRID_ACTIONS), config)
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

/** Puts the tree in the document for the life of the scope. A new value of `tree` goes to the page as a patch. */
export const publishTree = (tree: SubscriptionRef.SubscriptionRef<UiNode>): Effect.Effect<void, never, UiState | Scope.Scope> =>
  Effect.flatMap(UiState, (ui) => ui.register(TREE_KEY, { snapshot: SubscriptionRef.get(tree), changes: Stream.as(SubscriptionRef.changes(tree), undefined) }))
