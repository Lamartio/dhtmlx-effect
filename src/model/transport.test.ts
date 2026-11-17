import { it } from "@effect/vitest"
import { Effect, Stream, SubscriptionRef } from "effect"
import { expect } from "vitest"
import { Problems } from "../ui/problems"
import { GRID_ACTIONS, gridModel } from "./grid"
import { connectHost, type HostMessage, type PluginMessage, remoteGrid, servePlugin } from "./remote"
import { HostMessageSchema, PluginMessageSchema, portChannel } from "./transport"
import { partOf, uiState } from "./ui-state"

/** Messages over a port take a turn of the event loop of Bun, not only of the fibers. */
const settle = Effect.promise(() => new Promise((done) => setTimeout(done, 20)))

/** Waits, in turns of the event loop, until `check` is true or two seconds are gone: a busy machine is slow. */
const until = (check: Effect.Effect<boolean>) =>
  Effect.gen(function* () {
    for (let i = 0; i < 200 && !(yield* check); i++) yield* settle
  })

it.live("joins a plugin and a page over a real MessageChannel", () =>
  Effect.gen(function* () {
    const { port1, port2 } = new MessageChannel()
    const ui = yield* uiState
    const grid = yield* gridModel({ columns: [{ id: "title", header: "Title" }], rows: [{ id: "a" }, { id: "b" }] })
    yield* ui.register("grid", partOf(grid, GRID_ACTIONS))
    const pluginEnd = yield* portChannel<HostMessage, PluginMessage>(port1, HostMessageSchema as never, "plugin")
    const hostEnd = yield* portChannel<PluginMessage, HostMessage>(port2, PluginMessageSchema as never, "page")
    const host = yield* connectHost(hostEnd)
    yield* servePlugin(ui, pluginEnd)
    yield* settle
    const remote = yield* remoteGrid(host, "grid")
    yield* remote.select("b")
    yield* until(Effect.map(SubscriptionRef.get(remote.selected), (selected) => selected === "b"))
    expect((yield* grid.snapshot).selected).toBe("b")
    expect(yield* SubscriptionRef.get(remote.selected)).toBe("b")
  }).pipe(Effect.scoped))

it.live("reports and drops a message that does not pass the Schema", () =>
  Effect.gen(function* () {
    const reports: Array<string> = []
    const { port1, port2 } = new MessageChannel()
    const channel = yield* portChannel<HostMessage, PluginMessage>(port1, HostMessageSchema as never, "The channel to the page").pipe(
      Effect.provideService(Problems, { report: (where) => Effect.sync(() => void reports.push(where)) })
    )
    const got: Array<HostMessage> = []
    yield* channel.messages.pipe(Stream.runForEach((message) => Effect.sync(() => void got.push(message))), Effect.forkScoped)
    port2.postMessage({ _tag: "action", n: 1, id: "grid", action: "select", args: ["a"] })
    port2.postMessage({ _tag: "action", n: "two", id: "grid" })
    port2.postMessage("<img src=x onerror=alert(1)>")
    yield* until(Effect.sync(() => reports.length === 2))
    expect(got).toEqual([{ _tag: "action", n: 1, id: "grid", action: "select", args: ["a"] }])
    expect(reports).toEqual(["The channel to the page", "The channel to the page"])
    port2.close()
  }).pipe(Effect.scoped))
