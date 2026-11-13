import { Cause, Context, Effect, Exit, Fiber, FiberHandle, Layer, Scheduler, Scope, Stream, SubscriptionRef } from "effect"
import { messageOf, type ProblemSink, Problems, reporting } from "./problems"
import { liveNow, onLive, track } from "../core/tally"
import { Browser } from "./browser"

/**
 * The element that a widget lives in. It replaces props and
 * children: a parent gives each child its own element with `Effect.provideService(Host, el)`.
 */
export class Host extends Context.Service<Host, HTMLElement>()("dhtmlx-effect/Host") {}

/** What a widget needs: a place in the page, the facts of the browser, and a scope for its life. */
export type Widget<A = unknown> = Effect.Effect<A, never, Host | Browser | Scope.Scope>

/**
 * The widgets that live now, by kind (from src/core/tally.ts). Each widget adds itself when it is made
 * and removes itself when its scope closes, so a test or a story can see that nothing stays behind.
 */
export const alive = Effect.runSync(SubscriptionRef.make<ReadonlyMap<string, number>>(liveNow()))
onLive((live) => Effect.runSync(SubscriptionRef.set(alive, live)))

/**
 * Makes a DHTMLX object for the life of the scope: `make` when the scope opens, `destroy` when it
 * closes. Children close before their parents, as scopes release in reverse order.
 */
export const resource = <A>(kind: string, make: () => A, destroy: (a: A) => void) =>
  Effect.acquireRelease(
    Effect.sync(() => ({ value: make(), gone: track(kind) })),
    ({ value, gone }) => Effect.sync(() => {
      // A destructor that throws still counts as gone, so the count does not lie; the throw is a defect.
      try {
        destroy(value)
      } finally {
        gone()
      }
    })
  ).pipe(Effect.map(({ value }) => value))

/** A child element in the host, for the life of the scope: the host of the widget that runs in it. */
export const child = (className = "") =>
  Effect.gen(function* () {
    const host = yield* Host
    return yield* resource(
      "element",
      () => {
        const element = document.createElement("div")
        element.className = className
        host.append(element)
        return element
      },
      (element) => element.remove()
    )
  })

/**
 * A column: each part gets its own element, from top to bottom. `grow` is the part that takes the
 * height that is left, for example a Gantt under a toolbar.
 */
export const column = <const Parts extends ReadonlyArray<Widget>>(parts: Parts, grow: number = parts.length - 1) =>
  Effect.gen(function* () {
    const host = yield* Host
    host.style.display = "flex"
    host.style.flexDirection = "column"
    host.style.minHeight = "0"
    const results = []
    for (const [index, part] of parts.entries()) {
      const element = yield* child(index === grow ? "dhxe-grow" : "dhxe-fixed")
      element.style.flex = index === grow ? "1 1 auto" : "0 0 auto"
      element.style.minHeight = "0"
      results.push(yield* Effect.provideService(part, Host, element))
    }
    return results as { -readonly [K in keyof Parts]: Parts[K] extends Widget<infer A> ? A : never }
  })

/**
 * Waits until the element is in the page. DHTMLX measures its host when it starts, and a story or a
 * React component gives the element to the page only after it was made.
 */
export const connected = (element: HTMLElement) =>
  Effect.callback<void>((resume) => {
    let frame = 0
    const check = () => {
      if (element.isConnected) resume(Effect.void)
      else frame = requestAnimationFrame(check)
    }
    check()
    return Effect.sync(() => cancelAnimationFrame(frame))
  })

/**
 * One part at a time, as tabs or modes: `show` closes the scope of the part before it, so its items
 * and listeners go, and runs the new part in a scope of its own.
 */
export const swap = Effect.gen(function* () {
  const handle = yield* FiberHandle.make<never, never>()
  return <R>(part: Effect.Effect<unknown, never, R | Scope.Scope>) =>
    FiberHandle.run(handle, Effect.scoped(part.pipe(Effect.andThen(Effect.never)))).pipe(Effect.asVoid)
})

/**
 * A part for each item of a list, keyed: what React does with `key`. A new key starts its part in a
 * scope of its own; a key that goes closes that scope; an item that changed goes into the
 * `SubscriptionRef` of its part, so the part changes in place and is not made again. New parts come
 * after the parts that are there.
 */
