import { it } from "@effect/vitest"
import { Effect, Stream, SubscriptionRef } from "effect"
import { expect } from "vitest"
import { GANTT_ACTIONS, ganttModel } from "./gantt"
import { GRID_ACTIONS, gridModel } from "./grid"
import { KANBAN_ACTIONS, kanbanModel } from "./kanban"
import { connectHost, type HostMessage, memoryChannel, type PluginMessage, remoteGantt, remoteGrid, remoteKanban, servePlugin } from "./remote"
import { checksum, partOf, uiState } from "./ui-state"
import { Problems } from "../ui/problems"

/** Lets the fibers of both sides run: a message goes through a few of them. */
const settle = Effect.forEach(Array.from({ length: 30 }), () => Effect.yieldNow, { discard: true })

type Issue = { readonly id: string; readonly status: string }

/** A plugin with a Grid, a Kanban and a Gantt, and a page connected to it, in one process. */
const both = Effect.gen(function* () {
  const [pluginEnd, hostEnd] = yield* memoryChannel<HostMessage, PluginMessage>()
  const ui = yield* uiState
  const grid = yield* gridModel({ columns: [{ id: "title", header: "Title" }], rows: [{ id: "a" }, { id: "b" }] })
  const kanban = yield* kanbanModel<Issue>({
    rows: [{ id: "x", status: "todo" }, { id: "y", status: "doing" }],
    field: "status",
    columns: [{ id: "todo", label: "To do" }, { id: "doing", label: "Doing", limit: 1, strictLimit: true }]
  })
  const gantt = yield* ganttModel({ tasks: [] })
  yield* ui.register("grid", partOf(grid, GRID_ACTIONS))
  yield* ui.register("kanban", partOf(kanban, KANBAN_ACTIONS))
  yield* ui.register("gantt", partOf(gantt, GANTT_ACTIONS))
  const host = yield* connectHost(hostEnd)
  yield* servePlugin(ui, pluginEnd)
  yield* settle
  return { ui, host, grid, kanban, gantt }
})

it.effect("gives the page a copy of the state, with the same checksum as the plugin", () =>
  Effect.gen(function* () {
    const { ui, host } = yield* both
    const copy = yield* SubscriptionRef.get(host.document)
    expect(checksum(copy)).toBe((yield* ui.full).hash)
    expect(Object.keys(copy).sort()).toEqual(["gantt", "grid", "kanban"])
  }).pipe(Effect.scoped))

it.effect("runs an action of the page in the plugin, and the change comes back to the remote model", () =>
  Effect.gen(function* () {
    const { host, grid } = yield* both
    const remote = yield* remoteGrid(host, "grid")
    expect(yield* SubscriptionRef.get(remote.rows)).toEqual([{ id: "a" }, { id: "b" }])
    yield* remote.select("b")
    yield* remote.sortBy("title", "desc")
    yield* settle
    expect((yield* grid.snapshot).selected).toBe("b")
    expect(yield* SubscriptionRef.get(remote.selected)).toBe("b")
    expect(yield* SubscriptionRef.get(remote.sort)).toEqual({ column: "title", dir: "desc" })
  }).pipe(Effect.scoped))

it.effect("runs an action with no arguments, such as a zoom of the Gantt", () =>
  Effect.gen(function* () {
    const { host, gantt } = yield* both
    const remote = yield* remoteGantt(host, "gantt")
    yield* remote.zoomOut
    yield* remote.addTask("New", new Date(2026, 10, 17))
    yield* settle
    expect((yield* gantt.snapshot).zoom).toBe("week")
    expect((yield* SubscriptionRef.get(remote.tasks)).map((task) => task.start)).toEqual(["2026-11-17"])
  }).pipe(Effect.scoped))

it.effect("gives the old value again in the page when the plugin refuses an action", () =>
  Effect.gen(function* () {
    const { host } = yield* both
    const remote = yield* remoteKanban<Issue>(host, "kanban")
    const seen: Array<ReadonlyArray<Issue>> = []
    yield* SubscriptionRef.changes(remote.rows).pipe(Stream.runForEach((rows) => Effect.sync(() => void seen.push(rows))), Effect.forkScoped)
    yield* settle
    // DOING is full, with a strict limit: the plugin refuses the move.
    yield* remote.move("x", "doing")
    yield* settle
    expect(seen.length).toBe(2)
    expect(seen[1]!.find((row) => row.id === "x")?.status).toBe("todo")
  }).pipe(Effect.scoped))

it.effect("refuses an action with an id or a name that the plugin does not have", () =>
  Effect.gen(function* () {
    const { ui } = yield* both
    expect(yield* ui.run("nothing", "select", ["a"])).toBe(false)
    expect(yield* ui.run("grid", "snapshot", [])).toBe(false)
    expect(yield* ui.run("grid", "select", ["a"])).toBe(true)
    expect(yield* ui.run("grid", "select", ["lost"])).toBe(false)
  }).pipe(Effect.scoped))

it.effect("gives an action of the page undefined again where JSON made it null", () =>
  Effect.gen(function* () {
    const { host, grid } = yield* both
    yield* grid.select("a")
    yield* settle
    yield* host.act("grid", "select", [null])
    yield* settle
    expect((yield* grid.snapshot).selected).toBe(undefined)
  }).pipe(Effect.scoped))

it.effect("refuses a state that does not pass the Schema of its kind, and the other parts go on", () =>
  Effect.gen(function* () {
    const reports: Array<string> = []
    const [pluginEnd, hostEnd] = yield* memoryChannel<HostMessage, PluginMessage>()
    const host = yield* connectHost(hostEnd)
    const good = { grid: { selected: "a", filters: {}, rows: [{ id: "a" }] }, gantt: { zoom: "week", tasks: [] } }
    yield* pluginEnd.send({ _tag: "full", seq: 1, state: good, hash: checksum(good) })
    yield* settle
    const grid = yield* remoteGrid(host, "grid").pipe(Effect.provideService(Problems, { report: (where) => Effect.sync(() => void reports.push(where)) }))
    const gantt = yield* remoteGantt(host, "gantt")
    // The grid gets a selected row that is a number, and a zoom of the Gantt changes.
    const bad = { grid: { selected: 5, filters: {}, rows: [{ id: "a" }] }, gantt: { zoom: "month", tasks: [] } }
    yield* pluginEnd.send({ _tag: "full", seq: 2, state: bad, hash: checksum(bad) })
    yield* settle
    expect(yield* SubscriptionRef.get(grid.selected)).toBe("a")
    expect(reports).toEqual(["The state of grid from the plugin"])
    expect(yield* SubscriptionRef.get(gantt.zoom)).toBe("month")
  }).pipe(Effect.scoped))
