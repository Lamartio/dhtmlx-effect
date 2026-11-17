import { it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"
import { GANTT_ACTIONS, ganttModel } from "./gantt"
import { GRID_ACTIONS, gridModel } from "./grid"
import { sliderModel, VALUE_ACTIONS } from "./inputs"
import { dispatch } from "./model"

it.effect("runs an action of a model by its name, with its arguments", () =>
  Effect.gen(function* () {
    const model = yield* gridModel({ columns: [{ id: "title", header: "Title" }] })
    expect(yield* dispatch(model, GRID_ACTIONS, "sortBy", ["title", "desc"])).toBe(true)
    expect((yield* model.snapshot).sort).toEqual({ column: "title", dir: "desc" })
  }).pipe(Effect.scoped))

it.effect("runs an action that takes no arguments, such as a zoom", () =>
  Effect.gen(function* () {
    const model = yield* ganttModel({ tasks: [] })
    expect(yield* dispatch(model, GANTT_ACTIONS, "zoomOut")).toBe(true)
    expect((yield* model.snapshot).zoom).toBe("week")
  }).pipe(Effect.scoped))

it.effect("refuses a name that is not an action, also a field of the model", () =>
  Effect.gen(function* () {
    const model = yield* sliderModel({ value: 3 })
    expect(yield* dispatch(model, VALUE_ACTIONS, "launch", [])).toBe(false)
    expect(yield* dispatch(model, VALUE_ACTIONS, "value", [])).toBe(false)
    expect(yield* dispatch(model, VALUE_ACTIONS, "snapshot", [])).toBe(false)
    expect(yield* model.snapshot).toEqual({ value: 3 })
  }).pipe(Effect.scoped))
