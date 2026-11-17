import { it } from "@effect/vitest"
import { Effect, Schema, SubscriptionRef } from "effect"
import { expect } from "vitest"
import { bindTree, Column, Grid, Kanban, Row, Slider, type Ui, UiSchema } from "./nodes"
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
