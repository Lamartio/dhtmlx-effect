import { Form, setTheme } from "dhx-suite"
import { Effect, PubSub, Schema, Scope, Stream, SubscriptionRef } from "effect"
import { calendarLocale, check, type Checked, dateToDay, dayToDate } from "../core/form"
import { Browser, follow } from "./browser"
import { child, Host, resource } from "./host"
import { resourceAfterPaint } from "./paint"
import { calendarNames } from "./inputs"

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
}

/** The kinds that shape the form and hold no value. */
const isLayout = (field: Field) => field.kind === "fieldset" || field.kind === "spacer"

/** Each field with a value, also the ones in a fieldset. */
const leaves = (fields: ReadonlyArray<Field>): ReadonlyArray<Field> =>
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
 * changes a field by its name, such as a label or the kind `date`.
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
  const extras = fields.filter((field) => !fromSchema.has(field.name)).map((field) => (isLayout(field) ? inside(field) : { kind: "text" as const, label: field.name, ...field }))
  const out: Array<Field> = []
  for (const [name, field] of fromSchema) if (!claimed.has(name)) out.push({ ...field, ...given.get(name) })
  return [...out, ...extras]
}

type Values = Readonly<Record<string, unknown>>

/** The kinds whose DHTMLX control shows an error line under it. Checked in a test; the rest get the message in the label. */
const LINE_UNDER: ReadonlySet<FieldKind> = new Set(["text", "number", "textarea", "date"])

/** The DHTMLX control for a field, for the locale of now. */
const control = (field: Field, locale: ReturnType<typeof calendarLocale>): unknown => {
  const base = { name: field.name, id: field.name, label: field.label ?? field.name, labelPosition: "top" as const, ...(field.placeholder === undefined ? {} : { placeholder: field.placeholder }) }
  switch (field.kind ?? "text") {
    case "text":
      return { ...base, type: "input" }
    case "number":
      return { ...base, type: "input", inputType: "number" }
    case "textarea":
      return { ...base, type: "textarea" }
    case "checkbox":
      return { ...base, type: "checkbox", text: base.label, label: "" }
    case "select":
      return { ...base, type: "select", options: (field.options ?? []).map((option) => ({ value: option.value, content: option.label })) }
    case "combo":
      return { ...base, type: "combo", data: (field.options ?? []).map((option) => ({ id: option.value, value: option.label })) }
    case "date":
      return { ...base, type: "datepicker", dateFormat: locale.dateFormat, weekStart: locale.weekStart, valueFormat: "Date" }
    case "time":
      return { ...base, type: "timepicker", timeFormat: locale.twelveHours ? 12 : 24, valueFormat: "timeObject" }
    case "slider":
      return { ...base, type: "slider", min: field.min ?? 0, max: field.max ?? 100, step: field.step ?? 1, tooltip: true }
    case "color":
      return { ...base, type: "colorpicker" }
    case "radio":
      return { ...base, type: "radiogroup", options: { rows: (field.options ?? []).map((option) => ({ type: "radiobutton", id: option.value, value: option.value, text: option.label })) } }
    case "checks":
      return { ...base, type: "checkboxgroup", options: { rows: (field.options ?? []).map((option) => ({ type: "checkbox", id: option.value, text: option.label })) } }
    case "toggle":
      // A Toggle has no label of its own: the label is the text on the button.
      return { name: field.name, id: field.name, type: "toggle", text: base.label }
    case "toggles":
      return { name: field.name, id: field.name, type: "togglegroup", multiselection: true, options: (field.options ?? []).map((option) => ({ type: "toggle", id: option.value, text: option.label })) }
    case "note":
      return { ...base, type: "text" }
    case "avatar":
      return { ...base, type: "avatar", accept: field.accept ?? "image/*", autosend: false }
    case "files":
      return { ...base, type: "simplevault", autosend: false, ...(field.accept === undefined ? {} : { accept: field.accept }) }
    case "spacer":
      return { name: field.name, id: field.name, type: "spacer", height: field.height ?? 16 }
    case "fieldset":
      return { name: field.name, id: field.name, type: "fieldset", label: field.label ?? "", [field.direction ?? "rows"]: (field.fields ?? []).map((one): unknown => control(one, locale)) }
  }
}

