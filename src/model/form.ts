import { Effect, PubSub, Schema, type Scope, Stream, SubscriptionRef } from "effect"
import { check, type Checked } from "../core/form"
import { changesOf, type Entry, history, type Input, input, recordInput } from "./model"

/**
 * The kinds of field. A day is `YYYY-MM-DD` and a time `HH:mm` (see `Day` and `Time` in core/form.ts).
 *
 * - `radio` is one of the options, as a string: the RadioGroup of DHTMLX.
 * - `checks` and `toggles` are the chosen options, as an array of their values, in the order of the
 *   options: the CheckboxGroup and the ToggleGroup.
 * - `toggle` is a boolean: one Toggle button.
 * - `note` shows its value as text that the user cannot change: the Text control.
 * - `avatar` is one picture, as an `AvatarValue`: the Avatar control.
 * - `files` is a list of picked files, as `FormFile`s: the SimpleVault control.
 *
 * Two kinds have no value. They shape the form:
 *
 * - `fieldset` is a box with a label around its `fields`. The values of those fields stay in the
 *   one flat record of the form.
 * - `spacer` is empty room, with a `height`.
 *
 * The Container control of DHTMLX is not here: it is only in the PRO edition of the Suite.
 */
export type FieldKind =
  | "text" | "textarea" | "number" | "checkbox" | "select" | "combo" | "date" | "time" | "slider" | "color"
  | "radio" | "checks" | "toggle" | "toggles" | "note" | "avatar" | "files"
  | "fieldset" | "spacer"

/** The picture of an `avatar` field: a link to it, or the file that the user picked. */
export type AvatarValue = { readonly src?: string; readonly file?: File }

/** One file of a `files` field. The form sends nothing: the app takes `file` and uploads it. */
export type FormFile = { readonly id: string; readonly name: string; readonly size: number; readonly file?: File }

export type Field = {
  readonly name: string
  readonly label?: string
  readonly kind?: FieldKind
  /** The choices of a select, a combo, a radio, checks or toggles. */
  readonly options?: ReadonlyArray<{ readonly value: string; readonly label: string }>
  /** The range of a slider. */
  readonly min?: number
  readonly max?: number
  readonly step?: number
  readonly placeholder?: string
  /** The files that an `avatar` or a `files` field takes, as on an `<input type="file">`, such as `image/*`. */
  readonly accept?: string
  /** The fields in a `fieldset`. A field of the Schema that is named here leaves its place in the form. */
  readonly fields?: ReadonlyArray<Field>
  /** A `fieldset` puts its fields under each other (`rows`, the default) or next to each other (`cols`). */
  readonly direction?: "rows" | "cols"
  /** Pixels, for a `spacer`. */
  readonly height?: number
  /** Rules as data, for a form with no Schema (a form from a plugin): a value must be there. */
  readonly required?: boolean
  /** A regular expression that a text must match. */
  readonly pattern?: string
  /** The message when a rule fails. */
  readonly message?: string
}

/** The kinds that shape the form and hold no value. */
export const isLayout = (field: Field) => field.kind === "fieldset" || field.kind === "spacer"

/** Each field with a value, also the ones in a fieldset. */
export const leaves = (fields: ReadonlyArray<Field>): ReadonlyArray<Field> =>
  fields.flatMap((field) => (field.kind === "fieldset" ? leaves(field.fields ?? []) : isLayout(field) ? [] : [field]))


/** A field kind from the Schema, for a field that names none: a text, a number, a checkbox, or a select of literals. */
const kindOf = (ast: Schema.Top["ast"]): { readonly kind: FieldKind; readonly options?: ReadonlyArray<{ readonly value: string; readonly label: string }> } => {
  const node = ast as { readonly _tag: string; readonly literal?: unknown; readonly types?: ReadonlyArray<{ readonly _tag: string; readonly literal?: unknown }> }
  switch (node._tag) {
    case "Number":
      return { kind: "number" }
    case "Boolean":
      return { kind: "checkbox" }
    case "Union": {
      const literals = (node.types ?? []).filter((type) => type._tag === "Literal").map((type) => String(type.literal))
      if (literals.length > 0 && literals.length === (node.types ?? []).length) return { kind: "select", options: literals.map((value) => ({ value, label: value })) }
      return { kind: "text" }
    }
    default:
      return { kind: "text" }
  }
}

