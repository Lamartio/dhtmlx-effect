import { it } from "@effect/vitest"
import { awaitRedraw } from "dhx-suite"
import { Effect, Fiber, Schema, Scope, Stream, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "dhx-suite/codebase/suite.min.css"
import "../styles.css"
import "../storybook.css"
import { Day, Time } from "../core/form"
import { Browser, browserWith, setFacts, type BrowserFacts } from "./browser"
import { fieldsOf, form } from "./form"
import { alive, Host } from "./host"
import { calendar, colorpicker, combobox, filePicker, slider, timepicker } from "./inputs"

const FACTS: BrowserFacts = {
  dark: false,
  locale: "en-GB",
  timeZone: "Europe/Amsterdam",
  viewport: { width: 1200, height: 800 },
  now: new Date("2026-11-08T10:00:00Z")
}

const Issue = Schema.Struct({
  title: Schema.String.check(Schema.isMinLength(3, { message: "At least 3 letters" })),
  status: Schema.Literals(["todo", "doing", "done"]),
  points: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 13 })),
  due: Day,
  at: Time,
  urgent: Schema.Boolean
})

const freshHost = () => {
  const element = document.createElement("div")
  element.style.width = "800px"
  element.style.height = "900px"
  document.body.append(element)
  return element
}

const settle = Effect.gen(function* () {
  yield* Effect.yieldNow
  yield* Effect.promise(() => awaitRedraw())
  yield* Effect.yieldNow
})

const run = <A, E>(body: Effect.Effect<A, E, Host | Browser | Scope.Scope>, facts: BrowserFacts = FACTS) =>
  Effect.gen(function* () {
    const host = freshHost()
    const browser = yield* browserWith(facts)
    yield* Effect.scoped(body.pipe(Effect.provideService(Host, host), Effect.provideService(Browser, browser)))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    expect(host.innerHTML).toBe("")
  })

/** Types in an input as a user does, so DHTMLX sends its change event. */
const type = (input: HTMLInputElement, text: string) => {
  input.focus()
  input.value = text
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))
  input.blur()
}

it("makes a field for each property of the Schema, with a kind from its type", () => {
  const fields = fieldsOf(Issue, [{ name: "due", kind: "date" }, { name: "at", kind: "time", label: "Time" }])
  expect(fields.map((field) => [field.name, field.kind])).toEqual([
    ["title", "text"], ["status", "select"], ["points", "number"], ["due", "date"], ["at", "time"], ["urgent", "checkbox"]
  ])
  expect(fields[1]?.options?.map((option) => option.value)).toEqual(["todo", "doing", "done"])
  expect(fields[4]?.label).toBe("Time")
})

it.live("shows the errors of the Schema next to the fields on a send, and gives a typed value when all are right", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const values = yield* SubscriptionRef.make<Readonly<Record<string, unknown>>>({ title: "Fo", status: "todo", points: 40, due: "2026-11-20", at: "09:30", urgent: false })
    const made = yield* form({ schema: Issue, values, fields: [{ name: "due", kind: "date" }, { name: "at", kind: "time" }], submitLabel: "Send" })
    const sent = yield* made.submitted.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* settle
    // Before a send, an untouched field shows no error.
    expect(host.textContent).not.toContain("At least 3 letters")
    const send = [...host.querySelectorAll<HTMLButtonElement>("button")].find((one) => one.textContent?.includes("Send"))!
    send.click()
    yield* settle
    expect(host.textContent).toContain("At least 3 letters")
    expect((yield* SubscriptionRef.get(made.checked))._tag).toBe("invalid")
    // The user fixes the title in the form: it goes into `values`.
    type(host.querySelector<HTMLInputElement>('input[name="title"], #title input, [data-dhx-id="title"] input') ?? host.querySelector<HTMLInputElement>("input")!, "Forms")
    yield* settle
    expect((yield* SubscriptionRef.get(values))["title"]).toBe("Forms")
    expect(host.textContent).not.toContain("At least 3 letters")
    // The code fixes the points: it shows in the form.
    yield* SubscriptionRef.update(values, (all) => ({ ...all, points: 5 }))
    yield* settle
    send.click()
    yield* settle
    const [value] = yield* Fiber.join(sent)
    expect(value).toEqual({ title: "Forms", status: "todo", points: 5, due: "2026-11-20", at: "09:30", urgent: false })
  })))

