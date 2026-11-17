import { Effect, Ref, Scope, Stream, SubscriptionRef } from "effect"

/**
 * The headless half of a widget: its input, its state, the actions of the user and the events that
 * go out, as plain Effects with no DHTMLX. A test calls the actions and reads the state, with no
 * page. The renderer (in `src/ui`) puts the state into the DHTMLX widget, and turns each event of
 * the widget into an action. The model holds intent, not what DHTMLX works out from it: DHTMLX
 * keeps its own state, and the two stay in step as well as they can.
 */

/** A value that an option takes: fixed, in a `SubscriptionRef` that both sides share, or as a `Stream`. */
export type Input<A> = A | SubscriptionRef.SubscriptionRef<A> | Stream.Stream<A>

/**
 * The `SubscriptionRef` of an input. A ref is used as it is, so the caller and the model share it.
 * A stream sets a new ref with each value, for the life of the scope, and starts at `initial`.
 */
export const input = <A>(source: Input<A> | undefined, initial: A): Effect.Effect<SubscriptionRef.SubscriptionRef<A>, never, Scope.Scope> =>
  Effect.gen(function* () {
    if (SubscriptionRef.isSubscriptionRef(source)) return source as SubscriptionRef.SubscriptionRef<A>
    if (!Stream.isStream(source)) return yield* SubscriptionRef.make(source === undefined ? initial : (source as A))
    const ref = yield* SubscriptionRef.make(initial)
    yield* (source as Stream.Stream<A>).pipe(Stream.runForEach((value) => SubscriptionRef.set(ref, value)), Effect.forkScoped)
    return ref
  })

/**
 * One line of the history of a model: a value that came in on an input, an action of the user, or
 * an event that went out. An action that changes a value shows as the action, then as the input.
 */
export type Entry = { readonly _tag: "input" | "action" | "event"; readonly name: string; readonly value: unknown }

/** The last `size` entries. With a size of 0 it keeps nothing. */
export const history = (size: number) =>
  Effect.gen(function* () {
    const entries = yield* Ref.make<ReadonlyArray<Entry>>([])
    return {
      record: (entry: Entry) => (size <= 0 ? Effect.void : Ref.update(entries, (all) => [...all, entry].slice(-size))),
      // A change of an input is recorded by a fiber of its own: let it run first.
      recent: Effect.yieldNow.pipe(Effect.andThen(Ref.get(entries)))
    }
  })

/** Records each value of `ref` as an input named `name`, for the life of the scope. */
export const recordInput = <A>(log: { readonly record: (entry: Entry) => Effect.Effect<void> }, name: string, ref: SubscriptionRef.SubscriptionRef<A>) =>
  SubscriptionRef.changes(ref).pipe(
    Stream.runForEach((value) => log.record({ _tag: "input", name, value })),
    // At once, so it listens before the model is given back and misses no change.
    Effect.forkScoped({ startImmediately: true }),
    Effect.asVoid
  )

/** A value as JSON that does not depend on the order of the keys: the same state gives the same text. */
export const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item) ?? "undefined"

/** The SHA-256 of `stableJson(value)`, as hex: one short line to compare a state before and after. */
export const hashOf = (value: unknown) =>
  Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableJson(value)))).pipe(
    Effect.map((digest) => [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""))
  )

/**
 * Runs the action `name` of a model with `args`, as a message from another frame asks: one way to
 * reach each action by its name. `actions` is the list of the model type, such as `GRID_ACTIONS`.
 * Gives false for a name that is not in the list, and runs nothing then.
 */
export const dispatch = <M extends object>(model: M, actions: ReadonlyArray<keyof M & string>, name: string, args: ReadonlyArray<unknown> = []): Effect.Effect<boolean> => {
  if (!(actions as ReadonlyArray<string>).includes(name)) return Effect.succeed(false)
  const action = model[name as keyof M] as unknown
  const run = typeof action === "function" ? (action as (...all: ReadonlyArray<unknown>) => unknown)(...args) : action
  return Effect.isEffect(run) ? Effect.as(run as Effect.Effect<unknown>, true) : Effect.succeed(false)
}

/** One `void` on each change of any of the refs (and one for each at the start): the signal that a state may have changed. */
export const changesOf = (...refs: ReadonlyArray<SubscriptionRef.SubscriptionRef<any>>): Stream.Stream<void> =>
  Stream.mergeAll(refs.map((ref) => SubscriptionRef.changes(ref)), { concurrency: "unbounded" }).pipe(Stream.as(undefined))