export const keyed = <A, K, R>(
  items: SubscriptionRef.SubscriptionRef<ReadonlyArray<A>>,
  key: (item: A) => K,
  part: (item: SubscriptionRef.SubscriptionRef<A>) => Effect.Effect<unknown, never, R>
) =>
  Effect.gen(function* () {
    const context = yield* Effect.context<Exclude<R, Scope.Scope>>()
    const parts = new Map<K, { readonly item: SubscriptionRef.SubscriptionRef<A>; readonly scope: Scope.Closeable }>()
    yield* Effect.addFinalizer(() => Effect.forEach([...parts.values()].reverse(), ({ scope }) => Scope.close(scope, Exit.void), { discard: true }))
    yield* SubscriptionRef.changes(items).pipe(
      Stream.runForEach((list) =>
        Effect.gen(function* () {
          const keys = new Set(list.map(key))
          for (const [k, { scope }] of parts) {
            if (keys.has(k)) continue
            parts.delete(k)
            yield* Scope.close(scope, Exit.void)
          }
          for (const value of list) {
            const known = parts.get(key(value))
            if (known !== undefined) {
              if ((yield* SubscriptionRef.get(known.item)) !== value) yield* SubscriptionRef.set(known.item, value)
              continue
            }
            const item = yield* SubscriptionRef.make(value)
            const scope = yield* Scope.make()
            parts.set(key(value), { item, scope })
            yield* part(item).pipe(Scope.provide(scope), Effect.provideContext(context as never)) as Effect.Effect<unknown>
          }
        })),
      reporting("A list of parts"),
      Effect.forkScoped
    )
  })

/**
 * The scheduler of a widget tree. The default one runs a busy fiber on in a later `setTimeout` when
 * it used up its budget of steps, so a change can reach the page after a paint. This one goes on in
 * a microtask: all the work of a change is done before the browser paints, as a React render is.
 * The price: a long loop in a widget blocks the page, as it would in React.
 */
export const uiScheduler: Scheduler.Scheduler = new Scheduler.MixedScheduler("sync")

/**
 * The problems of one island: each goes to the log, and to a bar at the top of the island,
 * so a widget never stops in silence. The bar says what stopped; the details are in the log.
 */
const errorBar = (element: HTMLElement): ProblemSink => {
  let bar: HTMLElement | undefined
  const seen = new Set<string>()
  return {
    report: (where, cause) =>
      Effect.logError(`${where} stopped`, cause).pipe(Effect.andThen(Effect.sync(() => {
        const line = `${where} stopped: ${messageOf(cause)}`
        if (seen.has(line)) return
        seen.add(line)
        if (bar === undefined || !bar.isConnected) {
          bar = document.createElement("div")
          bar.className = "dhxe-error"
          bar.setAttribute("role", "alert")
          element.prepend(bar)
        }
        const item = document.createElement("p")
        item.textContent = line
        bar.append(item)
      })))
  }
}

/** A running tree. `dispose` closes its scope: each destructor and each listener goes, in reverse order. */
export type Mounted = { readonly dispose: () => Promise<void> }

/**
 * Runs a widget tree in `element`, with the facts of the browser from `browser`. This is the only
 * place where an Effect tree meets the page: a React component, a story or a test calls it.
 */
export const mount = (tree: Widget, element: HTMLElement, browser: Layer.Layer<Browser>): Mounted => {
  const scope = Effect.runSync(Scope.make())
  const bar = errorBar(element)
  const fiber = Effect.runFork(
    connected(element).pipe(
      Effect.andThen(tree),
      Effect.provideService(Host, element),
      Effect.provide(browser),
      Scope.provide(scope),
      Effect.andThen(Effect.never),
      // A tree that cannot start, or that fails, closes: half a widget is worse than a clear error.
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.void
          : Scope.close(scope, Exit.void).pipe(Effect.andThen(bar.report("The widget", cause)))),
      Effect.provideService(Problems, bar),
      Effect.provideService(Scheduler.Scheduler, uiScheduler)
    )
  )
  return {
    dispose: () => Effect.runPromise(Fiber.interrupt(fiber).pipe(Effect.andThen(Scope.close(scope, Exit.void))))
  }
}
