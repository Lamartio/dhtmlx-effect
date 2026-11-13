import { setTheme, Toolbar } from "dhx-suite"
import type { NavigationBarEvents } from "dhx-suite/codebase/types/ts-navbar/sources/types"
import { Context, Effect, PubSub, Scope, Stream, SubscriptionRef } from "effect"
import { Browser, follow } from "./browser"
import { Host, resource } from "./host"

/**
 * The toolbar that an item goes in: the requirement of each item, as `Host` is for a widget. An item
 * adds itself to `toolbar.data` and removes itself when its scope closes, so a tab or a mode can
 * swap a set of items by swapping a scope.
 */
export class ToolbarSlot extends Context.Service<ToolbarSlot, {
  readonly toolbar: Toolbar
  /** The id of each item that is clicked. */
  readonly clicks: PubSub.PubSub<string>
}>()("dhtmlx-effect/ToolbarSlot") {}

let ids = 0
const nextId = (kind: string) => `${kind}-${++ids}`

const item = (config: Record<string, unknown> & { readonly type: string }) =>
  Effect.gen(function* () {
    const { toolbar } = yield* ToolbarSlot
    const id = nextId(config.type)
    yield* resource(`toolbar ${config.type}`, () => toolbar.data.add({ ...config, id } as never), () => toolbar.data.remove(id))
    return id
  })

/** A button in the toolbar. Gives the stream of its clicks. A label in a `SubscriptionRef` changes in place. */
export const toolbarButton = (options: {
  readonly label?: string | SubscriptionRef.SubscriptionRef<string>
  readonly icon?: string
  readonly tooltip?: string
  readonly color?: "primary" | "secondary"
  /** `flat` is a filled button, `link` has no background: a ghost button. Default: `flat`. */
  readonly view?: "flat" | "link"
}) =>
  Effect.gen(function* () {
    const fixed = typeof options.label === "string" ? options.label : options.label === undefined ? undefined : yield* SubscriptionRef.get(options.label)
    const id = yield* item({
      type: "button",
      view: options.view ?? "flat",
      color: options.color ?? "secondary",
      circle: options.label === undefined,
      ...(fixed === undefined ? {} : { value: fixed }),
      ...(options.icon === undefined ? {} : { icon: options.icon }),
      ...(options.tooltip === undefined ? {} : { tooltip: options.tooltip })
    })
    const { toolbar, clicks } = yield* ToolbarSlot
    if (options.label !== undefined && typeof options.label !== "string") {
      yield* follow(options.label, (value) => toolbar.data.update(id, { value }))
    }
    return Stream.fromPubSub(clicks).pipe(Stream.filter((clicked) => clicked === id), Stream.as(undefined))
  })

/** The text at this place in the toolbar. */
export const toolbarTitle = (value: string) => item({ type: "title", value })
/** HTML of our own at this place in the toolbar, such as a logo. It goes in as HTML: give it no text of a user. */
export const toolbarHtml = (html: string) => item({ type: "customHTML", html })
/** Pushes the items after it to the right end. */
export const toolbarSpacer = item({ type: "spacer" })
export const toolbarSeparator = item({ type: "separator" })

/**
 * A DHTMLX Toolbar in the host. `items` runs with the toolbar as its `ToolbarSlot`, and what it gives
 * back is what the toolbar gives back. The theme follows `Browser.dark`.
 */
export const toolbar = <A, R>(items: Effect.Effect<A, never, R>) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const clicks = yield* Effect.acquireRelease(PubSub.unbounded<string>(), PubSub.shutdown)
    const bar = yield* resource("toolbar", () => new Toolbar(host, { css: "dhxe-toolbar" }), (bar) => bar.destructor())
    yield* resource(
      "listener",
      () => bar.events.on("click" as NavigationBarEvents, (id: string | number) => Effect.runSync(PubSub.publish(clicks, String(id)))),
      () => bar.events.detach("click" as NavigationBarEvents)
    )
    yield* follow(browser.dark, (dark) => setTheme(dark ? "dark" : "light", host))
    return yield* Effect.provideService(items, ToolbarSlot, { toolbar: bar, clicks })
  }) as Effect.Effect<A, never, Exclude<R, ToolbarSlot> | Host | Browser | Scope.Scope>
