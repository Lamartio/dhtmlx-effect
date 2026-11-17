import { Schema } from "effect"
import { DiagramItemSchema } from "./diagram"
import { ZOOM_LEVELS } from "./gantt"
import { TodoDataSchema } from "./todo"
import { BookingCardSchema } from "./booking"
import { PivotConfigSchema } from "./pivot"
import { SpreadsheetDataSchema } from "./spreadsheet"
import { VaultEntrySchema } from "./files"

/**
 * The state of each kind of node, as it is in the document: the Schema that the page checks after
 * each patch. A state that does not pass is reported, and its node keeps its last state.
 */

/** A row of data: an id that is a string, and any fields. */
export const RowSchema = Schema.Record(Schema.String, Schema.Unknown).pipe(
  Schema.check(Schema.makeFilter((row: Readonly<Record<string, unknown>>) => typeof row["id"] === "string" || "A row needs an id that is a string"))
)
export const Rows = Schema.Array(RowSchema)

export const TaskSchema = Schema.Struct({ id: Schema.String, text: Schema.String, start: Schema.String, duration: Schema.Number, progress: Schema.Number, parent: Schema.optional(Schema.String) })
export const EventSchema = Schema.Struct({ id: Schema.String, text: Schema.String, start: Schema.String, end: Schema.String })

const value = <S extends Schema.Top>(schema: S) => Schema.Struct({ value: Schema.optional(schema) })
const selected = Schema.optional(Schema.String)
const strings = Schema.Array(Schema.String)
const none = Schema.Struct({})

/** The Schema of the state of each kind of node that has a model, by its `_tag`. */
export const STATES = {
  calendar: value(Schema.String),
  timepicker: value(Schema.String),
  slider: value(Schema.Number),
  colorpicker: value(Schema.String),
  combobox: value(Schema.String),
  datepicker: value(Schema.String),
  tabbar: value(Schema.String),
  sidebar: value(Schema.String),
  layout: Schema.Struct({ hidden: strings }),
  grid: Schema.Struct({
    selected,
    sort: Schema.optional(Schema.Struct({ column: Schema.String, dir: Schema.Literals(["asc", "desc"]) })),
    filters: Schema.Record(Schema.String, Schema.String),
    rows: Schema.optional(Rows)
  }),
  list: Schema.Struct({ selected, rows: Schema.optional(Rows) }),
  dataview: Schema.Struct({ selected, rows: Schema.optional(Rows) }),
  tree: Schema.Struct({ selected, expanded: strings, rows: Schema.optional(Rows) }),
  gantt: Schema.Struct({ zoom: Schema.Literals(ZOOM_LEVELS), tasks: Schema.Array(TaskSchema) }),
  scheduler: Schema.Struct({ view: Schema.Literals(["day", "week", "month"]), date: Schema.String, events: Schema.Array(EventSchema) }),
  kanban: Schema.Struct({ selected, rows: Rows }),
  form: Schema.Struct({ values: Schema.Record(Schema.String, Schema.Unknown), errors: Schema.Record(Schema.String, Schema.String) }),
  chart: Schema.Struct({ rows: Rows, hidden: strings }),
  diagram: Schema.Struct({ items: Schema.Array(DiagramItemSchema), selected }),
  richtext: value(Schema.String),
  todo: Schema.Struct({ data: TodoDataSchema }),
  booking: Schema.Struct({ cards: Schema.Array(BookingCardSchema) }),
  pivot: Schema.Struct({ rows: Rows, config: PivotConfigSchema }),
  spreadsheet: Schema.Struct({ data: SpreadsheetDataSchema }),
  vault: Schema.Struct({ files: Schema.Array(VaultEntrySchema) }),
  filepicker: none,
  toolbar: none,
  button: none,
  menu: none,
  ribbon: none
} as const

export type StateTag = keyof typeof STATES