it.live("shows a day in the date format of the locale, and changes it in place with the locale", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const browser = yield* browserWith({ ...FACTS, locale: "nl-NL" })
    yield* Effect.scoped(Effect.gen(function* () {
      const values = yield* SubscriptionRef.make<Readonly<Record<string, unknown>>>({ due: "2026-11-20" })
      yield* form({ schema: Schema.Struct({ due: Day }), values, fields: [{ name: "due", kind: "date" }], submitLabel: "" })
      yield* settle
      const input = () => host.querySelector<HTMLInputElement>("input")!
      expect(input().value).toBe("20-11-2026")
      yield* setFacts(browser, { locale: "en-US" })
      yield* settle
      expect(input().value).toBe("11/20/2026")
      expect((yield* SubscriptionRef.get(values))["due"]).toBe("2026-11-20")
    }).pipe(Effect.provideService(Host, host), Effect.provideService(Browser, browser)))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
  }))

it.live("keeps the day of a Calendar both ways, with the names of the locale", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const value = yield* SubscriptionRef.make<string | undefined>("2026-11-20")
    const { calendar: view } = yield* calendar({ value })
    yield* settle
    expect(host.textContent).toContain("November")
    yield* SubscriptionRef.set(value, "2026-12-03")
    yield* settle
    expect(host.textContent).toContain("December")
    view.setValue(new Date(2026, 11, 24, 12))
    yield* settle
    expect(yield* SubscriptionRef.get(value)).toBe("2026-12-24")
  }), { ...FACTS, locale: "en-US" }))

it.live("opens a Calendar with no day on the month of today in the time zone of the browser", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    yield* calendar()
    yield* settle
    // 31 Dec 23:30 UTC is already 1 Jan in Amsterdam.
    expect(host.textContent).toContain("January")
  }), { ...FACTS, now: new Date("2026-12-31T23:30:00Z") }))

it.live("keeps the values of a Timepicker, a Slider, a Colorpicker and a Combobox both ways", () =>
  run(Effect.gen(function* () {
    const time = yield* SubscriptionRef.make("14:45")
    const points = yield* SubscriptionRef.make(3)
    const color = yield* SubscriptionRef.make("#ff0000")
    const status = yield* SubscriptionRef.make<string | undefined>("todo")
    const t = yield* timepicker({ value: time })
    const s = yield* slider({ value: points, min: 0, max: 13 })
    const c = yield* colorpicker({ value: color })
    const o = yield* combobox({ value: status, options: [{ value: "todo", label: "To do" }, { value: "done", label: "Done" }] })
    yield* settle
    expect(t.timepicker.getValue()).toBe("14:45")
    expect(s.slider.getValue()).toEqual([3])
    expect(String(c.colorpicker.getValue()).toLowerCase()).toBe("#ff0000")
    expect(o.combobox.getValue()).toBe("todo")
    yield* SubscriptionRef.set(points, 8)
    yield* SubscriptionRef.set(status, "done")
    yield* settle
    expect(s.slider.getValue()).toEqual([8])
    expect(o.combobox.getValue()).toBe("done")
    t.timepicker.setValue("08:15")
    s.slider.setValue(5)
    c.colorpicker.setValue("#00ff00")
    yield* settle
    expect(yield* SubscriptionRef.get(time)).toBe("08:15")
    expect(yield* SubscriptionRef.get(points)).toBe(5)
    expect(yield* SubscriptionRef.get(color)).toBe("#00ff00")
  }), { ...FACTS, locale: "en-GB" }))

it.live("gives each file that is picked, and keeps none", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const { files, uploader } = yield* filePicker({ label: "Add files" })
    const got = yield* files.pipe(Stream.take(2), Stream.runCollect, Effect.forkScoped)
    yield* settle
    expect(host.textContent).toContain("Add files")
    const drop = new DataTransfer()
    drop.items.add(new File(["# Hello"], "hello.md", { type: "text/markdown" }))
    drop.items.add(new File(["a,b"], "data.csv", { type: "text/csv" }))
    // What the file dialog of "Add files" does: it fills the hidden input of the Uploader. (A drop of a
    // DataTransfer made in a test has no entries, so DHTMLX reads no files from it.)
    const input = (uploader as unknown as { readonly _fileInput: HTMLInputElement })._fileInput
    input.files = drop.files
    input.dispatchEvent(new Event("change"))
    const picked = yield* Fiber.join(got)
    expect(picked.map((file) => file.name)).toEqual(["hello.md", "data.csv"])
    yield* settle
    expect(uploader.data.getLength()).toBe(0)
  })))

