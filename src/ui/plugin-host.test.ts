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
import { bindTree, Column, Grid, Kanban, Layout, Sidebar, Slider, Tabbar } from "../model/nodes"
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

it.live("draws tabs of a plugin: only the open tab, and a click on a tab goes to the plugin", () =>
  Effect.gen(function* () {
    const element = document.createElement("div")
    element.style.width = "1000px"
    element.style.height = "600px"
    document.body.append(element)
    const browser = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const [pluginEnd, hostEnd] = yield* memoryChannel<HostMessage, PluginMessage>()
      const ui = yield* uiState
      const tree = Column.make({
        id: "main",
        children: [Tabbar.make({
          id: "tabs",
          tabs: [
            { label: "Issues", child: Grid.make({ id: "issues", columns: [{ id: "title", header: "Title" }], rows: ISSUES }) },
            { label: "Board", child: Kanban.make({ id: "board", field: "status", labelField: "title", columns: [{ id: "todo", label: "To do" }, { id: "doing", label: "Doing" }], rows: ISSUES }) }
          ]
        })]
      })
      yield* bindTree(tree).pipe(Effect.provideService(UiState, ui))
      const page = yield* connectHost(hostEnd)
      yield* servePlugin(ui, pluginEnd)
      yield* renderPlugin(page).pipe(Effect.provideService(Host, element), Effect.provideService(Browser, browser))
      yield* settle
      const count = (kind: string) => Effect.map(SubscriptionRef.get(alive), (live) => live.get(kind) ?? 0)
      expect(yield* count("grid")).toBe(1)
      expect(yield* count("kanban")).toBe(0)
      // The open tab fills the room under the tabs: the Grid is not 0 px high.
      expect(element.querySelector<HTMLElement>(".dhx_grid")!.getBoundingClientRect().height).toBeGreaterThan(300)
      // A click on the tab Board, as the user does.
      const tab = [...element.querySelectorAll<HTMLElement>(".dhx_tabbar-tab-button, .dhx_tabbar-tab, [role=tab]")].find((one) => one.textContent?.includes("Board"))!
      tab.click()
      yield* settle
      expect(yield* count("kanban")).toBe(1)
      expect(yield* count("grid")).toBe(0)
      expect(((yield* ui.full).state as Record<string, { value?: string }>)["tabs"]?.value).toBe("board")
      // The plugin opens the other tab.
      yield* ui.run("tabs", "set", ["issues"])
      yield* settle
      expect(yield* count("grid")).toBe(1)
      expect(yield* count("kanban")).toBe(0)
    }))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    expect(element.innerHTML).toBe("")
  }))

it.live("draws a sidebar and a layout of a plugin: a click on an item goes to the plugin, and the plugin hides a cell", () =>
  Effect.gen(function* () {
    const element = document.createElement("div")
    element.style.width = "1100px"
    element.style.height = "600px"
    document.body.append(element)
    const browser = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const [pluginEnd, hostEnd] = yield* memoryChannel<HostMessage, PluginMessage>()
      const ui = yield* uiState
      const tree = Layout.make({
        id: "frame",
        direction: "cols",
        cells: [
          {
            size: 500,
            child: Sidebar.make({
              id: "side",
              items: [
                { label: "Issues", icon: "dxi dxi-table", child: Grid.make({ id: "issues", columns: [{ id: "title", header: "Title" }], rows: ISSUES }) },
                { label: "Points", icon: "dxi dxi-tune", child: Slider.make({ id: "points", value: 3 }) }
              ]
            })
          },
          { header: "Board", child: Kanban.make({ id: "board", field: "status", labelField: "title", columns: [{ id: "todo", label: "To do" }, { id: "doing", label: "Doing" }], rows: ISSUES }) }
        ]
      })
      yield* bindTree(tree).pipe(Effect.provideService(UiState, ui))
      const page = yield* connectHost(hostEnd)
      yield* servePlugin(ui, pluginEnd)
      yield* renderPlugin(page).pipe(Effect.provideService(Host, element), Effect.provideService(Browser, browser))
      yield* settle
      const count = (kind: string) => Effect.map(SubscriptionRef.get(alive), (live) => live.get(kind) ?? 0)
      expect(yield* count("grid")).toBe(1)
      expect(yield* count("kanban")).toBe(1)
      expect(element.querySelector<HTMLElement>(".dhx_grid")!.getBoundingClientRect().height).toBeGreaterThan(300)
      // A click on the item Points of the sidebar, as the user does.
      const item = [...element.querySelectorAll<HTMLElement>(".dhx_nav-menu-button, .dhx_sidebar-button, [role=menuitem], button")].find((one) => one.textContent?.includes("Points"))!
      item.click()
      yield* settle
      expect(((yield* ui.full).state as Record<string, { value?: string }>)["side"]?.value).toBe("points")
      expect(yield* count("grid")).toBe(0)
      expect(yield* count("slider")).toBe(1)
      // The plugin hides the cell of the Kanban.
      yield* ui.run("frame", "hide", ["board"])
      yield* settle
      const boardCell = element.querySelector<HTMLElement>("[data-cell-id=board], .dhx_layout-cell [data-drop-area]")
      expect(boardCell === null || boardCell.offsetParent === null || boardCell.getBoundingClientRect().width === 0).toBe(true)
    }))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    expect(element.innerHTML).toBe("")
  }))
