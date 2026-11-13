import { setTheme, Vault } from "@dhtmlx/vault"
import { Effect, PubSub, Scope, Stream, SubscriptionRef } from "effect"
import { Browser, follow } from "./browser"
import { Host, resource } from "./host"
import { reportedCallback } from "./problems"

/** One file in the Vault: what it is, and how far its upload is. */
export type VaultFile = {
  readonly id: string
  readonly name: string
  readonly size: number
  /** `queue` before the upload, then `inprogress`, then `uploaded` or `failed`. */
  readonly status: string
  /** 0 to 1. */
  readonly progress: number
  /** The file itself, when the user picked it here. */
  readonly file?: File
}

export type VaultOptions = {
  /** Where the files go: the URL that takes the upload. With none, the Vault only lists the files. */
  readonly target?: string
  /** Sends a file as soon as the user adds it. Default: false, so the app decides with `vault.uploader.send()`. */
  readonly autosend?: boolean
  /** A list of rows, or a grid of tiles. Default: `list`. */
  readonly mode?: "list" | "grid"
  /** The bar with the buttons to add and to remove files. Default: true. */
  readonly toolbar?: boolean
}

const fileOf = (item: Record<string, unknown>): VaultFile => ({
  id: String(item["id"]),
  name: String(item["name"] ?? (item["file"] as File | undefined)?.name ?? ""),
  size: Number(item["size"] ?? (item["file"] as File | undefined)?.size ?? 0),
  status: String(item["status"] ?? "queue"),
  progress: Number(item["progress"] ?? 0),
  ...(item["file"] instanceof File ? { file: item["file"] } : {})
})

/**
 * A DHTMLX Vault in the host: the user adds files with a button or a drop, and sees them in a list
 * or a grid, with the progress of the upload. `files` is the list of now, to read. `uploaded` and
 * `failed` give each file when its upload ends. The theme follows `Browser.dark`.
 */
export const vault = (options: VaultOptions = {}) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const files = yield* SubscriptionRef.make<ReadonlyArray<VaultFile>>([])
    const uploaded = yield* Effect.acquireRelease(PubSub.unbounded<VaultFile>(), PubSub.shutdown)
    const failed = yield* Effect.acquireRelease(PubSub.unbounded<VaultFile>(), PubSub.shutdown)
    const view = yield* resource(
      "vault",
      () =>
        new Vault(host, {
          mode: (options.mode ?? "list") as never,
          toolbar: options.toolbar ?? true,
          uploader: { autosend: options.autosend ?? false, ...(options.target === undefined ? {} : { target: options.target }) }
        }),
      (view) => view.destructor()
    )
    const mirror = yield* reportedCallback("The Vault, on a change of its files", () => {
      Effect.runSync(SubscriptionRef.set(files, (view.data.serialize() as ReadonlyArray<Record<string, unknown>>).map(fileOf)))
    })
    const onUploaded = yield* reportedCallback("The Vault, on an uploaded file", (file: Record<string, unknown>) => {
      Effect.runSync(PubSub.publish(uploaded, fileOf(file)))
    })
    const onFailed = yield* reportedCallback("The Vault, on a failed upload", (file: Record<string, unknown>) => {
      Effect.runSync(PubSub.publish(failed, fileOf(file)))
    })
    const DATA = ["change", "afteradd", "afterremove", "removeall"] as const
    yield* resource(
      "listener",
      () => {
        for (const name of DATA) view.data.events.on(name as never, mirror as never)
        view.uploader.events.on("uploadfile" as never, onUploaded as never)
        view.uploader.events.on("uploadfail" as never, onFailed as never)
      },
      () => {
        for (const name of DATA) view.data.events.detach(name as never)
        view.uploader.events.detach("uploadfile" as never)
        view.uploader.events.detach("uploadfail" as never)
      }
    )
    yield* follow(browser.dark, (dark) => setTheme(dark ? "dark" : "light", host))
    return { vault: view, files, uploaded: Stream.fromPubSub(uploaded), failed: Stream.fromPubSub(failed) }
  }) as Effect.Effect<
    { readonly vault: Vault; readonly files: SubscriptionRef.SubscriptionRef<ReadonlyArray<VaultFile>>; readonly uploaded: Stream.Stream<VaultFile>; readonly failed: Stream.Stream<VaultFile> },
    never,
    Host | Browser | Scope.Scope
  >