/** The kinds whose value is a set of options. DHTMLX keeps it as an object: the id of each option, and if it is on. */
const isGroup = (field: Field) => field.kind === "checks" || field.kind === "toggles"

/** The chosen options of a group, in the order of the options. */
const chosen = (field: Field, raw: unknown): ReadonlyArray<string> => {
  if (typeof raw !== "object" || raw === null) return []
  const on = raw as Record<string, unknown>
  return (field.options ?? []).map((option) => option.value).filter((value) => on[value] !== undefined && on[value] !== false && on[value] !== "")
}

/** The kinds whose value is whole in the item: the change event of the form gives only a part of it. */
const readsItem = (field: Field) => isGroup(field) || field.kind === "toggle" || field.kind === "avatar" || field.kind === "files"

const avatarOf = (raw: unknown): AvatarValue | undefined => {
  if (typeof raw !== "object" || raw === null) return undefined
  const one = raw as { readonly src?: unknown; readonly file?: unknown }
  const src = typeof one.src === "string" && one.src !== "" ? one.src : undefined
  const file = one.file instanceof File ? one.file : undefined
  return src === undefined && file === undefined ? undefined : { ...(src === undefined ? {} : { src }), ...(file === undefined ? {} : { file }) }
}

const filesOf = (raw: unknown): ReadonlyArray<FormFile> =>
  (Array.isArray(raw) ? raw : []).map((item: Record<string, unknown>) => {
    const file = item["file"] instanceof File ? item["file"] : undefined
    return { id: String(item["id"]), name: String(item["name"] ?? file?.name ?? ""), size: Number(item["size"] ?? file?.size ?? 0), ...(file === undefined ? {} : { file }) }
  })

/** Two values of a field are the same: by value for the arrays of a group, by id for files, by picture for an avatar. */
const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((one, index) => {
      const other = b[index] as unknown
      return one === other || (typeof one === "object" && one !== null && typeof other === "object" && other !== null && (one as { id?: unknown }).id === (other as { id?: unknown }).id)
    })
  }
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null && !Array.isArray(a) && !Array.isArray(b)) {
    const one = a as AvatarValue
    const other = b as AvatarValue
    return one.src === other.src && one.file === other.file
  }
  return false
}

const pad = (n: number) => String(n).padStart(2, "0")

/** A value of a DHTMLX control as the form keeps it: a day, a time, a number or a string. */
const fromControl = (field: Field, raw: unknown): unknown => {
  switch (field.kind ?? "text") {
    case "number": {
      if (raw === "" || raw === undefined || raw === null) return undefined
      const n = Number(raw)
      return Number.isNaN(n) ? raw : n
    }
    case "slider":
      return Array.isArray(raw) ? raw[0] : Number(raw)
    case "checkbox":
    case "toggle":
      return raw === true
    case "checks":
    case "toggles":
      return chosen(field, raw)
    case "avatar":
      return avatarOf(raw)
    case "files":
      return filesOf(raw)
    case "date":
      return raw instanceof Date ? dateToDay(raw) : raw === "" || raw === undefined ? undefined : String(raw)
    case "time": {
      if (typeof raw !== "object" || raw === null) return raw === "" ? undefined : raw
      const { hour, minute, AM } = raw as { hour: number; minute: number; AM?: boolean }
      const hours = AM === undefined ? hour : (hour % 12) + (AM ? 0 : 12)
      return `${pad(hours)}:${pad(minute)}`
    }
    case "combo":
      return Array.isArray(raw) ? raw[0] : raw === "" ? undefined : raw
    default:
      return raw === "" ? undefined : raw
  }
}