/**
 * The fields of a Struct Schema, in its order, with a kind from the type of each one. `fields`
 * changes a field by its name, such as a label or the kind `date`, and can add fields. When `fields`
 * has a fieldset or a spacer, it also gives the order of the fields that it names.
 */
export const fieldsOf = (schema: Schema.Top, fields: ReadonlyArray<Field> = []): ReadonlyArray<Field> => {
  const given = new Map(fields.map((field) => [field.name, field]))
  const ast = schema.ast as { readonly _tag: string; readonly propertySignatures?: ReadonlyArray<{ readonly name: PropertyKey; readonly type: Schema.Top["ast"] }> }
  const signatures = ast._tag === "Objects" ? ast.propertySignatures ?? [] : []
  const fromSchema = new Map<string, Field>(signatures.map((signature) => {
    const name = String(signature.name)
    return [name, { name, label: name[0]!.toUpperCase() + name.slice(1), ...kindOf(signature.type) }]
  }))
  // A field in a fieldset takes its kind and label from the Schema too, and leaves the top of the form.
  const claimed = new Set<string>()
  const inside = (field: Field): Field => {
    if (field.kind !== "fieldset") return field
    return {
      ...field,
      fields: (field.fields ?? []).map((one) => {
        if (one.kind === "fieldset") return inside(one)
        claimed.add(one.name)
        return isLayout(one) ? one : { kind: "text" as const, label: one.name, ...fromSchema.get(one.name), ...one }
      })
    }
  }
  const resolve = (field: Field): Field =>
    isLayout(field) ? inside(field) : { kind: "text" as const, label: field.name, ...fromSchema.get(field.name), ...field }
  // With a fieldset or a spacer, `fields` is also the order: first the fields of the Schema that it
  // does not name, then its fields as they are given.
  if (fields.some(isLayout)) {
    const placed = fields.map(resolve)
    const rest: Array<Field> = []
    for (const [name, field] of fromSchema) if (!claimed.has(name) && !given.has(name)) rest.push(field)
    return [...rest, ...placed]
  }
  const out: Array<Field> = []
  for (const [name, field] of fromSchema) out.push({ ...field, ...given.get(name) })
  return [...out, ...fields.filter((field) => !fromSchema.has(field.name)).map(resolve)]
}


type Values = Readonly<Record<string, unknown>>

/** A field as data, for a form that comes from a plugin. */
export const FieldSchema: Schema.Codec<Field> = Schema.Struct({
  name: Schema.String,
  label: Schema.optional(Schema.String),
  kind: Schema.optional(Schema.Literals(["text", "textarea", "number", "checkbox", "select", "combo", "date", "time", "slider", "color", "radio", "checks", "toggle", "toggles", "note", "avatar", "files", "fieldset", "spacer"])),
  options: Schema.optional(Schema.Array(Schema.Struct({ value: Schema.String, label: Schema.String }))),
  min: Schema.optional(Schema.Number),
  max: Schema.optional(Schema.Number),
  step: Schema.optional(Schema.Number),
  placeholder: Schema.optional(Schema.String),
  accept: Schema.optional(Schema.String),
  fields: Schema.optional(Schema.Array(Schema.suspend((): Schema.Codec<Field> => FieldSchema))),
  direction: Schema.optional(Schema.Literals(["rows", "cols"])),
  height: Schema.optional(Schema.Number),
  required: Schema.optional(Schema.Boolean),
  pattern: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String)
}) as never

/** The check of a form from the rules of its fields, as data: `required`, `pattern`, and `min` and `max` of a number. */
export const rulesCheck = (fields: ReadonlyArray<Field>) => (values: Values): Checked<Values> => {
  const errors: Record<string, string> = {}
  for (const field of leaves(fields)) {
    const value = values[field.name]
    const empty = value === undefined || value === "" || (Array.isArray(value) && value.length === 0)
    const fail = (text: string) => (errors[field.name] = field.message ?? text)
    if (empty) {
      if (field.required === true) fail("Fill this in")
      continue
    }
    if (field.pattern !== undefined && !new RegExp(field.pattern).test(String(value))) fail("This is not in the right form")
    if (typeof value === "number" && field.min !== undefined && value < field.min) fail(`At least ${field.min}`)
    if (typeof value === "number" && field.max !== undefined && value > field.max) fail(`At most ${field.max}`)
  }
  return Object.keys(errors).length === 0 ? { _tag: "valid", value: values } : { _tag: "invalid", errors }
}

