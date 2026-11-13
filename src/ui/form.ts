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
 */
export type FieldKind =
  | "text" | "textarea" | "number" | "checkbox" | "select" | "combo" | "date" | "time" | "slider" | "color"
  | "radio" | "checks" | "toggle" | "toggles" | "note"

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
}

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
  const out = signatures.map((signature) => {
    const name = String(signature.name)
    return { name, label: name[0]!.toUpperCase() + name.slice(1), ...kindOf(signature.type), ...given.get(name) }
  })
  for (const field of fields) if (!out.some((one) => one.name === field.name)) out.push({ kind: "text", label: field.name, ...field })
  return out
}

type Values = Readonly<Record<string, unknown>>

/** The kinds whose DHTMLX control shows an error line under it. Checked in a test; the rest get the message in the label. */
const LINE_UNDER: ReadonlySet<FieldKind> = new Set(["text", "number", "textarea", "date"])

/** The DHTMLX control for a field, for the locale of now. */
const control = (field: Field, locale: ReturnType<typeof calendarLocale>) => {
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

/** Two values of a field are the same: by value for the arrays of a group. */
const same = (a: unknown, b: unknown) =>
  a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((one, index) => one === b[index]))

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
  if (value === undefined) return field.kind === "checkbox" ? false : ""
  if (field.kind === "date" && typeof value === "string") return dayToDate(value)
  return value
}

/** The Form item of a field, with the parts we use. */
type Item = {
  readonly setProperties: (props: Record<string, unknown>) => void
  readonly validate?: (silent?: boolean) => boolean
  readonly clearValidate?: () => void
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
    const fields = fieldsOf(options.schema, options.fields)
    const values = options.values ?? (yield* SubscriptionRef.make<Values>({}))
    const checked = yield* SubscriptionRef.make<Checked<S["Type"]>>(check(options.schema, yield* SubscriptionRef.get(values)))
    const submits = yield* Effect.acquireRelease(PubSub.unbounded<S["Type"]>(), PubSub.shutdown)
    const locale = calendarLocale(yield* SubscriptionRef.get(browser.locale))
    const rows: Array<unknown> = fields.map((field) => control(field, locale))
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
          const whole = isGroup(field) || field.kind === "toggle" ? item(name)?.getValue() : raw
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
          const wanted = isGroup(field) ? chosen(field, toControl(field, next[field.name])) : field.kind === "toggle" ? next[field.name] === true : next[field.name]
          if (!same(shown, wanted)) view.setValue({ [field.name]: toControl(field, next[field.name]) })
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
