import { it } from "@effect/vitest"
import { Effect, Fiber, Stream } from "effect"
import { expect } from "vitest"
import { Dialogs, layerDialogsPlugin } from "./dialogs"
import { connectHost, type HostMessage, memoryChannel, type PluginMessage, servePlugin } from "./remote"
import { type AskMessage, MAX_OPEN_ASKS, UiState, uiState } from "./ui-state"

const settle = Effect.forEach(Array.from({ length: 30 }), () => Effect.yieldNow, { discard: true })

/** A plugin and a page over a channel in memory: the plugin asks with `Dialogs`, and the page gets each question. */
const pair = Effect.gen(function* () {
  const [pluginEnd, hostEnd] = yield* memoryChannel<HostMessage, PluginMessage>()
  const ui = yield* uiState
  const page = yield* connectHost(hostEnd)
  yield* servePlugin(ui, pluginEnd)
  const asked: Array<AskMessage> = []
  yield* page.asks.pipe(Stream.runForEach((ask) => Effect.sync(() => asked.push(ask))), Effect.forkScoped({ startImmediately: true }))
  const dialogs = yield* Effect.provide(Effect.service(Dialogs), layerDialogsPlugin).pipe(Effect.provideService(UiState, ui))
  return { page, dialogs, asked }
})

it.effect("asks a confirm of the page, and gives the answer of the user to the plugin", () =>
  Effect.gen(function* () {
    const { page, dialogs, asked } = yield* pair
    const answer = yield* dialogs.confirm({ text: "Delete the note?", buttons: ["Delete", "Keep"] }).pipe(Effect.forkScoped)
    yield* settle
    expect(asked).toEqual([{ _tag: "ask", n: 1, kind: "confirm", options: { text: "Delete the note?", buttons: ["Delete", "Keep"] } }])
    yield* page.reply(1, true)
    expect(yield* Fiber.join(answer)).toBe(true)
  }).pipe(Effect.scoped))

it.effect("sends a message with no wait, and answers no at once to a confirm over the limit", () =>
  Effect.gen(function* () {
    const { dialogs, asked } = yield* pair
    yield* dialogs.message({ text: "Saved" })
    for (let i = 0; i < MAX_OPEN_ASKS; i++) yield* dialogs.confirm({ text: `Question ${i}` }).pipe(Effect.forkScoped)
    yield* settle
    expect(yield* dialogs.confirm({ text: "One more" })).toBe(false)
    yield* settle
    expect(asked.map((ask) => ask.kind)).toEqual(["message", "confirm", "confirm", "confirm"])
  }).pipe(Effect.scoped))
