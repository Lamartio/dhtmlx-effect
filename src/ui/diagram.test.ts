import { it } from "@effect/vitest"
import { awaitRedraw } from "@dhtmlx/diagram"
import { Effect, Fiber, Scope, Stream, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "@dhtmlx/diagram/codebase/diagram.min.css"
import "../styles.css"
import { Browser, browserWith, setFacts, type BrowserFacts } from "./browser"
import { diagram, type DiagramData, type DiagramItem, diagramEditor } from "./diagram"
import { alive, Host } from "./host"

const FACTS: BrowserFacts = {
  dark: false,
  locale: "en-GB",
  timeZone: "Europe/Amsterdam",
  viewport: { width: 1200, height: 800 },
  now: new Date("2026-11-08T10:00:00Z")
}

const FLOW: ReadonlyArray<DiagramItem> = [
  { id: "start", type: "start", x: 100, y: 0, text: "Start" },
  { id: "work", type: "process", x: 100, y: 120, text: "Work" },
  { id: "end", type: "end", x: 100, y: 240, text: "Done" },
  { id: "l1", type: "line", from: "start", to: "work" },
  { id: "l2", type: "line", from: "work", to: "end" }
]

const freshHost = () => {
  const element = document.createElement("div")
  element.style.width = "900px"
  element.style.height = "600px"
  document.body.append(element)
  return element
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

it.live("draws a flowchart from the store, and puts a change, a new item and a removed item in by id", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const data = yield* SubscriptionRef.make<DiagramData>(FLOW)
    const made = yield* diagram({ data })
    yield* settle
    expect(host.textContent).toContain("Start")
    expect(host.textContent).toContain("Work")
    expect(made.diagram.data.getLength()).toBe(5)

    yield* SubscriptionRef.update(data, (all) => (all as ReadonlyArray<DiagramItem>).map((one) => (one.id === "work" ? { ...one, text: "Work hard" } : one)))
    yield* settle
    expect(host.textContent).toContain("Work hard")
    expect(made.diagram.data.getLength()).toBe(5)

    yield* SubscriptionRef.update(data, (all) => [...(all as ReadonlyArray<DiagramItem>), { id: "note", type: "process", x: 320, y: 120, text: "Check" }])
    yield* settle
    expect(host.textContent).toContain("Check")
    expect(made.diagram.data.getLength()).toBe(6)

    yield* SubscriptionRef.update(data, (all) => (all as ReadonlyArray<DiagramItem>).filter((one) => one.id !== "note"))
    yield* settle
    expect(host.textContent).not.toContain("Check")
    expect(made.diagram.data.getLength()).toBe(5)
    expect((yield* SubscriptionRef.get(alive)).get("diagram")).toBe(1)
  })))

it.live("gives a click on a shape as a stream, and keeps the selected item both ways", () =>
  run(Effect.gen(function* () {
    const data = yield* SubscriptionRef.make<DiagramData>(FLOW)
    const selected = yield* SubscriptionRef.make<string | undefined>(undefined)
    const made = yield* diagram({ data, selected })
    yield* settle
    const clicked = yield* made.clicks.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* Effect.yieldNow
    made.diagram.events.fire("shapeClick" as never, ["work", new MouseEvent("click")] as never)
    expect(yield* Fiber.join(clicked)).toEqual(["work"])

    // From the code to the diagram.
    yield* SubscriptionRef.set(selected, "end")
    yield* settle
    expect(made.diagram.selection.getIds().map(String)).toEqual(["end"])
    // From the diagram to the code.
    made.diagram.selection.add({ id: "start" })
    yield* settle
    expect(yield* SubscriptionRef.get(selected)).toBe("start")
    yield* SubscriptionRef.set(selected, undefined)
    yield* settle
    expect(made.diagram.selection.getIds()).toEqual([])
  })))

it.live("draws an org chart and a mind map from items with a parent", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const tree: ReadonlyArray<DiagramItem> = [
      { id: "root", text: "Anna" },
      { id: "a", text: "Ben", parent: "root" },
      { id: "b", text: "Cara", parent: "root" }
    ]
    const org = yield* SubscriptionRef.make<DiagramData>(tree)
    const map = yield* SubscriptionRef.make<DiagramData>(tree)
    const first = document.createElement("div")
    const second = document.createElement("div")
    first.style.height = second.style.height = "280px"
    host.append(first, second)
    yield* Effect.addFinalizer(() => Effect.sync(() => {
      first.remove()
      second.remove()
    }))
    const chart = yield* Effect.provideService(diagram({ type: "org", data: org }), Host, first)
    yield* Effect.provideService(diagram({ type: "mindmap", data: map }), Host, second)
    yield* settle
    expect(first.textContent).toContain("Anna")
    expect(first.textContent).toContain("Cara")
    expect(second.textContent).toContain("Ben")

    yield* SubscriptionRef.update(org, (all) => [...(all as ReadonlyArray<DiagramItem>), { id: "c", text: "Daan", parent: "a" }])
    yield* settle
    expect(first.textContent).toContain("Daan")
    expect(chart.diagram.data.getLength()).toBe(4)
  })))

it.live("draws a PERT chart from tasks and links, and all again from new tasks", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const data = yield* SubscriptionRef.make<DiagramData>({
      data: [
        { id: "design", type: "task", text: "Design", start_date: "2026-11-09", duration: 5 },
        { id: "build", type: "task", text: "Build", start_date: "2026-11-16", duration: 8 }
      ],
      links: [{ id: "a", source: "design", target: "build", type: "0" }]
    })
    yield* diagram({ type: "pert", data })
    yield* settle
    expect(host.textContent).toContain("Design")
    expect(host.textContent).toContain("Build")

    yield* SubscriptionRef.set(data, {
      data: [
        { id: "design", type: "task", text: "Design", start_date: "2026-11-09", duration: 5 },
        { id: "texts", type: "task", text: "Texts", start_date: "2026-11-16", duration: 3 }
      ],
      links: [{ id: "a", source: "design", target: "texts", type: "0" }]
    })
    yield* settle
    expect(host.textContent).toContain("Texts")
    expect(host.textContent).not.toContain("Build")
  })))

it.live("follows the dark mode of the Browser", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    yield* diagram({ data: yield* SubscriptionRef.make<DiagramData>(FLOW) })
    yield* settle
    expect(host.getAttribute("data-dhx-theme")).toBe("light")
    yield* setFacts(browser, { dark: true })
    yield* settle
    expect(host.getAttribute("data-dhx-theme")).toBe("dark")
  })))

it.live("shows the items of the store in the editor, and writes a change in the editor back", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const data = yield* SubscriptionRef.make<ReadonlyArray<DiagramItem>>(FLOW)
    const made = yield* diagramEditor({ data })
    yield* settle
    expect(host.textContent).toContain("Work")
    expect(made.editor.serialize().length).toBe(5)

    // What a person does in the editor: a shape gets a new text.
    made.editor.diagram.data.update("work", { text: "Work in the editor" })
    yield* settle
    const stored = yield* SubscriptionRef.get(data)
    expect(stored.find((one) => one.id === "work")?.text).toBe("Work in the editor")

    // From the code: the editor shows the new items.
    yield* SubscriptionRef.set(data, FLOW.slice(0, 2))
    yield* settle
    expect(made.editor.serialize().length).toBe(2)
    expect((yield* SubscriptionRef.get(alive)).get("diagram editor")).toBe(1)
  })))
