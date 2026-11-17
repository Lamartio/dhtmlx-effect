import { it } from "@effect/vitest"
import { Effect, Fiber, Stream } from "effect"
import { expect } from "vitest"
import { filePickerModel, type PickedFile, vaultModel } from "./files"

const file = (id: string, text: string, size = text.length): PickedFile => ({ id, name: `${id}.txt`, size, type: "text/plain", bytes: new TextEncoder().encode(text).buffer as ArrayBuffer })

it.effect("adds a file to the vault with its bytes, and refuses one that is too large, cut short, or there already", () =>
  Effect.gen(function* () {
    const model = yield* vaultModel({ maxSize: 10, history: 10 })
    const got = yield* model.added.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* Effect.yieldNow
    expect(yield* model.add(file("big", "more than ten"))).toBe(false)
    expect(yield* model.add(file("short", "abc", 5))).toBe(false)
    expect(yield* model.add(file("notes", "hello"))).toBe(true)
    expect(yield* model.add(file("notes", "hello"))).toBe(false)
    expect((yield* model.snapshot).files).toEqual([{ id: "notes", name: "notes.txt", size: 5, status: "queue", progress: 0 }])
    expect(new TextDecoder().decode([...(yield* Fiber.join(got))][0]!.bytes)).toBe("hello")
    // The history keeps what the file is, not its bytes.
    expect(JSON.stringify(yield* model.recent)).not.toContain("bytes")
  }).pipe(Effect.scoped))

it.effect("removes a file that is there, and refuses one that is not", () =>
  Effect.gen(function* () {
    const model = yield* vaultModel({ files: [{ id: "a", name: "a.txt", size: 1, status: "uploaded", progress: 1 }] })
    expect(yield* model.remove("b")).toBe(false)
    expect(yield* model.remove("a")).toBe(true)
    expect((yield* model.snapshot).files).toEqual([])
  }).pipe(Effect.scoped))

it.effect("gives a picked file to the plugin, and refuses one that is too large", () =>
  Effect.gen(function* () {
    const model = yield* filePickerModel({ maxSize: 4 })
    const got = yield* model.picked.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* Effect.yieldNow
    expect(yield* model.pick(file("big", "hello"))).toBe(false)
    expect(yield* model.pick(file("ok", "hi"))).toBe(true)
    expect([...(yield* Fiber.join(got))].map((one) => one.name)).toEqual(["ok.txt"])
  }).pipe(Effect.scoped))
