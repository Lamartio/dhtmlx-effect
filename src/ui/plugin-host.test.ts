import { it } from "@effect/vitest"
import { awaitRedraw } from "dhx-suite"
import { Effect, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "dhx-suite/codebase/suite.min.css"
import "@dhtmlx/kanban/dist/kanban.css"
import "../styles.css"
import { gridModel } from "../model/grid"
import { sliderModel } from "../model/inputs"
import { kanbanModel } from "../model/kanban"
import { connectHost, type HostMessage, memoryChannel, type PluginMessage, servePlugin } from "../model/remote"
import { column, gridNode, kanbanNode, publishTree, sliderNode, type UiNode } from "../model/tree"
import { UiState, uiState } from "../model/ui-state"
import { Browser, browserWith } from "./browser"
import { alive, Host } from "./host"
import { renderPlugin } from "./plugin-host"

const FACTS = { dark: false, locale: "en-GB", timeZone: "Europe/Amsterdam", viewport: { width: 1200, height: 800 }, now: new Date("2026-11-17T10:00:00Z") }

const settle = Effect.gen(function* () {
  for (let i = 0; i < 3; i++) {
    yield* Effect.promise(() => new Promise((done) => setTimeout(done, 30)))
    yield* Effect.promise(() => awaitRedraw())
  }
})

type Issue = { readonly id: string; readonly title: string; readonly status: string }
const ISSUES: ReadonlyArray<Issue> = [
  { id: "a", title: "Frames", status: "todo" },
  { id: "b", title: "Data", status: "doing" },
  { id: "c", title: "<img src=x id=injected>", status: "todo" }
]

it.live("draws the tree of a plugin, adds and takes away widgets, and changes a widget in place", () =>
  Effect.gen(function* () {
    const element = document.createElement("div")
    element.style.width = "1000px"
    element.style.height = "700px"
    document.body.append(element)
    const browser = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const [pluginEnd, hostEnd] = yield* memoryChannel<HostMessage, PluginMessage>()
      const ui = yield* uiState
      const grid = yield* gridModel({ columns: [{ id: "title", header: "Title" }], rows: ISSUES })
      const kanban = yield* kanbanModel<Issue>({ rows: ISSUES, field: "status", columns: [{ id: "todo", label: "To do" }, { id: "doing", label: "Doing" }] })
      const slider = yield* sliderModel({ value: 4 })
      const nodes = yield* Effect.all({
        grid: gridNode("issues", grid, { columns: [{ id: "title", header: "Title" }], size: 200 }),
        kanban: kanbanNode("board", kanban, { field: "status", columns: [{ id: "todo", label: "To do" }, { id: "doing", label: "Doing" }], labelField: "title" }),
        slider: sliderNode("points", slider, { min: 0, max: 13, size: 80 })
      }).pipe(Effect.provideService(UiState, ui))
      const tree = yield* SubscriptionRef.make<UiNode>(column("main", [nodes.grid, nodes.kanban]))
      yield* publishTree(tree).pipe(Effect.provideService(UiState, ui))
      const page = yield* connectHost(hostEnd)
      yield* servePlugin(ui, pluginEnd)
      yield* renderPlugin(page).pipe(Effect.provideService(Host, element), Effect.provideService(Browser, browser))
      yield* settle
      const count = (kind: string) => Effect.map(SubscriptionRef.get(alive), (live) => live.get(kind) ?? 0)
      expect(yield* count("grid")).toBe(1)
      expect(yield* count("kanban")).toBe(1)
      expect(element.textContent).toContain("Frames")
      // Text from the plugin is text in the page, also in a Grid and on a card.
      expect(element.querySelector("#injected")).toBeNull()
      expect(element.textContent).toContain("<img src=x id=injected>")
      // A change of state in the plugin changes the widget in place: no new Grid.
      yield* grid.sortBy("title", "desc")
      yield* settle
      expect(yield* count("grid")).toBe(1)
      // A new node makes a widget, and a node that goes closes its widget.
      yield* SubscriptionRef.set(tree, column("main", [nodes.grid, nodes.slider]))
      yield* settle
      expect(yield* count("kanban")).toBe(0)
      expect(yield* count("slider")).toBe(1)
      expect(yield* count("grid")).toBe(1)
      // A new config of a node makes that one widget again.
      yield* SubscriptionRef.set(tree, column("main", [{ ...nodes.grid, columns: [{ id: "title", header: "Name" }] }, nodes.slider]))
      yield* settle
      expect(element.querySelector(".dhx_grid-header")?.textContent).toContain("Name")
      expect(yield* count("grid")).toBe(1)
    }))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    expect(element.innerHTML).toBe("")
  }))
