import { it } from "@effect/vitest"
import { awaitRedraw } from "dhx-suite"
import { Effect, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "dhx-suite/codebase/suite.min.css"
import "../styles.css"
import "../storybook.css"
import { Browser, browserWith, setFacts, type BrowserFacts } from "./browser"
import { dataCollection, dataView, escapeHtml, grid, list, tree, treeCollection } from "./data"
import { alive, Host } from "./host"
import { layout } from "./layout"

const FACTS: BrowserFacts = {
  dark: false,
  locale: "en-GB",
  timeZone: "Europe/Amsterdam",
  viewport: { width: 1200, height: 800 },
  now: new Date("2026-11-08T10:00:00Z")
}

type Issue = { readonly id: string; readonly title: string; readonly status: string; readonly parent?: string }
const ISSUES: ReadonlyArray<Issue> = [
  { id: "075", title: "Frames", status: "doing" },
  { id: "076", title: "Data", status: "todo" },
  { id: "077", title: "Forms", status: "todo" }
]

const freshHost = () => {
  const element = document.createElement("div")
  element.style.width = "1000px"
  element.style.height = "600px"
  document.body.append(element)
  return element
}

const settle = Effect.gen(function* () {
  yield* Effect.yieldNow
  yield* Effect.promise(() => awaitRedraw())
  yield* Effect.yieldNow
  yield* Effect.promise(() => awaitRedraw())
})

const run = <A, E>(body: Effect.Effect<A, E, Host | Browser | import("effect").Scope.Scope>) =>
  Effect.gen(function* () {
    const host = freshHost()
    const facts = yield* browserWith(FACTS)
    yield* Effect.scoped(body.pipe(Effect.provideService(Host, host), Effect.provideService(Browser, facts)))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    expect(host.innerHTML).toBe("")
  })

const template = (item: Record<string, unknown>) => `<span class="row">${escapeHtml(item["title"])}</span>`

it.live("drives a Grid and a List from one store, so a change shows in both", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const rows = yield* SubscriptionRef.make(ISSUES)
    const data = yield* dataCollection(rows)
    yield* layout({
      direction: "rows",
      cells: [
        { id: "grid", part: grid({ data, columns: [{ id: "id", header: "#", width: 80 }, { id: "title", header: "Title" }, { id: "status", header: "Status" }] }) },
        { id: "list", part: list({ data, template }) }
      ]
    })
    yield* settle
    expect(host.querySelector(".dhx_grid")?.textContent).toContain("Frames")
    expect(host.querySelector(".dhx_list")?.textContent).toContain("Frames")
    yield* SubscriptionRef.update(rows, (all) => [...all.map((one) => (one.id === "075" ? { ...one, title: "Frames done" } : one)), { id: "078", title: "Menus", status: "todo" }])
    yield* settle
    expect(data.getLength()).toBe(4)
    expect(host.querySelector(".dhx_grid")?.textContent).toContain("Frames done")
    expect(host.querySelector(".dhx_grid")?.textContent).toContain("Menus")
    expect(host.querySelector(".dhx_list")?.textContent).toContain("Frames done")
    expect(host.querySelector(".dhx_list")?.textContent).toContain("Menus")
    yield* SubscriptionRef.update(rows, (all) => all.filter((one) => one.id !== "076"))
    yield* settle
    expect(host.querySelector(".dhx_list")?.textContent).not.toContain("Data")
  })))

it.live("keeps the selected row both ways, and keeps it when another row changes", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const rows = yield* SubscriptionRef.make(ISSUES)
    const data = yield* dataCollection(rows)
    const [table, items] = yield* layout({
      direction: "rows",
      cells: [
        { id: "grid", part: grid({ data, columns: [{ id: "title", header: "Title" }] }) },
        { id: "list", part: list({ data, template }) }
      ]
    })
    yield* settle
    yield* SubscriptionRef.set(table.selected, "076")
    yield* settle
    expect((table.grid.selection.getCell() as { row: { id: string } }).row.id).toBe("076")
    // A click on a row of the List sets its ref.
    const row = [...host.querySelectorAll<HTMLElement>(".dhx_list-item")].find((one) => one.textContent === "Forms")
    expect(row).toBeDefined()
    row!.click()
    yield* settle
    expect(yield* SubscriptionRef.get(items.selected)).toBe("077")
    yield* SubscriptionRef.update(rows, (all) => all.map((one) => (one.id === "075" ? { ...one, status: "done" } : one)))
    yield* settle
    expect((table.grid.selection.getCell() as { row: { id: string } }).row.id).toBe("076")
    expect(items.list.selection.getId()).toBe("077")
  })))

it.live("sorts the Grid on a click on a header", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const rows = yield* SubscriptionRef.make(ISSUES)
    const data = yield* dataCollection(rows)
    yield* grid({ data, columns: [{ id: "title", header: "Title" }] })
    yield* settle
    const header = [...host.querySelectorAll<HTMLElement>(".dhx_grid-header-cell")].find((one) => one.textContent?.includes("Title"))
    expect(header).toBeDefined()
    header!.click()
    yield* settle
    expect([0, 1, 2].map((index) => data.getId(index))).toEqual(["076", "077", "075"])
  })))