/** The check of a form from an Effect Schema: the typed value, or one message for each field that is wrong. */
export const schemaCheck = <S extends Schema.Top>(schema: S) => (values: Values): Checked<S["Type"]> => check(schema, values)

export type FormModel<A = Values> = {
  readonly values: SubscriptionRef.SubscriptionRef<Values>
  /**
   * The errors to show, by field: of a field that the user changed, or of each field after a send.
   * An error of the whole value is under the key "".
   */
  readonly errors: SubscriptionRef.SubscriptionRef<Readonly<Record<string, string>>>
  /** Each value that the user sent and that the check found right. */
  readonly submitted: Stream.Stream<A>
  /** The user changed a field. A field that is not in the form is refused. */
  readonly change: (field: string, value: unknown) => Effect.Effect<boolean>
  /** The user sends the form. It is refused while the values do not pass the check: then each error shows. */
  readonly submit: Effect.Effect<boolean>
  readonly recent: Effect.Effect<ReadonlyArray<Entry>>
  readonly snapshot: Effect.Effect<{ readonly values: Values; readonly errors: Readonly<Record<string, string>> }>
  readonly changes: Stream.Stream<void>
}

/** The actions of a `FormModel`, by name. */
export const FORM_ACTIONS = ["change", "submit"] as const satisfies ReadonlyArray<keyof FormModel>

/**
 * The model of a form: the values and the errors to show as state, `change` and `submit` as actions.
 * `check` is `schemaCheck(schema)` in code, or `rulesCheck(fields)` for a form that comes as data.
 */
export const formModel = <A>(
  check: (values: Values) => Checked<A>,
  fields: ReadonlyArray<Field>,
  options: { readonly values?: Input<Values>; readonly history?: number } = {}
): Effect.Effect<FormModel<A>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const names = new Set(leaves(fields).map((field) => field.name))
    const values = yield* input<Values>(options.values, {})
    const errors = yield* SubscriptionRef.make<Readonly<Record<string, string>>>({})
    const submitted = yield* Effect.acquireRelease(PubSub.unbounded<A>(), PubSub.shutdown)
    const log = yield* history(options.history ?? 0)
    yield* recordInput(log, "values", values)
    const touched = new Set<string>()
    let sent = false
    const show = (result: Checked<A>) => {
      if (result._tag === "valid") return SubscriptionRef.set(errors, {})
      const shown = Object.fromEntries(Object.entries(result.errors).filter(([name]) => sent || touched.has(name)))
      return SubscriptionRef.set(errors, shown)
    }
    // A value that comes in from outside shows its errors too, for the fields that were touched.
    yield* SubscriptionRef.changes(values).pipe(Stream.runForEach((now) => show(check(now))), Effect.forkScoped({ startImmediately: true }))
    return {
      values,
      errors,
      submitted: Stream.fromPubSub(submitted),
      change: (field, value) =>
        Effect.gen(function* () {
          if (!names.has(field)) return false
          yield* log.record({ _tag: "action", name: "change", value: { field, value } })
          touched.add(field)
          const now = yield* SubscriptionRef.get(values)
          const next = { ...now, [field]: value }
          if (value === undefined) delete next[field]
          yield* SubscriptionRef.set(values, next)
          return true
        }),
      submit: Effect.gen(function* () {
        yield* log.record({ _tag: "action", name: "submit", value: undefined })
        sent = true
        const result = check(yield* SubscriptionRef.get(values))
        yield* show(result)
        if (result._tag === "invalid") return false
        yield* PubSub.publish(submitted, result.value)
        yield* log.record({ _tag: "event", name: "submitted", value: result.value })
        return true
      }),
      recent: log.recent,
      snapshot: Effect.all({ values: SubscriptionRef.get(values), errors: SubscriptionRef.get(errors) }),
      changes: changesOf(values, errors)
    }
  })
