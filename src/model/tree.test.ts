import { it } from "@effect/vitest"
import { Effect, Option, Schema, SubscriptionRef } from "effect"
import { expect } from "vitest"
import { gridModel } from "./grid"
import { kanbanModel } from "./kanban"
import { column, gridNode, kanbanNode, publishTree, row, TREE_KEY, type UiNode, UiNodeSchema } from "./tree"
import { UiState, uiState } from "./ui-state"

const settle = Effect.forEach(Array.from({ length: 20 }), () => Effect.yieldNow, { discard: true })

it.effect("puts the model of each node and the tree in one document", () =>
  Effect.gen(function* () {
    const ui = yield* uiState
    const tree = yield* Effect.gen(function* () {
      const grid = yield* gridNode("issues", yield* gridModel({ columns: [{ id: "title", header: "Title" }], rows: [{ id: "a", title: "One" }] }), { columns: [{ id: "title", header: "Title" }] })
      const board = yield* kanbanNode("board", yield* kanbanModel({ rows: [{ id: "a", status: "todo" }], field: "status", columns: [{ id: "todo", label: "To do" }] }), {
        field: "status",
        columns: [{ id: "todo", label: "To do" }],
        labelField: "id"
      })
      return column("main", [grid, row("side", [board], 300)])
    }).pipe(Effect.provideService(UiState, ui))
    yield* publishTree(yield* SubscriptionRef.make<UiNode>(tree)).pipe(Effect.provideService(UiState, ui))
    yield* settle
    const state = (yield* ui.full).state as Record<string, unknown>
    expect(Object.keys(state).sort()).toEqual([TREE_KEY, "board", "issues"].sort())
    expect(state[TREE_KEY]).toEqual({
      _tag: "column",
      id: "main",
      children: [
        { _tag: "grid", id: "issues", columns: [{ id: "title", header: "Title" }] },
        { _tag: "row", id: "side", size: 300, children: [{ _tag: "kanban", id: "board", field: "status", columns: [{ id: "todo", label: "To do" }], labelField: "id" }] }
      ]
    })
  }).pipe(Effect.scoped))

it("takes a tree as data, and refuses a node with a kind that it does not know or a function in it", () => {
  const decode = Schema.decodeUnknownOption(UiNodeSchema as never)
  expect(Option.isSome(decode({ _tag: "column", id: "main", children: [{ _tag: "slider", id: "s", min: 0 }] }))).toBe(true)
  expect(Option.isNone(decode({ _tag: "column", id: "main", children: [{ _tag: "browser", id: "x" }] }))).toBe(true)
  expect(Option.isNone(decode({ _tag: "list", id: "l", fields: [() => "<b>"] }))).toBe(true)
})
