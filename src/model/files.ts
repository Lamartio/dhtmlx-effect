import { Effect, PubSub, Schema, type Scope, Stream, SubscriptionRef } from "effect"
import { changesOf, type Entry, history, type Input, input, recordInput } from "./model"

/**
 * The models of a Vault and of a file picker. A file goes to the plugin with its bytes as an
 * `ArrayBuffer`: over a `MessagePort` it is transferred, not copied. A file larger than `maxSize`
 * is refused, and the page does not read it.
 */

/** A file that the user gave, with its bytes. */
export type PickedFile = { readonly id: string; readonly name: string; readonly size: number; readonly type: string; readonly bytes: ArrayBuffer }

/** One file in a Vault, without its bytes: `queue`, `inprogress`, `uploaded` or `failed`, and its progress from 0 to 1. */
export type VaultEntry = { readonly id: string; readonly name: string; readonly size: number; readonly status: string; readonly progress: number }

export const VaultEntrySchema = Schema.Struct({ id: Schema.String, name: Schema.String, size: Schema.Number, status: Schema.String, progress: Schema.Number })

/** The largest file, in bytes, unless a node gives another `maxSize`: 20 MB. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024

/** True when the bytes are all there, and not more than `max`. */
export const complete = (file: PickedFile, max: number) => file.bytes instanceof ArrayBuffer && file.bytes.byteLength === file.size && file.size <= max

const described = ({ bytes: _bytes, ...rest }: PickedFile) => rest

export type VaultModel = {
  readonly files: SubscriptionRef.SubscriptionRef<ReadonlyArray<VaultEntry>>
  /** Each file that the model took, with its bytes, for the plugin to keep or to send on. */
  readonly added: Stream.Stream<PickedFile>
  /** A file that the user added. A file with an id that is there, or that is not `complete`, is refused. */
  readonly add: (file: PickedFile) => Effect.Effect<boolean>
  /** A file that the user removed. An id that is not there is refused. */
  readonly remove: (id: string) => Effect.Effect<boolean>
  readonly recent: Effect.Effect<ReadonlyArray<Entry>>
  readonly snapshot: Effect.Effect<{ readonly files: ReadonlyArray<VaultEntry> }>
  readonly changes: Stream.Stream<void>
}

/** The actions of a `VaultModel`, by name. */
export const VAULT_ACTIONS = ["add", "remove"] as const satisfies ReadonlyArray<keyof VaultModel>

export const vaultModel = (options: { readonly files?: Input<ReadonlyArray<VaultEntry>>; readonly maxSize?: number; readonly history?: number } = {}): Effect.Effect<VaultModel, never, Scope.Scope> =>
  Effect.gen(function* () {
    const files = yield* input<ReadonlyArray<VaultEntry>>(options.files, [])
    const added = yield* Effect.acquireRelease(PubSub.unbounded<PickedFile>(), PubSub.shutdown)
    const log = yield* history(options.history ?? 0)
    const max = options.maxSize ?? MAX_FILE_BYTES
    yield* recordInput(log, "files", files)
    return {
      files,
      added: Stream.fromPubSub(added),
      add: (file) =>
        Effect.gen(function* () {
          const all = yield* SubscriptionRef.get(files)
          if (!complete(file, max) || all.some((each) => each.id === file.id)) return false
          yield* log.record({ _tag: "action", name: "add", value: described(file) })
          yield* SubscriptionRef.set(files, [...all, { id: file.id, name: file.name, size: file.size, status: "queue", progress: 0 }])
          yield* PubSub.publish(added, file)
          yield* log.record({ _tag: "event", name: "added", value: described(file) })
          return true
        }),
      remove: (id) =>
        Effect.gen(function* () {
          const all = yield* SubscriptionRef.get(files)
          if (!all.some((each) => each.id === id)) return false
          yield* log.record({ _tag: "action", name: "remove", value: id })
          yield* SubscriptionRef.set(files, all.filter((each) => each.id !== id))
          return true
        }),
      recent: log.recent,
      snapshot: Effect.map(SubscriptionRef.get(files), (now) => ({ files: now })),
      changes: changesOf(files)
    }
  })

export type FilePickerModel = {
  /** Each file that the model took, with its bytes. */
  readonly picked: Stream.Stream<PickedFile>
  /** A file that the user picked. A file that is not `complete` is refused. */
  readonly pick: (file: PickedFile) => Effect.Effect<boolean>
  readonly recent: Effect.Effect<ReadonlyArray<Entry>>
  readonly snapshot: Effect.Effect<Record<string, never>>
  readonly changes: Stream.Stream<void>
}

/** The actions of a `FilePickerModel`, by name. */
export const FILE_PICKER_ACTIONS = ["pick"] as const satisfies ReadonlyArray<keyof FilePickerModel>

export const filePickerModel = (options: { readonly maxSize?: number; readonly history?: number } = {}): Effect.Effect<FilePickerModel, never, Scope.Scope> =>
  Effect.gen(function* () {
    const picked = yield* Effect.acquireRelease(PubSub.unbounded<PickedFile>(), PubSub.shutdown)
    const log = yield* history(options.history ?? 0)
    const max = options.maxSize ?? MAX_FILE_BYTES
    return {
      picked: Stream.fromPubSub(picked),
      pick: (file) =>
        Effect.gen(function* () {
          if (!complete(file, max)) return false
          yield* log.record({ _tag: "action", name: "pick", value: described(file) })
          yield* PubSub.publish(picked, file)
          yield* log.record({ _tag: "event", name: "picked", value: described(file) })
          return true
        }),
      recent: log.recent,
      snapshot: Effect.succeed({}),
      // No state: the document has the part with no fields.
      changes: Stream.make(undefined)
    }
  })
