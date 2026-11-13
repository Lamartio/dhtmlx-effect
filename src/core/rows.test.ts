import { expect, it } from "vitest"
import { diffRows, sameRow } from "./rows"

type Note = { readonly id: string; readonly title: string; readonly parent?: string }
const A: Note = { id: "a", title: "Alpha" }
const B: Note = { id: "b", title: "Beta" }
const C: Note = { id: "c", title: "Gamma" }

it("gives no changes for the same rows, also when the array and the rows are new", () => {
  expect(diffRows([A, B], [{ ...A }, { ...B }])).toEqual([])
})

it("compares rows field by field", () => {
  expect(sameRow(A, { ...A })).toBe(true)
  expect(sameRow(A, { ...A, title: "Other" })).toBe(false)
  expect(sameRow(A, { ...A, parent: "x" })).toBe(false)
})

it("gives an update with the whole row when one field changed", () => {
  expect(diffRows([A, B], [A, { ...B, title: "Beta 2" }])).toEqual([{ _tag: "update", row: { ...B, title: "Beta 2" } }])
})

it("gives a remove and an add with the index among the siblings, and no move for the rows after them", () => {
  expect(diffRows([A, B, C], [B, { id: "d", title: "Delta" }, C])).toEqual([
    { _tag: "remove", id: "a" },
    { _tag: "add", row: { id: "d", title: "Delta" }, index: 1 }
  ])
})

it("gives the fewest moves for a swap, and a move to another parent", () => {
  expect(diffRows([A, B, C], [C, A, B])).toEqual([{ _tag: "move", id: "c", parent: undefined, index: 0 }])
  expect(diffRows([A, B, C], [A, B, { ...C, parent: "a" }])).toEqual([
    { _tag: "move", id: "c", parent: "a", index: 0 },
    { _tag: "update", row: { ...C, parent: "a" } }
  ])
})

it("puts a new parent before its new child", () => {
  const ops = diffRows([], [C, { ...A, parent: "c" }])
  expect(ops.map((op) => (op._tag === "add" ? op.row.id : op._tag))).toEqual(["c", "a"])
})

it("finds one change in 10,000 rows in a few milliseconds", () => {
  const rows: ReadonlyArray<Note> = Array.from({ length: 10_000 }, (_, n) => ({ id: `r${n}`, title: `Row ${n}` }))
  const changed = rows.map((row) => (row.id === "r5000" ? { ...row, title: "Changed" } : row))
  const start = performance.now()
  const ops = diffRows(rows, changed)
  expect(performance.now() - start).toBeLessThan(50)
  expect(ops).toEqual([{ _tag: "update", row: { id: "r5000", title: "Changed" } }])
})
