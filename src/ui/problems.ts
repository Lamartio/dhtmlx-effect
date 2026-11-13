import { Cause, Context, Effect, Stream } from "effect"

/**
 * Where an error of a widget goes: never nowhere. A fiber of a widget that dies must say
 * so. The default logs it; `mount` gives one that also shows a bar in the island, so the widget does
 * not stop in silence. A test can give one that keeps the reports.
 */
/** Takes a report of one problem: where it was, and its cause. */
export type ProblemSink = { readonly report: (where: string, cause: Cause.Cause<unknown>) => Effect.Effect<void> }

export const Problems = Context.Reference<ProblemSink>(
  "dhtmlx-effect/Problems",
  { defaultValue: () => ({ report: (where, cause) => Effect.logError(`${where} stopped`, cause) }) }
)

/** The words of a cause for a person: the message of the first error, else the name of the problem. */
export const messageOf = (cause: Cause.Cause<unknown>) => {
  const error = Cause.squash(cause)
  return error instanceof Error ? error.message : String(error)
}

/**
 * Runs `effect` and reports a failure or a defect, then stops. An interrupt is the normal end of a
 * scope, so it is not a problem. Each fiber of a widget goes through here.
 */
export const reporting = (where: string) => <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.onError((cause) =>
      Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.flatMap(Problems, (problems) => problems.report(where, cause)))
  )

/** Runs `f` on each value of the stream for the life of the scope, in a fiber that reports when it dies. */
export const forEachReported = <A, E, R, R2>(where: string, stream: Stream.Stream<A, E, R>, f: (value: A) => Effect.Effect<void, never, R2>) =>
  stream.pipe(Stream.runForEach(f), reporting(where), Effect.forkScoped)

/**
 * A function that DHTMLX calls, such as an event handler. A throw in it would go into the code of
 * DHTMLX, or nowhere: it is reported instead, and the handler gives undefined.
 */
export const reportedCallback = Effect.fnUntraced(function* <Args extends ReadonlyArray<unknown>, B>(where: string, f: (...args: Args) => B) {
  const problems = yield* Problems
  return (...args: Args): B | undefined => {
    try {
      return f(...args)
    } catch (error) {
      Effect.runSync(problems.report(where, Cause.die(error)))
      return undefined
    }
  }
})
