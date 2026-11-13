import { it } from "@effect/vitest"
import { awaitRedraw, Grid } from "dhx-suite"
import { Effect, Fiber, Scope, Stream, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "dhx-suite/codebase/suite.min.css"
import "../styles.css"
import { Browser, browserWith, type BrowserFacts } from "./browser"
import { dataCollection, grid } from "./data"
import { alive, Host } from "./host"
import { forEachReported } from "./problems"

const FACTS: BrowserFacts = {
  dark: false,
  locale: "en-GB",
  timeZone: "Europe/Amsterdam",
  viewport: { width: 1200, height: 800 },
  now: new Date("2026-11-08T10:00:00Z")
}

type Issue = { readonly id: string; readonly title: string; readonly status: string; readonly points: number }
const ISSUES: ReadonlyArray<Issue> = [
  { id: "a", title: "Frames", status: "doing", points: 3 },
  { id: "b", title: "Data", status: "todo", points: 5 },
  { id: "c", title: "Forms", status: "todo", points: 8 }
]

const freshHost = () => {
  const element = document.createElement("div")
  element.style.width = "900px"
  element.style.height = "400px"
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

/** The filter in the header of a column, as the Grid gives it. */
const headerFilter = (view: Grid, column: string) =>
  (view as unknown as { readonly getHeaderFilter: (id: string) => { readonly setValue: (value: string) => void; readonly clear: () => void } }).getHeaderFilter(column)

it.live("filters the rows with a filter in the header of a column", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const rows = yield* SubscriptionRef.make(ISSUES)
    const data = yield* dataCollection(rows)
    const made = yield* grid({
      data,
      columns: [{ id: "title", header: "Title", filter: "input" }, { id: "status", header: "Status", filter: "select" }, { id: "points", header: "Points", type: "number" }]
    })
    yield* settle
    const body = () => host.querySelector(".dhx_grid-body")?.textContent ?? ""
    expect(body()).toContain("Frames")
    expect(body()).toContain("Forms")
    // A filter is a control in the header.
    expect(host.querySelector(".dhx_grid-header input, .dhx_grid-header select, .dhx_grid-header .dhx_input")).not.toBeNull()

    headerFilter(made.grid, "title").setValue("Fra")
    yield* settle
    expect(body()).toContain("Frames")
    expect(body()).not.toContain("Forms")

    headerFilter(made.grid, "title").clear()
    headerFilter(made.grid, "status").setValue("todo")
    yield* settle
    expect(body()).not.toContain("Frames")
    expect(body()).toContain("Data")
    expect(body()).toContain("Forms")
  })))

it.live("gives an edit of a cell as a stream, and shows the value that the app writes into the store", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const rows = yield* SubscriptionRef.make(ISSUES)
    const data = yield* dataCollection(rows)
    const made = yield* grid({ data, columns: [{ id: "title", header: "Title", editable: true }, { id: "status", header: "Status" }] })
    // What an app does with an edit: it writes the value into the store.
    yield* forEachReported("The edits of the test", made.edits, (edit) =>
      SubscriptionRef.update(rows, (all) => all.map((one) => (one.id === edit.row ? { ...one, [edit.column]: edit.value } : one))))
    const first = yield* made.edits.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* settle

    made.grid.editCell("b", "title")
    yield* settle
    const input = host.querySelector<HTMLInputElement>(".dhx_cell-editor input, input.dhx_cell-editor, .dhx_grid-body input")
    expect(input).not.toBeNull()
    input!.value = "Data, edited"
    input!.dispatchEvent(new Event("input", { bubbles: true }))
    made.grid.editEnd()
    yield* settle
    expect(yield* Fiber.join(first)).toEqual([{ row: "b", column: "title", value: "Data, edited" }])
    expect((yield* SubscriptionRef.get(rows)).find((one) => one.id === "b")?.title).toBe("Data, edited")
    expect(host.querySelector(".dhx_grid-body")?.textContent).toContain("Data, edited")

    // A column that is not editable opens no editor.
    made.grid.editCell("b", "status")
    yield* settle
    expect(host.querySelector(".dhx_cell-editor input, input.dhx_cell-editor, .dhx_grid-body input")).toBeNull()
  })))

// A probe, not a check: which of the extras of the Grid does the free build have? The answer is in the log.
it.live("says which extras of the Grid the free build has", () =>
  Effect.gen(function* () {
    const element = freshHost()
    const view = new Grid(element, {
      columns: [{ id: "title", header: [{ text: "Title" }] }, { id: "status", header: [{ text: "Status" }] }],
      data: ISSUES.map((one) => ({ ...one })),
      rangeSelection: true,
      blockSelection: true,
      clipboard: true,
      history: true,
      dragPanel: true,
      multiSort: true,
      groupable: true
    } as never)
    yield* settle
    const has = view as unknown as Record<string, unknown>
    console.log(`GRID-PROBE ${JSON.stringify({
      name: view.constructor.name,
      range: has["range"] !== undefined,
      block: has["block"] !== undefined,
      clipboard: has["clipboard"] !== undefined,
      history: has["history"] !== undefined,
      dragPanel: element.querySelector('[class*="drag-panel"], [class*="drag_panel"], [class*="dragpanel"]') !== null,
      groupPanel: element.querySelector('[class*="group"]') !== null,
      classes: [...new Set([...element.querySelectorAll("*")].flatMap((one) => [...one.classList]).filter((name) => /drag|range|block|group/.test(name)))].slice(0, 12)
    })}`)
    view.destructor()
    element.remove()
  }))
