import type { StoryObj } from "@storybook/html-vite"
import { awaitRedraw } from "dhx-suite"
import { Effect, Stream, SubscriptionRef } from "effect"
import { button } from "./button"
import { dataCollection, dataView, escapeHtml, grid, list, tree, treeCollection } from "./data"
import { column } from "./host"
import { layout } from "./layout"
import { element, inside, widgetStory } from "../storybook/story"

/**
 * The data widgets: Grid, Tree, List and DataView, on one bridge from a store
 * (a SubscriptionRef of rows) to the data collections of DHTMLX.
 */
type Story = StoryObj

type Issue = { readonly id: string; readonly title: string; readonly status: string; readonly parent?: string }

const issues = (): ReadonlyArray<Issue> => [
  { id: "075", title: "Suite/Frames", status: "doing" },
  { id: "076", title: "Suite/Data", status: "todo" },
  { id: "077", title: "Suite/Forms", status: "todo" },
  { id: "078", title: "Suite/Menus and messages", status: "todo" },
  { id: "079", title: "Products/Scheduler", status: "todo" },
  { id: "080", title: "Products/Kanban", status: "todo" }
]

const STATUSES = ["backlog", "todo", "doing", "done"] as const

const row = (item: Record<string, unknown>) =>
  `<div class="dhxe-item"><b>${escapeHtml(item["id"])}</b> ${escapeHtml(item["title"])} <span class="dhxe-badge">${escapeHtml(item["status"])}</span></div>`

const tile = (item: Record<string, unknown>) =>
  `<div class="dhxe-tile"><b>${escapeHtml(item["id"])}</b><span>${escapeHtml(item["title"])}</span><span class="dhxe-badge">${escapeHtml(item["status"])}</span></div>`

/** Buttons that change the store: the widgets only follow it. */
const controls = (rows: SubscriptionRef.SubscriptionRef<ReadonlyArray<Issue>>) =>
  Effect.gen(function* () {
    const bar = yield* element("div", "dhxe-row")
    const add = yield* inside(bar, button({ label: "Add an issue" }))
    const next = yield* inside(bar, button({ label: "Next status of the first", color: "secondary" }))
    const drop = yield* inside(bar, button({ label: "Remove the last", color: "secondary" }))
    let n = 80
    yield* add.clicks.pipe(Stream.runForEach(() => SubscriptionRef.update(rows, (all) => [...all, { id: String(++n).padStart(3, "0"), title: `New issue ${n}`, status: "backlog" }])), Effect.forkScoped)
    yield* next.clicks.pipe(
      Stream.runForEach(() =>
        SubscriptionRef.update(rows, (all) =>
          all.map((one, index) => (index === 0 ? { ...one, status: STATUSES[(STATUSES.indexOf(one.status as never) + 1) % STATUSES.length]! } : one)))),
      Effect.forkScoped
    )
    yield* drop.clicks.pipe(Stream.runForEach(() => SubscriptionRef.update(rows, (all) => all.slice(0, -1))), Effect.forkScoped)
  })

export const OneStoreTwoViews: Story = {
  name: "One store, Grid and List",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make(issues())
      const data = yield* dataCollection(rows)
      const selected = yield* SubscriptionRef.make<string | undefined>("076")
      yield* column([
        Effect.gen(function* () {
          yield* controls(rows)
          const out = yield* element("p", "dhxe-note")
          yield* SubscriptionRef.changes(selected).pipe(Stream.runForEach((id) => Effect.sync(() => (out.textContent = `Selected: ${id ?? "none"}. The Grid and the List share one selection ref.`))), Effect.forkScoped)
        }),
        layout({
          direction: "cols",
          cells: [
            { id: "grid", header: "Grid", resizable: true, part: grid({ data, selected, columns: [{ id: "id", header: "#", width: 80 }, { id: "title", header: "Title" }, { id: "status", header: "Status", width: 110 }] }) },
            { id: "list", header: "List", width: "40%", part: list({ data, selected, template: row }) }
          ]
        })
      ])
    }))
}

