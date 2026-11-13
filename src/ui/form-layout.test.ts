import { it } from "@effect/vitest"
import { awaitRedraw } from "dhx-suite"
import { Effect, Schema, Scope, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "dhx-suite/codebase/suite.min.css"
import "../styles.css"
import { element } from "../storybook/story"
import { Browser, browserWith, type BrowserFacts } from "./browser"
import { type AvatarValue, type Field, fieldsOf, form, type FormFile } from "./form"
import { alive, Host } from "./host"

const FACTS: BrowserFacts = {
  dark: false,
  locale: "en-GB",
  timeZone: "Europe/Amsterdam",
  viewport: { width: 1200, height: 800 },
  now: new Date("2026-11-08T10:00:00Z")
}

const freshHost = () => {
  const node = document.createElement("div")
  node.style.width = "800px"
  node.style.height = "900px"
  document.body.append(node)
  return node
}

const settle = Effect.gen(function* () {
  yield* Effect.yieldNow
  yield* Effect.promise(() => awaitRedraw())
  yield* Effect.yieldNow
  yield* Effect.promise(() => awaitRedraw())
  yield* Effect.yieldNow
})

const run = <A, E>(body: Effect.Effect<A, E, Host | Browser | Scope.Scope>) =>
  Effect.gen(function* () {
    const host = freshHost()
    const browser = yield* browserWith(FACTS)
    yield* Effect.scoped(body.pipe(Effect.provideService(Host, host), Effect.provideService(Browser, browser)))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    expect(host.innerHTML).toBe("")
  })

const Person = Schema.Struct({ first: Schema.String, last: Schema.String, city: Schema.String, member: Schema.Boolean })

const LAYOUT: ReadonlyArray<Field> = [
  { name: "who", kind: "fieldset", label: "Who", direction: "cols", fields: [{ name: "first" }, { name: "last", label: "Family name" }] },
  { name: "gap", kind: "spacer", height: 24 },
  { name: "extra", kind: "container", label: "More", height: 60, part: element("p", "inside", "A part inside the form") }
]

/** Types in an input as a user does, so DHTMLX sends its change event. */
const type = (input: HTMLInputElement, text: string) => {
  input.focus()
  input.value = text
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))
  input.blur()
}

it("takes the fields of a fieldset out of the top of the form, with their kind and label from the Schema", () => {
  const shape = fieldsOf(Person, LAYOUT)
  expect(shape.map((field) => [field.name, field.kind])).toEqual([["city", "text"], ["member", "checkbox"], ["who", "fieldset"], ["gap", "spacer"], ["extra", "container"]])
  expect(shape[2]?.fields?.map((field) => [field.name, field.kind, field.label])).toEqual([["first", "text", "First"], ["last", "text", "Family name"]])
})

it.live("draws a fieldset, a spacer and a container with a part, and keeps the values of the fields in a fieldset", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const values = yield* SubscriptionRef.make<Readonly<Record<string, unknown>>>({ first: "Anna", last: "Vos", city: "Rome", member: true })
    const made = yield* form({ schema: Person, values, fields: LAYOUT, submitLabel: "" })
    yield* settle
    expect(host.textContent).toContain("Who")
    expect(host.textContent).toContain("Family name")
    expect(host.textContent).toContain("More")
    // The part of the container is in the form.
    expect(host.querySelector("p.inside")?.textContent).toBe("A part inside the form")
    const value = (name: string) => (made.form.getItem(name) as unknown as { getValue: () => unknown }).getValue()
    expect(value("first")).toBe("Anna")
    expect(value("last")).toBe("Vos")
    expect(value("city")).toBe("Rome")

    // From the code to a field in the fieldset.
    yield* SubscriptionRef.update(values, (all) => ({ ...all, last: "de Vos" }))
    yield* settle
    expect(value("last")).toBe("de Vos")

    // From a field in the fieldset to the values: the first input of the form is `city`, then `first`.
    const inputs = [...host.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])')]
    const first = inputs.find((input) => input.value === "Anna")!
    type(first, "Anne")
    yield* settle
    expect((yield* SubscriptionRef.get(values))["first"]).toBe("Anne")
    expect((yield* SubscriptionRef.get(made.checked))._tag).toBe("valid")
  })))

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

const Profile = Schema.Struct({ name: Schema.String, photo: Schema.optional(Schema.Unknown), papers: Schema.Array(Schema.Unknown) })

const FILE_FIELDS: ReadonlyArray<Field> = [{ name: "photo", kind: "avatar" }, { name: "papers", kind: "files" }]

it.live("shows a picture and a list of files from the values", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const papers: ReadonlyArray<FormFile> = [{ id: "p1", name: "plan.txt", size: 12 }]
    const values = yield* SubscriptionRef.make<Readonly<Record<string, unknown>>>({ name: "Anna", photo: { src: PIXEL } satisfies AvatarValue, papers })
    const made = yield* form({ schema: Profile, values, fields: FILE_FIELDS, submitLabel: "" })
    yield* settle
    const value = (name: string) => (made.form.getItem(name) as unknown as { getValue: () => unknown }).getValue()
    expect((value("photo") as AvatarValue).src).toBe(PIXEL)
    expect((value("papers") as ReadonlyArray<{ name?: string }>).map((one) => one.name)).toEqual(["plan.txt"])
    expect(host.textContent).toContain("plan.txt")
    // The form only showed the values: nothing went back.
    expect((yield* SubscriptionRef.get(values))["papers"]).toBe(papers)

    yield* SubscriptionRef.update(values, (all) => ({ ...all, papers: [...papers, { id: "p2", name: "map.txt", size: 3 }] }))
    yield* settle
    expect((value("papers") as ReadonlyArray<{ name?: string }>).map((one) => one.name)).toEqual(["plan.txt", "map.txt"])
  })))

it.live("writes a picked picture and a picked file into the values", () =>
  run(Effect.gen(function* () {
    const values = yield* SubscriptionRef.make<Readonly<Record<string, unknown>>>({ name: "Anna", papers: [] })
    const made = yield* form({ schema: Profile, values, fields: FILE_FIELDS, submitLabel: "" })
    yield* settle
    const item = (name: string) => made.form.getItem(name) as unknown as { setValue: (value: unknown) => void }
    const file = new File(["hello"], "notes.txt", { type: "text/plain" })
    // What a pick does: the control gets the file.
    item("papers").setValue([{ id: "f1", file, name: "notes.txt", size: file.size, status: "queue", progress: 0 }])
    yield* settle
    const stored = (yield* SubscriptionRef.get(values))["papers"] as ReadonlyArray<FormFile>
    expect(stored.map((one) => [one.id, one.name, one.size])).toEqual([["f1", "notes.txt", 5]])
    expect(stored[0]?.file).toBe(file)

    const picture = new File(["x"], "me.png", { type: "image/png" })
    item("photo").setValue({ file: picture, src: PIXEL })
    yield* settle
    const photo = (yield* SubscriptionRef.get(values))["photo"] as AvatarValue
    expect(photo.src).toBe(PIXEL)
    expect(photo.file).toBe(picture)
  })))
