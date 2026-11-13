import { setTheme, Tabbar } from "dhx-suite"
import { Effect, Scope, Stream, SubscriptionRef } from "effect"
import { Browser, follow } from "./browser"
import { reporting } from "./problems"
import { child, Host, resource, swap, type Widget } from "./host"

/** One tab: its label, and the part that shows when it is open. */
export type Tab<K extends string> = {
  readonly id: K
  readonly label: string
  readonly part: Widget
}

/** The open item of a frame (a tab or a sidebar item), and the parts to choose from. */
export type Choice<K extends string, Item extends { readonly id: K; readonly part: Widget }> = {
  readonly items: ReadonlyArray<Item>
  /** The open item. The frame sets it on a click, and follows it when the code sets it. */
  readonly active?: SubscriptionRef.SubscriptionRef<K>
}

/**
 * Runs the part of the open item in `stage`, one at a time: when `active` changes, the scope of the
 * part before closes (its widgets go), and the new part runs in a new scope. `select` shows the
 * choice in the DHTMLX widget.
 */
export const chooser = <K extends string>(
  items: ReadonlyArray<{ readonly id: K; readonly part: Widget }>,
  active: SubscriptionRef.SubscriptionRef<K>,
  stage: HTMLElement,
  select: (id: K) => void
) =>
  Effect.gen(function* () {
    const show = yield* swap
    let shown: K | undefined
    yield* SubscriptionRef.changes(active).pipe(
      Stream.runForEach((id) =>
        Effect.gen(function* () {
          select(id)
          if (id === shown) return
          shown = id
          const part = items.find((item) => item.id === id)?.part ?? Effect.void
          // Each part gets an element of its own, so the part before and the new one never share one.
          yield* show(Effect.gen(function* () {
            const pane = yield* child("dhxe-stage-pane")
            return yield* Effect.provideService(part, Host, pane)
          }).pipe(Effect.provideService(Host, stage)))
        })),
      reporting("A frame, while it followed its open item"),
      Effect.forkScoped
    )
  })

/**
 * A DHTMLX Tabbar in the host, with the tabs on top and the part of the open tab under them. Only the
 * open tab is mounted: a switch closes the scope of the tab before. Gives `active`, to read or set the open tab. The theme follows `Browser.dark`.
 */
export const tabbar = <K extends string>(options: Choice<K, Tab<K>> & { readonly mode?: "top" | "bottom" }) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const first = options.items[0]?.id as K
    const active = options.active ?? (yield* SubscriptionRef.make<K>(first))
    host.style.display = "flex"
    host.style.flexDirection = options.mode === "bottom" ? "column-reverse" : "column"
    host.style.minHeight = "0"
    const bar = yield* child("dhxe-fixed")
    const stage = yield* child("dhxe-grow")
    stage.style.flex = "1 1 auto"
    stage.style.minHeight = "0"
    stage.style.position = "relative"
    const tabs = yield* resource(
      "tabbar",
      () =>
        new Tabbar(bar, {
          mode: options.mode ?? "top",
          noContent: true,
          activeTab: Effect.runSync(SubscriptionRef.get(active)),
          views: options.items.map((item) => ({ id: item.id, tab: item.label }))
        }),
      (tabs) => tabs.destructor()
    )
    yield* resource(
      "listener",
      () =>
        tabs.events.on("change" as never, (id: string) => {
          if (Effect.runSync(SubscriptionRef.get(active)) !== id) Effect.runSync(SubscriptionRef.set(active, id as K))
        }),
      () => tabs.events.detach("change" as never)
    )
    yield* follow(browser.dark, (dark) => setTheme(dark ? "dark" : "light", host))
    yield* chooser(options.items, active, stage, (id) => {
      if (tabs.getActive() !== id) tabs.setActive(id)
    })
    return { active }
  }) as Effect.Effect<{ readonly active: SubscriptionRef.SubscriptionRef<K> }, never, Host | Browser | Scope.Scope>
