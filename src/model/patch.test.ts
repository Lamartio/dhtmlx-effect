import { expect, it } from "vitest"
import { apply, diff } from "./patch"

const roundTrip = (before: unknown, after: unknown) => expect(apply(before, diff(before, after))).toEqual(after)

it("gives no ops for two values that are the same", () => {
  expect(diff({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toEqual([])
})

it("gives back the state after the patch, also for keys that come and go", () => {
  roundTrip({ a: 1, b: { c: 2 } }, { a: 2, d: "new" })
  roundTrip({ grid: { selected: "a", rows: [{ id: "a" }] } }, { grid: { rows: [{ id: "a", title: "new" }] } })
  roundTrip({ list: [1, 2, 3] }, { list: [1, 2] })
  roundTrip({}, { "a/b": { "c~d": 1 } })
})

it("changes one item of a list of the same length, and not the whole list", () => {
  const before = { rows: [{ id: "a", t: 1 }, { id: "b", t: 1 }] }
  const after = { rows: [{ id: "a", t: 1 }, { id: "b", t: 2 }] }
  expect(diff(before, after)).toEqual([{ op: "replace", path: "/rows/1/t", value: 2 }])
})

it("takes a field that becomes undefined out, as JSON has no undefined", () => {
  expect(diff({ selected: "a" }, { selected: undefined })).toEqual([{ op: "remove", path: "/selected" }])
})

it("leaves the state that it gets as it was", () => {
  const before = { a: { b: 1 } }
  apply(before, [{ op: "replace", path: "/a/b", value: 2 }])
  expect(before).toEqual({ a: { b: 1 } })
})
