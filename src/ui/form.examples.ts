import type { StoryObj } from "@storybook/html-vite"
import { Effect, Schema, Stream, SubscriptionRef } from "effect"
import { Color, Day, Time } from "../core/form"
import { form } from "./form"
import { Host, type Widget } from "./host"
import { calendar, colorpicker, combobox, filePicker, slider, timepicker } from "./inputs"
import { layout } from "./layout"
import { element, inside, widgetStory } from "../storybook/story"

/**
 * The forms: a Form made from an Effect Schema, and its inputs alone. Change
 * Locale and Zone in the toolbar: the date format, the calendar and the clock follow.
 */
type Story = StoryObj

const Issue = Schema.Struct({
  title: Schema.String.check(Schema.isMinLength(3, { message: "Give at least 3 letters" })),
  status: Schema.Literals(["backlog", "todo", "doing", "done"]),
  points: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 13 }, { message: "From 0 to 13 points" })),
  due: Day,
  at: Time,
  color: Color,
  urgent: Schema.Boolean
})

/** A line of JSON for the log of a story. */
const show = (value: unknown) => JSON.stringify(value, null, 2)

export const FromSchema: Story = {
  name: "Form from a Schema",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const values = yield* SubscriptionRef.make<Readonly<Record<string, unknown>>>({ title: "Fo", status: "todo", points: 40, urgent: false, color: "#2e7dd1" })
      yield* layout({
        direction: "cols",
        cells: [
          {
            id: "form",
            header: "Issue",
            part: Effect.gen(function* () {
              const host = yield* Host
              host.classList.add("dhxe-pane")
              const made = yield* form({
                schema: Issue,
                values,
                submitLabel: "Save",
                fields: [
                  { name: "status", kind: "combo", options: ["backlog", "todo", "doing", "done"].map((value) => ({ value, label: value })) },
                  { name: "points", kind: "slider", min: 0, max: 13 },
                  { name: "due", kind: "date", label: "Due day" },
                  { name: "at", kind: "time", label: "Time" },
                  { name: "color", kind: "color" }
                ]
              })
              return made
            })
          },
          {
            id: "out",
            header: "Values and result",
            width: "40%",
            part: Effect.gen(function* () {
              const host = yield* Host
              host.classList.add("dhxe-pane")
              yield* element("p", "dhxe-note", "Save shows the errors of the Schema. A field you change shows its own error at once.")
              const now = yield* element("pre", "dhxe-log")
              const sent = yield* element("pre", "dhxe-log")
              yield* SubscriptionRef.changes(values).pipe(Stream.runForEach((value) => Effect.sync(() => (now.textContent = `values:\n${show(value)}`))), Effect.forkScoped)
              return sent
            })
          }
        ]
      }).pipe(
        Effect.tap(([made, sent]) =>
          made.submitted.pipe(Stream.runForEach((value) => Effect.sync(() => (sent.textContent = `saved, typed:\n${show(value)}`))), Effect.forkScoped))
      )
    }))
}

const Order = Schema.Struct({
  size: Schema.Literals(["s", "m", "l"]),
  extras: Schema.Array(Schema.String),
  gift: Schema.Boolean,
  days: Schema.Array(Schema.String).check(Schema.isMinLength(1, { message: "Choose at least one day" })),
  ref: Schema.String
})

export const Choices: Story = {
  name: "Radio, checks, toggles and a note",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const host = yield* Host
      host.classList.add("dhxe-pane")
      const values = yield* SubscriptionRef.make<Readonly<Record<string, unknown>>>({ size: "m", extras: ["wrap"], gift: false, days: [], ref: "Order 1042" })
      const made = yield* form({
        schema: Order,
        values,
        submitLabel: "Save",
        fields: [
          { name: "ref", kind: "note", label: "Reference" },
          { name: "size", kind: "radio", options: [{ value: "s", label: "Small" }, { value: "m", label: "Medium" }, { value: "l", label: "Large" }] },
          { name: "extras", kind: "checks", options: [{ value: "wrap", label: "Wrapping" }, { value: "card", label: "A card" }, { value: "fast", label: "Fast delivery" }] },
          { name: "gift", kind: "toggle", label: "A gift" },
          { name: "days", kind: "toggles", label: "Days", options: ["mon", "tue", "wed", "thu", "fri"].map((value) => ({ value, label: value })) }
        ]
      })
      yield* element("p", "dhxe-note", "A group gives the values of its chosen options, in the order of the options. Save with no day shows the error of the Schema under the form.")
      const now = yield* element("pre", "dhxe-log")
      const sent = yield* element("pre", "dhxe-log")
      yield* SubscriptionRef.changes(values).pipe(Stream.runForEach((value) => Effect.sync(() => (now.textContent = `values:\n${show(value)}`))), Effect.forkScoped)
      yield* made.submitted.pipe(Stream.runForEach((value) => Effect.sync(() => (sent.textContent = `saved, typed:\n${show(value)}`))), Effect.forkScoped)
    }))
}

/** One input alone, with its value under it. The value is in a store: the input and the line follow it. */
const alone = <A>(first: A, part: (value: SubscriptionRef.SubscriptionRef<A>) => Widget, show: (value: A) => string): Story => ({
  render: () =>
    widgetStory(Effect.gen(function* () {
      const host = yield* Host
      host.classList.add("dhxe-pane")
      const value = yield* SubscriptionRef.make(first)
      const box = yield* element("div", "dhxe-input-box")
      yield* inside(box, part(value))
      const out = yield* element("pre", "dhxe-log")
      yield* SubscriptionRef.changes(value).pipe(Stream.runForEach((now) => Effect.sync(() => (out.textContent = `value: ${show(now)}`))), Effect.forkScoped)
    }))
})

export const CalendarAlone = alone<string | undefined>(undefined, (value) => calendar({ value }), (day) => day ?? "none")

export const TimepickerAlone = alone("09:30", (value) => timepicker({ value }), (time) => time)

export const ColorpickerAlone = alone("#2e7dd1", (value) => colorpicker({ value }), (color) => color)

export const SliderAlone = alone(5, (value) => slider({ value, min: 0, max: 13, label: "Points" }), (points) => String(points))

export const ComboboxAlone = alone<string | undefined>(
  "todo",
  (value) => combobox({ value, label: "Status", options: ["backlog", "todo", "doing", "done"].map((one) => ({ value: one, label: one })) }),
  (status) => status ?? "none"
)

export const FilePicker: Story = {
  name: "File picker",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const zone = yield* element("div", "dhxe-drop-zone")
      yield* inside(zone, element("p", "dhxe-note", "Drop files here, or choose them. Nothing is sent: each file only shows below."))
      const { files } = yield* inside(zone, filePicker({ label: "Choose files" }))
      const out = yield* element("pre", "dhxe-log")
      yield* files.pipe(
        Stream.runForEach((file) => Effect.sync(() => (out.textContent = `${file.name} · ${file.type || "no type"} · ${file.size} bytes\n${out.textContent ?? ""}`))),
        Effect.forkScoped
      )
    }))
}
