import { it } from "@effect/vitest"
import { Effect, SubscriptionRef } from "effect"
import { expect } from "vitest"
import type { Row } from "../core/rows"
import { selectionModel, treeModel } from "./selection"

const ROWS: ReadonlyArray<Row> = [
  { id: "docs" },
  { id: "intro", parent: "docs" },
  { id: "guide", parent: "docs" },
  { id: "notes" }
]

it.effect("selects a row of a list, and refuses a row that is not there", () =>
  Effect.gen(function* () {
    const model = yield* selectionModel({ rows: ROWS })
    yield* model.select("notes")
    yield* model.select("lost")
    expect(yield* model.snapshot).toEqual({ selected: "notes", rows: ROWS })
  }).pipe(Effect.scoped))

it.effect("selects any row when it has no rows, as the renderer checks them", () =>
  Effect.gen(function* () {
    const model = yield* selectionModel()
    yield* model.select("lost")
    expect(yield* model.snapshot).toEqual({ selected: "lost" })
  }).pipe(Effect.scoped))

it.effect("shares a selected row that it is given, both ways", () =>
  Effect.gen(function* () {
    const selected = yield* SubscriptionRef.make<string | undefined>("docs")
    const model = yield* selectionModel({ rows: ROWS, selected })
    yield* model.select("intro")
    expect(yield* SubscriptionRef.get(selected)).toBe("intro")
    yield* SubscriptionRef.set(selected, undefined)
    expect((yield* model.snapshot).selected).toBe(undefined)
  }).pipe(Effect.scoped))

it.effect("opens and closes a folder of a tree", () =>
  Effect.gen(function* () {
    const model = yield* treeModel({ rows: ROWS })
    yield* model.expand("docs")
    yield* model.expand("docs")
    expect((yield* model.snapshot).expanded).toEqual(["docs"])
    yield* model.collapse("docs")
    expect((yield* model.snapshot).expanded).toEqual([])
  }).pipe(Effect.scoped))

it.effect("refuses to open a row with no children, or a row that is not there", () =>
  Effect.gen(function* () {
    const model = yield* treeModel({ rows: ROWS })
    yield* model.expand("notes")
    yield* model.expand("lost")
    expect((yield* model.snapshot).expanded).toEqual([])
  }).pipe(Effect.scoped))

it.effect("keeps the selects, the opens and the inputs of a tree in its history", () =>
  Effect.gen(function* () {
    const model = yield* treeModel({ rows: ROWS, history: 10 })
    yield* model.expand("docs")
    yield* model.select("guide")
    expect((yield* model.recent).map((entry) => `${entry._tag} ${entry.name} ${JSON.stringify(entry.value)}`)).toEqual([
      "input selected undefined",
      "input expanded []",
      'action expand "docs"',
      'input expanded ["docs"]',
      'action select "guide"',
      'input selected "guide"'
    ])
  }).pipe(Effect.scoped))