it.live("opens and closes folders of a Tree both ways, and keeps them open when a row changes", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const rows = yield* SubscriptionRef.make<ReadonlyArray<Issue & { value: string }>>([
      { id: "m2", title: "M2", value: "M2", status: "" },
      { id: "075", title: "Frames", value: "Frames", status: "doing", parent: "m2" },
      { id: "076", title: "Data", value: "Data", status: "todo", parent: "m2" }
    ])
    const data = yield* treeCollection(rows)
    const { tree: view, expanded, selected } = yield* tree({ data })
    yield* settle
    expect(host.textContent).toContain("M2")
    expect(host.textContent).not.toContain("Frames")
    yield* SubscriptionRef.set(expanded, ["m2"])
    yield* settle
    expect(host.textContent).toContain("Frames")
    yield* SubscriptionRef.update(rows, (all) => all.map((one) => (one.id === "076" ? { ...one, value: "Data grid" } : one)))
    yield* settle
    expect(host.textContent).toContain("Data grid")
    view.collapse("m2")
    yield* settle
    expect(yield* SubscriptionRef.get(expanded)).toEqual([])
    yield* SubscriptionRef.set(selected, "m2")
    yield* settle
    expect(view.selection.getId()).toBe("m2")
  })))

it.live("puts fewer tiles in a row of a DataView on a narrow window", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const facts = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make(ISSUES)
      const data = yield* dataCollection(rows)
      const { dataView: view } = yield* dataView({ data, template })
      yield* settle
      expect(view.config.itemsInRow).toBe(4)
      expect(host.textContent).toContain("Forms")
      yield* setFacts(facts, { viewport: { width: 400, height: 800 } })
      yield* settle
      expect(view.config.itemsInRow).toBe(1)
    }).pipe(Effect.provideService(Host, host), Effect.provideService(Browser, facts)))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
  }))

it.live("shows 10,000 rows in a Grid and a List, and takes one change fast", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const many: ReadonlyArray<Issue> = Array.from({ length: 10_000 }, (_, n) => ({ id: `r${n}`, title: `Row ${n}`, status: n % 2 === 0 ? "todo" : "done" }))
    const rows = yield* SubscriptionRef.make(many)
    let start = performance.now()
    const data = yield* dataCollection(rows)
    yield* layout({
      direction: "cols",
      cells: [
        { id: "grid", part: grid({ data, columns: [{ id: "title", header: "Title" }, { id: "status", header: "Status" }] }) },
        { id: "list", part: list({ data, template }) }
      ]
    })
    yield* settle
    const first = performance.now() - start
    expect(data.getLength()).toBe(10_000)
    // Only the rows in view are in the page.
    expect(host.querySelectorAll(".dhx_grid-row").length).toBeLessThan(200)
    // One change, three times: the first change after the first draw also pays for work that DHTMLX put off.
    const applied: Array<number> = []
    const painted: Array<number> = []
    for (const title of ["Row one", "Row one again", "Row one more"]) {
      start = performance.now()
      yield* SubscriptionRef.update(rows, (all) => all.map((one) => (one.id === "r1" ? { ...one, title } : one)))
      while (data.getItem("r1")?.title !== title) yield* Effect.yieldNow
      applied.push(performance.now() - start)
      yield* settle
      painted.push(performance.now() - start)
      expect(host.querySelector(".dhx_grid")?.textContent).toContain(title)
    }
    const ms = (list: ReadonlyArray<number>) => list.map((one) => one.toFixed(0)).join(", ")
    console.log(`10,000 rows: first draw ${first.toFixed(0)} ms; one change in the collection ${ms(applied)} ms, on the page ${ms(painted)} ms`)
    expect(first).toBeLessThan(3000)
    // The store, the diff and the collection: fast. The paint of the List is most of the rest.
    expect(Math.min(...applied), ms(applied)).toBeLessThan(50)
    expect(Math.min(...painted), ms(painted)).toBeLessThan(400)
  })))

it.live("opens the folders of expanded at the start once, with no loop between the Tree and the ref", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const rows = yield* SubscriptionRef.make<ReadonlyArray<{ id: string; value: string; parent?: string }>>([
      { id: "board", value: "Issues" },
      { id: "075", value: "075 frames", parent: "board" }
    ])
    const data = yield* treeCollection(rows)
    const expanded = yield* SubscriptionRef.make<ReadonlyArray<string>>(["board"])
    const { tree: view } = yield* tree({ data, expanded })
    let expands = 0
    view.events.on("afterExpand" as never, () => void expands++)
    yield* settle
    expect(host.textContent).toContain("075 frames")
    const before = expands
    yield* SubscriptionRef.set(expanded, ["board"])
    yield* settle
    expect(expands).toBe(before)
    expect(yield* SubscriptionRef.get(expanded)).toEqual(["board"])
  })))
