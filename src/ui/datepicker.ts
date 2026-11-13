import type { Form } from "dhx-suite"
import { Effect, Schema, Scope, SubscriptionRef } from "effect"
import { Day } from "../core/form"
import type { Browser } from "./browser"
import { form } from "./form"
import type { Host } from "./host"
import { forEachReported } from "./problems"

const OneDay = Schema.Struct({ day: Schema.optional(Day) })

/**
 * A DHTMLX DatePicker alone: a text input that opens a Calendar in a popup. In DHTMLX the DatePicker
 * is a control of the Form, so this part is a Form with that one control. The day is `YYYY-MM-DD`,
 * or undefined for none. The format of the day in the input, the names of the months and the first
 * day of the week follow the locale of `Browser`, and the theme follows `Browser.dark`.
 */
export const datepicker = (options: {
  readonly value?: SubscriptionRef.SubscriptionRef<string | undefined>
  readonly label?: string
  readonly placeholder?: string
} = {}) =>
  Effect.gen(function* () {
    const value = options.value ?? (yield* SubscriptionRef.make<string | undefined>(undefined))
    const start = yield* SubscriptionRef.get(value)
    const values = yield* SubscriptionRef.make<Readonly<Record<string, unknown>>>(start === undefined ? {} : { day: start })
    const made = yield* form({
      schema: OneDay,
      values,
      submitLabel: "",
      fields: [{ name: "day", kind: "date", label: options.label ?? "", ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }) }]
    })
    // Both ways, and only a real change goes on: a set of the same day would go round for ever.
    yield* forEachReported("The DatePicker, while it followed its value", SubscriptionRef.changes(value), (day) =>
      Effect.gen(function* () {
        if ((yield* SubscriptionRef.get(values))["day"] !== day) yield* SubscriptionRef.set(values, day === undefined ? {} : { day })
      }))
    yield* forEachReported("The DatePicker, while it followed its input", SubscriptionRef.changes(values), (all) =>
      Effect.gen(function* () {
        const day = typeof all["day"] === "string" ? all["day"] : undefined
        if ((yield* SubscriptionRef.get(value)) !== day) yield* SubscriptionRef.set(value, day)
      }))
    return { form: made.form, value }
  }) as Effect.Effect<{ readonly form: Form; readonly value: SubscriptionRef.SubscriptionRef<string | undefined> }, never, Host | Browser | Scope.Scope>
