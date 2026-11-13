import { it } from "@effect/vitest"
import { Effect, Fiber, Stream, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "@dhtmlx/vault/codebase/vault.min.css"
import { Browser, setFacts } from "./browser"
import { alive, Host } from "./host"
import { vault } from "./vault"
import { run, settle } from "./wx-test"

const fileItem = (name: string, text: string) => {
  const file = new File([text], name, { type: "text/plain" })
  return { file, name, size: file.size, status: "queue", progress: 0 }
}

it.live("lists the files that are added, and keeps `files` the same as the list", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const made = yield* vault()
    yield* settle
    expect(yield* SubscriptionRef.get(made.files)).toEqual([])

    made.vault.data.add(fileItem("notes.txt", "hello") as never)
    made.vault.data.add(fileItem("plan.txt", "a longer text") as never)
    yield* settle
    const files = yield* SubscriptionRef.get(made.files)
    expect(files.map((one) => one.name)).toEqual(["notes.txt", "plan.txt"])
    expect(files[0]?.size).toBe(5)
    expect(files[0]?.status).toBe("queue")
    expect(files[0]?.file?.name).toBe("notes.txt")
    expect(host.textContent).toContain("notes.txt")

    made.vault.data.remove(files[0]!.id)
    yield* settle
    expect((yield* SubscriptionRef.get(made.files)).map((one) => one.name)).toEqual(["plan.txt"])
    expect(host.textContent).not.toContain("notes.txt")
    expect((yield* SubscriptionRef.get(alive)).get("vault")).toBe(1)
  })))

it.live("gives an uploaded file and a failed upload as streams", () =>
  run(Effect.gen(function* () {
    const made = yield* vault()
    yield* settle
    const uploaded = yield* made.uploaded.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    const failed = yield* made.failed.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* Effect.yieldNow
    // What the uploader says when a request ends.
    made.vault.uploader.events.fire("uploadfile" as never, [{ id: "1", ...fileItem("ok.txt", "x"), status: "uploaded", progress: 1 }] as never)
    made.vault.uploader.events.fire("uploadfail" as never, [{ id: "2", ...fileItem("bad.txt", "x"), status: "failed" }] as never)
    expect((yield* Fiber.join(uploaded)).map((one) => [one.name, one.status])).toEqual([["ok.txt", "uploaded"]])
    expect((yield* Fiber.join(failed)).map((one) => [one.name, one.status])).toEqual([["bad.txt", "failed"]])
  })))

it.live("follows the dark mode of the Browser", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    yield* vault()
    yield* settle
    expect(host.getAttribute("data-dhx-theme")).toBe("light")
    yield* setFacts(browser, { dark: true })
    yield* settle
    expect(host.getAttribute("data-dhx-theme")).toBe("dark")
  })))
