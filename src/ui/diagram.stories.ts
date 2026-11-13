import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect, Stream, SubscriptionRef } from "effect"
import "@dhtmlx/diagram/codebase/diagram.min.css"
import { element, inside, widgetStory } from "../storybook/story"
import { button } from "./button"
import { diagram, type DiagramData, type DiagramItem, diagramEditor } from "./diagram"
import { column, Host } from "./host"

/**
 * The Diagram: a flowchart, an org chart, a mind map and a PERT chart from one part, and the editor
 * where a person draws. The items are in a store: a change of an item shows in place.
 */
const meta: Meta = { title: "Products/Diagram" }
export default meta
type Story = StoryObj

const flow = (): ReadonlyArray<DiagramItem> => [
  { id: "start", type: "start", x: 200, y: 0, text: "Start" },
  { id: "read", type: "process", x: 200, y: 120, text: "Read the order" },
  { id: "stock", type: "decision", x: 200, y: 240, text: "In stock?" },
  { id: "ship", type: "process", x: 60, y: 400, text: "Ship it" },
  { id: "wait", type: "process", x: 340, y: 400, text: "Order more" },
  { id: "end", type: "end", x: 200, y: 520, text: "Done" },
  { id: "l1", type: "line", from: "start", to: "read" },
  { id: "l2", type: "line", from: "read", to: "stock" },
  { id: "l3", type: "line", from: "stock", to: "ship" },
  { id: "l4", type: "line", from: "stock", to: "wait" },
  { id: "l5", type: "line", from: "ship", to: "end" },
  { id: "l6", type: "line", from: "wait", to: "end" }
]

const people = (): ReadonlyArray<DiagramItem> => [
  { id: "ceo", text: "Anna Vos", title: "Director" },
  { id: "cto", text: "Ben Smit", title: "Technology", parent: "ceo" },
  { id: "cfo", text: "Cara Bos", title: "Finance", parent: "ceo" },
  { id: "dev1", text: "Daan Mol", title: "Developer", parent: "cto" },
  { id: "dev2", text: "Eva Prins", title: "Developer", parent: "cto" },
  { id: "acc", text: "Finn Kok", title: "Accountant", parent: "cfo" }
]

const topics = (): ReadonlyArray<DiagramItem> => [
  { id: "trip", text: "Trip to Rome" },
  { id: "travel", text: "Travel", parent: "trip" },
  { id: "train", text: "Train", parent: "travel" },
  { id: "plane", text: "Plane", parent: "travel" },
  { id: "stay", text: "Stay", parent: "trip" },
  { id: "hotel", text: "Hotel", parent: "stay" },
  { id: "see", text: "See", parent: "trip" },
  { id: "forum", text: "The Forum", parent: "see" }
]

const pert = (): DiagramData => ({
  data: [
    { id: "site", type: "project", text: "New site", parent: null },
    { id: "design", type: "task", text: "Design", start_date: "2026-11-09", duration: 5, parent: "site" },
    { id: "build", type: "task", text: "Build", start_date: "2026-11-16", duration: 8, parent: "site" },
    { id: "texts", type: "task", text: "Texts", start_date: "2026-11-16", duration: 4, parent: "site" },
    { id: "live", type: "milestone", text: "Live", parent: "site" }
  ],
  links: [
    { id: "a", source: "design", target: "build", type: "0" },
    { id: "b", source: "design", target: "texts", type: "0" },
    { id: "c", source: "build", target: "live", type: "0" },
    { id: "d", source: "texts", target: "live", type: "0" }
  ]
})

/** A line of text that says what was clicked and what is selected. */
const status = (made: { readonly clicks: Stream.Stream<string>; readonly selected: SubscriptionRef.SubscriptionRef<string | undefined> }, log: HTMLElement) =>
  Effect.gen(function* () {
    yield* made.clicks.pipe(Stream.runForEach((id) => Effect.sync(() => (log.textContent = `clicked ${id}`))), Effect.forkScoped)
    yield* SubscriptionRef.changes(made.selected).pipe(Stream.runForEach((id) => Effect.sync(() => (log.title = `selected: ${id ?? "none"}`))), Effect.forkScoped)
  })

