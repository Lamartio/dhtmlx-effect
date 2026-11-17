import { Context, Deferred, Effect, PubSub, Queue, Ref, type Scope, Stream } from "effect"
import { dispatch, stableJson } from "./model"
import { apply, diff, type Patch, toJson } from "./patch"

/**
 * The state of a whole UI as one JSON document, for a renderer in another frame. Each model registers
 * under an id, and the document is `{ [id]: snapshot }`. A change goes out as a patch: all the
 * changes of one tick in one message, with a sequence number and the hash of the state after it.
 */

/**
 * A short check of a state, to see that the copy on the other side is the same: cyrb53 on
 * `stableJson`. It is not for safety, and it runs in the same tick, as `crypto.subtle` does not.
 */
export const checksum = (state: unknown): string => {
  const text = stableJson(state)
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

/** The first message, and the answer when the other side asks again: the whole state. */
export type FullMessage = { readonly _tag: "full"; readonly seq: number; readonly state: unknown; readonly hash: string }
/** A change: the patch from the state of `seq - 1`. */
export type PatchMessage = { readonly _tag: "patch"; readonly seq: number; readonly patch: Patch; readonly hash: string }
export type StateMessage = FullMessage | PatchMessage
/** The plugin asks the user something: a `confirm` and an `alert` wait for the `reply` of `n`, a `message` does not. */
export type AskMessage = { readonly _tag: "ask"; readonly n: number; readonly kind: "confirm" | "alert" | "message"; readonly options: Readonly<Record<string, unknown>> }

/** The most questions of a plugin that wait at one time. One more is answered at once: no. */
export const MAX_OPEN_ASKS = 3

/** What the registry needs of a model: its state now, a signal when it may have changed, and its actions by name. */
export type Part = {
  readonly snapshot: Effect.Effect<unknown>
  readonly changes: Stream.Stream<void>
  readonly dispatch?: (name: string, args: ReadonlyArray<unknown>) => Effect.Effect<boolean>
}

/** A model as a part, with the actions of its type: `partOf(grid, GRID_ACTIONS)`. */
export const partOf = <M extends Part>(model: M, actions: ReadonlyArray<keyof M & string>): Part => ({
  snapshot: model.snapshot,
  changes: model.changes,
  dispatch: (name, args) => dispatch(model, actions, name, args)
})

export class UiState extends Context.Service<UiState, {
  /** Puts a model in the document under `id` for the life of the scope. An id that is there already is a defect. */
  readonly register: (id: string, part: Part) => Effect.Effect<void, never, Scope.Scope>
  /** Runs the action `name` of the part `id`. Gives false for an id or a name that is not there, and when the action refuses. */
  readonly run: (id: string, name: string, args: ReadonlyArray<unknown>) => Effect.Effect<boolean>
  /** The whole state as it was last sent. */
  readonly full: Effect.Effect<FullMessage>
  /** Each patch and each question after the subscribe. Take `full` after the subscribe, and drop the patches it has already. */
  readonly messages: Stream.Stream<PatchMessage | AskMessage>
  /** Asks the user in the page, and gives the answer: true for the first button of a confirm. A message gives true at once. */
  readonly ask: (kind: AskMessage["kind"], options: object) => Effect.Effect<boolean>
  /** The answer of the page to the question `n`. */
  readonly reply: (n: number, answer: boolean) => Effect.Effect<void>
}>()("dhtmlx-effect/UiState") {}

/** A registry for the life of the scope. */
export const uiState = Effect.gen(function* () {
  const parts = new Map<string, Part>()
  const signal = yield* Queue.unbounded<void>()
  const out = yield* Effect.acquireRelease(PubSub.unbounded<PatchMessage | AskMessage>(), PubSub.shutdown)
  const open = new Map<number, Deferred.Deferred<boolean>>()
  let asked = 0
  const sent = yield* Ref.make<{ readonly seq: number; readonly state: unknown; readonly hash: string }>({ seq: 0, state: {}, hash: checksum({}) })
  const flush = Effect.gen(function* () {
    yield* Queue.take(signal)
    // The other changes of this tick come in first, so they go in the same message.
    yield* Effect.yieldNow
    yield* Queue.clear(signal)
    const state: Record<string, unknown> = {}
    for (const [id, part] of parts) state[id] = toJson(yield* part.snapshot)
    const last = yield* Ref.get(sent)
    const patch = diff(last.state, state)
    if (patch.length === 0) return
    const next = { seq: last.seq + 1, state, hash: checksum(state) }
    yield* Ref.set(sent, next)
    yield* PubSub.publish(out, { _tag: "patch" as const, seq: next.seq, patch, hash: next.hash })
  })
  yield* Effect.forkScoped(Effect.forever(flush))
  return UiState.of({
    register: (id, part) =>
      Effect.gen(function* () {
        if (parts.has(id)) return yield* Effect.die(new Error(`Two parts of the UI have the id ${id}`))
        yield* Effect.acquireRelease(
          Effect.sync(() => parts.set(id, part)),
          () => Effect.sync(() => parts.delete(id)).pipe(Effect.andThen(Queue.offer(signal, undefined)))
        )
        yield* part.changes.pipe(Stream.runForEach(() => Queue.offer(signal, undefined)), Effect.forkScoped({ startImmediately: true }))
      }),
    run: (id, name, args) => parts.get(id)?.dispatch?.(name, args) ?? Effect.succeed(false),
    full: Effect.map(Ref.get(sent), ({ seq, state, hash }) => ({ _tag: "full" as const, seq, state, hash })),
    messages: Stream.fromPubSub(out),
    ask: (kind, options) =>
      Effect.gen(function* () {
        const n = ++asked
        if (kind === "message") return yield* PubSub.publish(out, { _tag: "ask", n, kind, options: { ...options } }).pipe(Effect.as(true))
        if (open.size >= MAX_OPEN_ASKS) return false
        const answer = yield* Deferred.make<boolean>()
        open.set(n, answer)
        yield* PubSub.publish(out, { _tag: "ask", n, kind, options: { ...options } })
        // ponytail: an interrupt here forgets the question, and the dialog stays open in the page; send a close if that shows.
        return yield* Deferred.await(answer).pipe(Effect.ensuring(Effect.sync(() => open.delete(n))))
      }),
    reply: (n, answer) => Effect.suspend(() => (open.has(n) ? Effect.asVoid(Deferred.succeed(open.get(n)!, answer)) : Effect.void))
  })
})

/** The copy of the state on the other side: the last `seq` that it has, and the state. */
export type Mirror = { readonly seq: number; readonly state: unknown }

/**
 * The copy after one message. A patch that it has already changes nothing. A patch that skips a
 * `seq`, or a state with another hash than the sender's, gives `resync`: then ask for `full` again.
 */
export const receive = (mirror: Mirror | undefined, message: StateMessage): Mirror | "resync" => {
  if (message._tag === "full") return checksum(message.state) === message.hash ? { seq: message.seq, state: message.state } : "resync"
  if (mirror === undefined) return "resync"
  if (message.seq <= mirror.seq) return mirror
  if (message.seq !== mirror.seq + 1) return "resync"
  const state = apply(mirror.state, message.patch)
  return checksum(state) === message.hash ? { seq: message.seq, state } : "resync"
}
