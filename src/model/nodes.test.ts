import { it } from "@effect/vitest"
import { Effect, Schema, SubscriptionRef } from "effect"
import { expect } from "vitest"
import { bindTree, Column, Grid, Kanban, Layout, Row, Sidebar, Slider, Tabbar, type Ui, UiSchema, Window } from "./nodes"
import { TREE_KEY } from "./tree"
import { UiState, uiState } from "./ui-state"

const settle = Effect.forEach(Array.from({ length: 30 }), () => Effect.yieldNow, { discard: true })

const ROWS = [{ id: "a", title: "One", status: "todo" }, { id: "b", title: "Two", status: "done" }]
const grid = (rows = ROWS) => Grid.make({ id: "issues", columns: [{ id: "title", header: "Title" }], rows })
const board = Kanban.make({ id: "board", field: "status", labelField: "title", columns: [{ id: "todo", label: "To do" }, { id: "done", label: "Done" }], rows: ROWS })

it("refuses a node that is not right when it is made", () => {
  expect(() => Grid.make({ id: "issues", columns: [{ id: "title", header: "Title" }], rows: [{ title: "no id" }] } as never)).toThrow()
  expect(() => Slider.make({ id: "s", value: "five" } as never)).toThrow()
  expect(() => Column.make({ id: "main", children: [{ _tag: "browser", id: "x" } as never] })).toThrow()
})

it("gives the same tree after an encode to JSON and a decode", () => {
  const tree = Column.make({ id: "main", children: [Row.make({ id: "top", size: 80, children: [Slider.make({ id: "s", value: 3 })] }), grid()] })
  const json = JSON.parse(JSON.stringify(Schema.encodeSync(UiSchema)(tree)))
  expect(Schema.decodeUnknownSync(UiSchema)(json)).toEqual(tree)
})

it.effect("keeps a model by id: new data goes in, a new node gets a model, and a node that goes closes its model", () =>
  Effect.gen(function* () {
    const ui = yield* uiState
    const trees = yield* SubscriptionRef.make<Ui>(Column.make({ id: "main", children: [grid(), board] }))
    yield* bindTree(trees).pipe(Effect.provideService(UiState, ui))
    yield* settle
    const state = () => Effect.map(ui.full, (full) => full.state as Record<string, any>)
    expect(Object.keys(yield* state()).sort()).toEqual([TREE_KEY, "board", "issues"].sort())
    // The page gets the tree without the data.
    expect((yield* state())[TREE_KEY].children[0]).toEqual({ _tag: "grid", id: "issues", columns: [{ id: "title", header: "Title" }] })
    // The user selects a row: it stays when the next tree has the same data.
    yield* ui.run("issues", "select", ["b"])
    yield* SubscriptionRef.set(trees, Column.make({ id: "main", children: [grid(), board] }))
    yield* settle
    expect((yield* state())["issues"].selected).toBe("b")
    // New data goes into the same model.
    yield* SubscriptionRef.set(trees, Column.make({ id: "main", children: [grid([...ROWS, { id: "c", title: "Three", status: "todo" }])] }))
    yield* settle
    expect((yield* state())["issues"].rows.map((row: { id: string }) => row.id)).toEqual(["a", "b", "c"])
    expect((yield* state())["issues"].selected).toBe("b")
    // The Kanban went: its model is closed, and its key is out of the document.
    expect(Object.keys(yield* state()).sort()).toEqual([TREE_KEY, "issues"].sort())
  }).pipe(Effect.scoped))

it.effect("keeps the open tab of a tabbar as a model, and refuses a tab that is not there", () =>
  Effect.gen(function* () {
    const ui = yield* uiState
    const tabs = (value?: string) =>
      Column.make({ id: "main", children: [Tabbar.make({ id: "tabs", ...(value === undefined ? {} : { value }), tabs: [{ label: "Issues", child: grid() }, { label: "Board", child: board }] })] })
    const trees = yield* SubscriptionRef.make<Ui>(tabs())
    yield* bindTree(trees).pipe(Effect.provideService(UiState, ui))
    yield* settle
    const state = () => Effect.map(ui.full, (full) => full.state as Record<string, any>)
    expect((yield* state())["tabs"]).toEqual({ value: "issues" })
    expect((yield* state())[TREE_KEY].children[0].tabs.map((tab: { label: string; child: { id: string } }) => [tab.label, tab.child.id])).toEqual([["Issues", "issues"], ["Board", "board"]])
    expect(yield* ui.run("tabs", "set", ["board"])).toBe(true)
    expect(yield* ui.run("tabs", "set", ["nothing"])).toBe(false)
    yield* settle
    expect((yield* state())["tabs"]).toEqual({ value: "board" })
    // The same tabs again keep the open tab; a value in the tree opens that tab.
    yield* SubscriptionRef.set(trees, tabs())
    yield* settle
    expect((yield* state())["tabs"]).toEqual({ value: "board" })
  }).pipe(Effect.scoped))

it.effect("keeps the chosen item of a sidebar and the hidden cells of a layout as models", () =>
  Effect.gen(function* () {
    const ui = yield* uiState
    const tree = Layout.make({
      id: "frame",
      direction: "cols",
      hidden: ["board"],
      cells: [
        { child: Sidebar.make({ id: "side", items: [{ label: "Issues", icon: "dxi dxi-table", child: grid() }, { label: "Points", child: Slider.make({ id: "points", value: 2 }) }] }), size: 300 },
        { child: board, header: "Board" }
      ]
    })
    yield* bindTree(tree).pipe(Effect.provideService(UiState, ui))
    yield* settle
    const state = () => Effect.map(ui.full, (full) => full.state as Record<string, any>)
    expect((yield* state())["side"]).toEqual({ value: "issues" })
    expect((yield* state())["frame"]).toEqual({ hidden: ["board"] })
    expect((yield* state())[TREE_KEY].cells[0].child.items[1]).toEqual({ label: "Points", child: { _tag: "slider", id: "points" } })
    expect(yield* ui.run("side", "set", ["points"])).toBe(true)
    expect(yield* ui.run("frame", "show", ["board"])).toBe(true)
    expect(yield* ui.run("frame", "hide", ["nothing"])).toBe(false)
    yield* settle
    expect((yield* state())["side"]).toEqual({ value: "points" })
    expect((yield* state())["frame"]).toEqual({ hidden: [] })
  }).pipe(Effect.scoped))

it.effect("keeps a window shut until the plugin opens it, and takes the close of the user", () =>
  Effect.gen(function* () {
    const ui = yield* uiState
    const window = (open: boolean) => Column.make({ id: "main", children: [Window.make({ id: "help", title: "Help", open, child: Slider.make({ id: "zoom", value: 2 }) })] })
    const tree = yield* SubscriptionRef.make<Ui>(window(false))
    yield* bindTree(tree).pipe(Effect.provideService(UiState, ui))
    yield* settle
    const state = () => Effect.map(ui.full, (full) => full.state as Record<string, unknown>)
    expect((yield* state())["help"]).toEqual({ open: false })
    // The child is in the document while the window is shut, so it keeps its state.
    expect((yield* state())["zoom"]).toEqual({ value: 2 })
    yield* SubscriptionRef.set(tree, window(true))
    yield* settle
    expect((yield* state())["help"]).toEqual({ open: true })
    expect(yield* ui.run("help", "close", [])).toBe(true)
    yield* settle
    expect((yield* state())["help"]).toEqual({ open: false })
  }).pipe(Effect.scoped))