/** A value as the form keeps it, for the DHTMLX control. */
const toControl = (field: Field, value: unknown): unknown => {
  if (isGroup(field)) {
    const on = new Set(Array.isArray(value) ? value.map(String) : [])
    return Object.fromEntries((field.options ?? []).map((option) => [option.value, on.has(option.value)]))
  }
  if (field.kind === "toggle") return value === true
  if (field.kind === "avatar") return avatarOf(value) ?? {}
  if (field.kind === "files") {
    return (Array.isArray(value) ? (value as ReadonlyArray<FormFile>) : []).map((file) => ({ id: file.id, name: file.name, size: file.size, status: "queue", progress: 0, ...(file.file === undefined ? {} : { file: file.file }) }))
  }
  if (value === undefined) return field.kind === "checkbox" ? false : ""
  if (field.kind === "date" && typeof value === "string") return dayToDate(value)
  return value
}

/** The Form item of a field, with the parts we use. */
type Item = {
  readonly setProperties: (props: Record<string, unknown>) => void
  readonly validate?: (silent?: boolean) => boolean
  readonly clearValidate?: () => void
  readonly clear?: () => void
  readonly getValue: () => unknown
}

export type FormOptions<S extends Schema.Top> = {
  readonly schema: S
  /** Changes to the fields that the Schema gives, or more fields. */
  readonly fields?: ReadonlyArray<Field>
  /** The values in the form, as the Schema reads them: a change in the form goes in, a new value goes out. */
  readonly values?: SubscriptionRef.SubscriptionRef<Values>
  /** The text of the button that sends. No button when it is empty. */
  readonly submitLabel?: string
}

/**
 * A DHTMLX Form made from an Effect Schema: a field for each property, with its error
 * under it. `checked` is the check of the values of now; `submitted` gives each typed value that the
 * user sends with the button and that the Schema finds right. Before the first send, a field shows
 * its error only after the user changed it.
 *
 * Days, times and the calendar follow the locale of `Browser`. The theme follows `Browser.dark`.
 */