it.live("shows an error under an empty date, time or slider field too, after a send", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const made = yield* form({
      schema: Schema.Struct({ due: Day, at: Time, points: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 13 }, { message: "From 0 to 13" })) }),
      values: yield* SubscriptionRef.make<Readonly<Record<string, unknown>>>({ points: 40 }),
      fields: [{ name: "due", kind: "date" }, { name: "at", kind: "time" }, { name: "points", kind: "slider", min: 0, max: 100 }]
    })
    yield* settle
    ;[...host.querySelectorAll<HTMLButtonElement>("button")].find((one) => one.textContent?.includes("Save"))!.click()
    yield* settle
    const result = yield* SubscriptionRef.get(made.checked)
    expect(result._tag === "invalid" ? Object.keys(result.errors).sort() : []).toEqual(["at", "due", "points"])
    expect(host.querySelectorAll(".dhx_form-group--state_error").length).toBe(1)
    // The time and the slider have no error line: their messages are in the list under the form.
    expect([...host.querySelectorAll(".dhxe-form-errors li")].map((one) => one.textContent)).toEqual(["At: Missing key", "Points: From 0 to 13"])
    expect(host.textContent).toContain("From 0 to 13")
  })))

const SIZES = [{ value: "s", label: "Small" }, { value: "m", label: "Medium" }, { value: "l", label: "Large" }]
const TAGS = [{ value: "bug", label: "Bug" }, { value: "idea", label: "Idea" }, { value: "docs", label: "Docs" }]
const DAYS = [{ value: "mon", label: "Mon" }, { value: "tue", label: "Tue" }, { value: "wed", label: "Wed" }]

const Choices = Schema.Struct({
  size: Schema.Literals(["s", "m", "l"]),
  tags: Schema.Array(Schema.String),
  urgent: Schema.Boolean,
  days: Schema.Array(Schema.String),
  ref: Schema.String
})

const CHOICE_FIELDS = [
  { name: "size", kind: "radio", options: SIZES },
  { name: "tags", kind: "checks", options: TAGS },
  { name: "urgent", kind: "toggle", label: "Urgent" },
  { name: "days", kind: "toggles", options: DAYS },
  { name: "ref", kind: "note", label: "Reference" }
] as const

it.live("shows a radio group, checks, a toggle, toggles and a note from the values, and follows a new value", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const values = yield* SubscriptionRef.make<Readonly<Record<string, unknown>>>({ size: "m", tags: ["bug", "docs"], urgent: true, days: ["tue"], ref: "X-17" })
    const made = yield* form({ schema: Choices, values, fields: CHOICE_FIELDS, submitLabel: "" })
    yield* settle
    const value = (name: string) => (made.form.getItem(name) as unknown as { getValue: () => unknown }).getValue()
    expect(value("size")).toBe("m")
    expect(value("tags")).toEqual({ bug: true, idea: false, docs: true })
    expect(value("urgent")).toBe(true)
    expect(value("days")).toMatchObject({ tue: true })
    expect(value("ref")).toBe("X-17")
    expect(host.textContent).toContain("Medium")
    expect(host.textContent).toContain("Idea")
    expect(host.textContent).toContain("Urgent")
    expect(host.textContent).toContain("Wed")
    expect((yield* SubscriptionRef.get(made.checked))._tag).toBe("valid")

    yield* SubscriptionRef.set(values, { size: "l", tags: ["idea"], urgent: false, days: ["mon", "wed"], ref: "X-18" })
    yield* settle
    expect(value("size")).toBe("l")
    expect(value("tags")).toEqual({ bug: false, idea: true, docs: false })
    expect(value("urgent")).toBe(false)
    expect(value("days")).toMatchObject({ mon: true, wed: true })
    expect(value("ref")).toBe("X-18")
    // Nothing went back into the store: the values are the ones that the code set.
    expect(yield* SubscriptionRef.get(values)).toEqual({ size: "l", tags: ["idea"], urgent: false, days: ["mon", "wed"], ref: "X-18" })
  })))

it.live("writes a click on a radio button, a check, a toggle and a toggle of a group into the values", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const values = yield* SubscriptionRef.make<Readonly<Record<string, unknown>>>({ size: "m", tags: ["bug"], urgent: false, days: [], ref: "X-17" })
    yield* form({ schema: Choices, values, fields: CHOICE_FIELDS, submitLabel: "" })
    yield* settle
    const now = (name: string) => Effect.map(SubscriptionRef.get(values), (all) => all[name])
    const withText = (selector: string, text: string) => [...host.querySelectorAll<HTMLElement>(selector)].find((one) => one.textContent?.trim() === text)!

    host.querySelectorAll<HTMLInputElement>('input[type="radio"]')[0]!.click()
    yield* settle
    expect(yield* now("size")).toBe("s")

    host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]!.click()
    yield* settle
    expect(yield* now("tags")).toEqual(["bug", "idea"])

    withText("button", "Urgent").click()
    yield* settle
    expect(yield* now("urgent")).toBe(true)

    withText("button", "Tue").click()
    yield* settle
    withText("button", "Mon").click()
    yield* settle
    // In the order of the options, not of the clicks.
    expect(yield* now("days")).toEqual(["mon", "tue"])
  })))
