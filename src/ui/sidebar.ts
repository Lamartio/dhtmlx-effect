import { setTheme, Sidebar } from "dhx-suite"
import type { NavigationBarEvents } from "dhx-suite/codebase/types/ts-navbar/sources/types"
import { Effect, Scope, SubscriptionRef } from "effect"
import { Browser, follow } from "./browser"
import { child, Host, resource, type Widget } from "./host"
import { chooser, type Choice } from "./tabbar"

/** One item of a sidebar: its label and icon, and the part that shows when it is chosen. */
export type SidebarItem<K extends string> = {
  readonly id: K
  readonly label: string
  /** A class of the icon font, such as `dxi dxi-file-outline`. */
  readonly icon?: string
  readonly part: Widget
}

/** Below this width of the window the sidebar shows only the icons. */
export const SIDEBAR_NARROW = 720

/**
 * A DHTMLX Sidebar on the left of the host, and the part of the chosen item on the right. One part at
 * a time, as the tabs of `tabbar`. The sidebar folds to its icons on a narrow window, and opens again
 * on a wide one. Gives `active`, to read or set the chosen item. The theme follows `Browser.dark`.
 */
export const sidebar = <K extends string>(options: Choice<K, SidebarItem<K>> & { readonly width?: number }) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const active = options.active ?? (yield* SubscriptionRef.make<K>(options.items[0]?.id as K))
    host.style.display = "flex"
    host.style.flexDirection = "row"
    host.style.minHeight = "0"
    const nav = yield* child("dhxe-fixed")
    nav.style.flex = "0 0 auto"
    nav.style.height = "100%"
    const stage = yield* child("dhxe-grow")
    stage.style.flex = "1 1 auto"
    stage.style.minWidth = "0"
    stage.style.position = "relative"
    const bar = yield* resource(
      "sidebar",
      () =>
        new Sidebar(nav, {
          width: options.width ?? 200,
          data: options.items.map((item) => ({ id: item.id, value: item.label, ...(item.icon === undefined ? {} : { icon: item.icon }) }))
        }),
      (bar) => bar.destructor()
    )
    yield* resource(
      "listener",
      () =>
        bar.events.on("click" as NavigationBarEvents, (id: string | number) => {
          if (options.items.some((item) => item.id === String(id))) Effect.runSync(SubscriptionRef.set(active, String(id) as K))
        }),
      () => bar.events.detach("click" as NavigationBarEvents)
    )
    yield* follow(browser.dark, (dark) => setTheme(dark ? "dark" : "light", host))
    yield* follow(browser.viewport, (viewport) => {
      const narrow = viewport.width < SIDEBAR_NARROW
      if (narrow !== bar.isCollapsed()) {
        if (narrow) bar.collapse()
        else bar.expand()
      }
    })
    yield* chooser(options.items, active, stage, (id) => bar.select(id))
    return { active, sidebar: bar }
  }) as Effect.Effect<{ readonly active: SubscriptionRef.SubscriptionRef<K>; readonly sidebar: Sidebar }, never, Host | Browser | Scope.Scope>
