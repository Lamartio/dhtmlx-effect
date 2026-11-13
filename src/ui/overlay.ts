import { Popup, setTheme, Window } from "dhx-suite"
import { Deferred, Effect, Scope, SubscriptionRef } from "effect"
import { Browser, follow } from "./browser"
import { Host, resource } from "./host"
import { slot } from "./slot"

/**
 * The part in a window or a popup. It gets `close`, so a button in it can close its frame, as the
 * user can with the cross or with a click outside.
 */
export type OverlayPart = (close: Effect.Effect<void>) => Effect.Effect<unknown, never, Host | Browser | Scope.Scope>

/** Gives an Effect that ends when the DHTMLX event `name` comes, and the `close` for the part. */
const until = (events: { on: (name: never, f: () => void) => unknown; detach: (name: never) => void }, name: string) =>
  Effect.gen(function* () {
    const done = yield* Deferred.make<void>()
    yield* resource(
      "listener",
      () => events.on(name as never, () => Effect.runSync(Deferred.succeed(done, undefined))),
      () => events.detach(name as never)
    )
    return done
  })

export type WindowOptions = {
  readonly title: string
  readonly width?: number
  readonly height?: number
  readonly modal?: boolean
  readonly resizable?: boolean
  readonly movable?: boolean
}

/**
 * A DHTMLX Window over the page, with the part in it. The Effect ends when the window closes: by its
 * cross, or by `close` from the part. Its scope ends then, so the part and the window go. An
 * interrupt from outside closes it too. A window fits in a narrow viewport. The theme follows
 * `Browser.dark`.
 */
export const openWindow = (options: WindowOptions, part: OverlayPart) =>
  Effect.scoped(Effect.gen(function* () {
    const browser = yield* Browser
    const { width, height } = yield* SubscriptionRef.get(browser.viewport)
    const win = yield* resource(
      "window",
      () =>
        new Window({
          title: options.title,
          width: Math.min(options.width ?? 560, width - 16),
          height: Math.min(options.height ?? 400, height - 16),
          modal: options.modal ?? false,
          resizable: options.resizable ?? true,
          movable: options.movable ?? true,
          closable: true,
          css: "dhxe-window"
        }),
      (win) => win.destructor()
    )
    const closed = yield* until(win.events as never, "afterhide")
    const close = Effect.sync(() => win.hide())
    win.show()
    const element = yield* slot((html) => win.attachHTML(html))
    yield* follow(browser.dark, (dark) => {
      const root = element.closest<HTMLElement>(".dhx_window")
      if (root !== null) setTheme(dark ? "dark" : "light", root)
    })
    yield* Effect.provideService(part(close), Host, element)
    yield* Deferred.await(closed)
  }))

/**
 * A DHTMLX Popup at the `anchor`, with the part in it. The Effect ends when the popup closes: by a
 * click outside, or by `close` from the part. Its scope ends then. The theme follows `Browser.dark`.
 */
export const openPopup = (anchor: HTMLElement, part: OverlayPart, options: { readonly mode?: "top" | "bottom" | "left" | "right" } = {}) =>
  Effect.scoped(Effect.gen(function* () {
    const browser = yield* Browser
    const pop = yield* resource("popup", () => new Popup({ css: "dhxe-popup" }), (pop) => pop.destructor())
    const closed = yield* until(pop.events as never, "afterHide")
    const close = Effect.sync(() => pop.hide())
    const element = yield* slot((html) => {
      pop.attachHTML(html)
      pop.show(anchor, { mode: options.mode ?? "bottom" })
    })
    yield* follow(browser.dark, (dark) => {
      const root = element.closest<HTMLElement>(".dhx_popup")
      if (root !== null) setTheme(dark ? "dark" : "light", root)
    })
    yield* Effect.provideService(part(close), Host, element)
    yield* Deferred.await(closed)
  }))
