import { it } from "@effect/vitest"
import { Effect, Fiber, Option, Stream } from "effect"
import { expect } from "vitest"
import { acceptHost } from "../model/transport"

it.live("takes the port of the page from its own origin, and not from another", () =>
  Effect.gen(function* () {
    const wrong = yield* acceptHost("https://other.example").pipe(Effect.timeoutOption("150 millis"), Effect.forkScoped)
    const right = yield* acceptHost(location.origin).pipe(Effect.forkScoped)
    yield* Effect.yieldNow
    const { port1, port2 } = new MessageChannel()
    window.postMessage({ _tag: "dhtmlx-effect/connect" }, location.origin, [port2])
    const channel = yield* Fiber.join(right)
    const first = yield* channel.messages.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* Effect.yieldNow
    port1.postMessage({ _tag: "resync" })
    expect([...(yield* Fiber.join(first))]).toEqual([{ _tag: "resync" }])
    expect(Option.isNone(yield* Fiber.join(wrong))).toBe(true)
    port1.close()
  }).pipe(Effect.scoped))