export const Tree: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make<ReadonlyArray<{ id: string; value: string; parent?: string }>>([
        { id: "issues", value: "Issues" },
        { id: "075", value: "075 frames", parent: "issues" },
        { id: "076", value: "076 data", parent: "issues" },
        { id: "plan", value: "Plan" },
        { id: "m2", value: "Milestone 2", parent: "plan" },
        { id: "m2-1", value: "Kanban", parent: "m2" }
      ])
      const data = yield* treeCollection(rows)
      const expanded = yield* SubscriptionRef.make<ReadonlyArray<string>>(["issues"])
      const out = yield* element("pre", "dhxe-log")
      const result = yield* column([
        Effect.gen(function* () {
          const bar = yield* element("div", "dhxe-row")
          const all = yield* inside(bar, button({ label: "Open all" }))
          const none = yield* inside(bar, button({ label: "Close all", color: "secondary" }))
          const rename = yield* inside(bar, button({ label: "Rename 076", color: "secondary" }))
          yield* all.clicks.pipe(Stream.runForEach(() => SubscriptionRef.set(expanded, ["issues", "plan", "m2"])), Effect.forkScoped)
          yield* none.clicks.pipe(Stream.runForEach(() => SubscriptionRef.set(expanded, [])), Effect.forkScoped)
          yield* rename.clicks.pipe(Stream.runForEach(() => SubscriptionRef.update(rows, (list) => list.map((one) => (one.id === "076" ? { ...one, value: `076 data (${new Date().toLocaleTimeString()})` } : one)))), Effect.forkScoped)
        }),
        tree({ data, expanded })
      ])
      const { selected } = result[1]
      yield* Stream.zipLatest(SubscriptionRef.changes(selected), SubscriptionRef.changes(expanded)).pipe(
        Stream.runForEach(([id, open]) => Effect.sync(() => (out.textContent = `selected: ${id ?? "none"}\nopen: ${open.join(", ") || "none"}`))),
        Effect.forkScoped
      )
    }))
}

export const DataView: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make(issues())
      const data = yield* dataCollection(rows)
      yield* column([controls(rows), dataView({ data, template: tile, itemsInRow: 3 })])
    }))
}

export const LargeList: Story = {
  name: "10,000 rows",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const many: ReadonlyArray<Issue> = Array.from({ length: 10_000 }, (_, n) => ({ id: `r${n}`, title: `Row ${n}`, status: STATUSES[n % 4]! }))
      const rows = yield* SubscriptionRef.make(many)
      let start = performance.now()
      const data = yield* dataCollection(rows)
      const [top] = yield* column([
        Effect.gen(function* () {
          const bar = yield* element("div", "dhxe-row")
          const change = yield* inside(bar, button({ label: "Change row 1" }))
          const out = yield* element("pre", "dhxe-log")
          return { change, out }
        }),
        layout({
          direction: "cols",
          cells: [
            { id: "grid", header: "Grid", part: grid({ data, columns: [{ id: "id", header: "#", width: 90 }, { id: "title", header: "Title" }, { id: "status", header: "Status", width: 110 }] }) },
            { id: "list", header: "List", part: list({ data, template: row }) }
          ]
        })
      ])
      yield* Effect.promise(() => awaitRedraw())
      top.out.textContent = `first draw of 10,000 rows: ${(performance.now() - start).toFixed(0)} ms`
      let n = 0
      yield* top.change.clicks.pipe(
        Stream.runForEach(() =>
          Effect.gen(function* () {
            start = performance.now()
            const title = `Row 1, change ${++n}`
            yield* SubscriptionRef.update(rows, (all) => all.map((one) => (one.id === "r1" ? { ...one, title } : one)))
            const applied = performance.now() - start
            yield* Effect.promise(() => awaitRedraw())
            top.out.textContent = `one change: ${applied.toFixed(0)} ms to the collection, ${(performance.now() - start).toFixed(0)} ms to the page\n${top.out.textContent ?? ""}`
          })),
        Effect.forkScoped
      )
    }))
}