export const form = <S extends Schema.Top>(options: FormOptions<S>) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const shape = fieldsOf(options.schema, options.fields)
    // The fields with a value. The rest of `shape` only places them.
    const fields = leaves(shape)
    const values = options.values ?? (yield* SubscriptionRef.make<Values>({}))
    const checked = yield* SubscriptionRef.make<Checked<S["Type"]>>(check(options.schema, yield* SubscriptionRef.get(values)))
    const submits = yield* Effect.acquireRelease(PubSub.unbounded<S["Type"]>(), PubSub.shutdown)
    const locale = calendarLocale(yield* SubscriptionRef.get(browser.locale))
    const rows: Array<unknown> = shape.map((field) => control(field, locale))
    if (options.submitLabel !== "") rows.push({ type: "button", name: "submit", id: "submit", text: options.submitLabel ?? "Save", size: "medium", view: "flat", color: "primary" })
    // The form, and under it a list of the errors that DHTMLX cannot show under their own field.
    const place = yield* child("dhxe-form-place")
    const list = yield* resource("element", () => {
      const element = document.createElement("ul")
      element.className = "dhxe-form-errors"
      element.hidden = true
      host.append(element)
      return element
    }, (element) => element.remove())
    const view = yield* resourceAfterPaint("form", () => new Form(place, { css: "dhxe-form", padding: 0, rows: rows as never }), (view) => view.destructor())
    const item = (name: string) => view.getItem(name) as Item | undefined

    // Which fields show their errors: the touched ones, or all after a send.
    const touched = new Set<string>()
    let sent = false
    const showErrors = (result: Checked<S["Type"]>) => {
      const others: Array<string> = []
      const whole = result._tag === "invalid" ? result.errors[""] : undefined
      if (whole !== undefined && sent) others.push(whole)
      for (const field of fields) {
        const one = item(field.name)
        if (one === undefined) continue
        const message = result._tag === "invalid" ? result.errors[field.name] : undefined
        const show = message !== undefined && (sent || touched.has(field.name))
        if (one.validate === undefined || !LINE_UNDER.has(field.kind ?? "text")) {
          // A control that shows no error line of its own (a slider, a time): the list under the form.
          if (show) others.push(`${field.label ?? field.name}: ${message}`)
        } else if (show) {
          // `required` too: DHTMLX runs no check on an empty field that is not required.
          one.setProperties({ errorMessage: message, validation: () => false, required: true })
          one.validate(false)
        } else {
          one.setProperties({ errorMessage: "", validation: undefined, required: false })
          one.clearValidate?.()
        }
      }
      list.replaceChildren(...others.map((text) => Object.assign(document.createElement("li"), { textContent: text })))
      list.hidden = others.length === 0
    }

    // From the form to `values`; a value that came from `values` is not sent back.
    let applying = false
    yield* resource(
      "listener",
      () =>
        view.events.on("change" as never, (name: string, raw: unknown) => {
          const field = fields.find((one) => one.name === name)
          if (applying || field === undefined) return
          touched.add(name)
          // A group and a toggle give the event the part that changed: the whole value is in the item.
          const whole = readsItem(field) ? item(name)?.getValue() : raw
          const next = { ...Effect.runSync(SubscriptionRef.get(values)), [name]: fromControl(field, whole) }
          if (next[name] === undefined) delete next[name]
          Effect.runSync(SubscriptionRef.set(values, next))
        }),
      () => view.events.detach("change" as never)
    )
    yield* resource(
      "listener",
      () =>
        view.events.on("click" as never, (name: string) => {
          if (name !== "submit") return
          sent = true
          const result = check(options.schema, Effect.runSync(SubscriptionRef.get(values)))
          showErrors(result)
          if (result._tag === "valid") Effect.runSync(PubSub.publish(submits, result.value))
        }),
      () => view.events.detach("click" as never)
    )
    yield* follow(values, (next) => {
      applying = true
      try {
        for (const field of fields) {
          const one = item(field.name)
          if (one === undefined) continue
          const shown = fromControl(field, one.getValue())
          const wanted = isGroup(field)
            ? chosen(field, toControl(field, next[field.name]))
            : field.kind === "toggle"
              ? next[field.name] === true
              : field.kind === "files"
                ? filesOf(toControl(field, next[field.name]))
                : field.kind === "avatar"
                  ? avatarOf(next[field.name])
                  : next[field.name]
          if (same(shown, wanted)) continue
          // A date takes no empty value: `clear` empties its input.
          if (field.kind === "date" && wanted === undefined && one.clear !== undefined) one.clear()
          else view.setValue({ [field.name]: toControl(field, next[field.name]) })
        }
      } finally {
        applying = false
      }
      const result = check(options.schema, next)
      Effect.runSync(SubscriptionRef.set(checked, result))
      showErrors(result)
    })
    let shown = locale
    yield* follow(browser.locale, (tag) => {
      const next = calendarNames(tag)
      // Only on a real change: a new timeFormat on the Timepicker of a form leaves a paint behind
      // that throws in DHTMLX when the form is gone by then.
      if (next.dateFormat === shown.dateFormat && next.weekStart === shown.weekStart && next.twelveHours === shown.twelveHours) return
      shown = next
      for (const field of fields) {
        if (field.kind === "date") item(field.name)?.setProperties({ dateFormat: next.dateFormat, weekStart: next.weekStart })
        if (field.kind === "time") item(field.name)?.setProperties({ timeFormat: next.twelveHours ? 12 : 24 })
      }
    })
    yield* follow(browser.dark, (dark) => setTheme(dark ? "dark" : "light", host))
    return { form: view, values, checked, submitted: Stream.fromPubSub(submits) }
  }) as Effect.Effect<{
    readonly form: Form
    readonly values: SubscriptionRef.SubscriptionRef<Values>
    readonly checked: SubscriptionRef.SubscriptionRef<Checked<S["Type"]>>
    readonly submitted: Stream.Stream<S["Type"]>
  }, never, Host | Browser | Scope.Scope>