export const Flowchart: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const data = yield* SubscriptionRef.make<DiagramData>(flow())
      const [controls, made] = yield* column([
        Effect.gen(function* () {
          const row = yield* element("div", "dhxe-row")
          const rename = yield* inside(row, button({ label: "Rename a step" }))
          const drop = yield* inside(row, button({ label: "Remove \"Order more\"", color: "secondary" }))
          const log = yield* element("pre", "dhxe-log", "Click a shape.")
          return { rename, drop, log }
        }),
        diagram({ data })
      ])
      let n = 0
      yield* controls.rename.clicks.pipe(
        Stream.runForEach(() => SubscriptionRef.update(data, (all) => (all as ReadonlyArray<DiagramItem>).map((one) => (one.id === "read" ? { ...one, text: `Read the order (${++n})` } : one)))),
        Effect.forkScoped
      )
      yield* controls.drop.clicks.pipe(
        Stream.runForEach(() => SubscriptionRef.update(data, (all) => (all as ReadonlyArray<DiagramItem>).filter((one) => one.id !== "wait" && one.id !== "l4" && one.id !== "l6"))),
        Effect.forkScoped
      )
      yield* status(made, controls.log)
    }))
}

export const OrgChart: Story = {
  name: "Org chart",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const data = yield* SubscriptionRef.make<DiagramData>(people())
      const [controls, made] = yield* column([
        Effect.gen(function* () {
          const row = yield* element("div", "dhxe-row")
          const hire = yield* inside(row, button({ label: "Hire a developer" }))
          const log = yield* element("pre", "dhxe-log", "Click a card.")
          return { hire, log }
        }),
        diagram({ type: "org", data })
      ])
      let n = 2
      yield* controls.hire.clicks.pipe(
        Stream.runForEach(() => SubscriptionRef.update(data, (all) => [...(all as ReadonlyArray<DiagramItem>), { id: `dev${++n}`, text: `Developer ${n}`, title: "Developer", parent: "cto" }])),
        Effect.forkScoped
      )
      yield* status(made, controls.log)
    }))
}

export const MindMap: Story = {
  name: "Mind map",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const data = yield* SubscriptionRef.make<DiagramData>(topics())
      const [controls] = yield* column([
        Effect.gen(function* () {
          const row = yield* element("div", "dhxe-row")
          return yield* inside(row, button({ label: "Add a place to see" }))
        }),
        diagram({ type: "mindmap", data })
      ])
      let n = 0
      yield* controls.clicks.pipe(
        Stream.runForEach(() => SubscriptionRef.update(data, (all) => [...(all as ReadonlyArray<DiagramItem>), { id: `place${++n}`, text: `Place ${n}`, parent: "see" }])),
        Effect.forkScoped
      )
    }))
}

export const PertChart: Story = {
  name: "PERT chart",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const data = yield* SubscriptionRef.make<DiagramData>(pert())
      yield* column([element("p", "dhxe-note", "The tasks and the links are as a Gantt takes them: the same data can drive a Gantt and this chart."), diagram({ type: "pert", data })])
    }))
}

export const Editor: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const data = yield* SubscriptionRef.make<ReadonlyArray<DiagramItem>>(flow())
      const [log] = yield* column([
        element("pre", "dhxe-log"),
        Effect.gen(function* () {
          const host = yield* Host
          host.style.minHeight = "480px"
          return yield* diagramEditor({ data })
        })
      ])
      yield* SubscriptionRef.changes(data).pipe(Stream.runForEach((items) => Effect.sync(() => (log.textContent = `${items.length} items in the store. Draw or move a shape: the store follows.`))), Effect.forkScoped)
    }))
}
