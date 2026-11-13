import { ContextMenu, Menu, Ribbon, setTheme, type Grid } from "dhx-suite"
import { Deferred, Effect, FiberSet, Option, PubSub, Scope, Stream, SubscriptionRef } from "effect"
import { Browser, follow } from "./browser"
import { Host, resource } from "./host"

/**
 * Menus as data: an item is a plain object, a choice comes back as the id of the item.
 * `items` can be a `SubscriptionRef`, so a menu changes in place, for example to disable an item.
 */
export type MenuItem =
  | { readonly id: string; readonly label: string; readonly icon?: string; readonly hotkey?: string; readonly disabled?: boolean; readonly items?: ReadonlyArray<MenuItem> }
  | { readonly separator: true }

const toData = (items: ReadonlyArray<MenuItem>): Array<unknown> =>
  items.map((item) =>
    "separator" in item
      ? { type: "separator" }
      : {
          id: item.id,
          value: item.label,
          ...(item.icon === undefined ? {} : { icon: item.icon }),
          ...(item.hotkey === undefined ? {} : { hotkey: item.hotkey }),
          ...(item.disabled === true ? { disabled: true } : {}),
          ...(item.items === undefined ? {} : { items: toData(item.items) })
        })

type Items = ReadonlyArray<MenuItem> | SubscriptionRef.SubscriptionRef<ReadonlyArray<MenuItem>>

/** The ids that a click can choose: items with no sub menu. */
const leaves = (items: ReadonlyArray<MenuItem>): ReadonlySet<string> =>
  new Set(items.flatMap((item) => ("separator" in item ? [] : item.items === undefined ? [item.id] : [...leaves(item.items)])))

type Navbar = {
  readonly data: { readonly parse: (data: Array<unknown>) => void }
  readonly events: { readonly on: (name: never, f: (...args: Array<never>) => void) => void; readonly detach: (name: never) => void }
}

/** Fills the navbar with the items, now and on each change, and gives the chosen ids as a stream. */
const wire = (bar: Navbar, items: Items) =>
  Effect.gen(function* () {
    const choices = yield* Effect.acquireRelease(PubSub.unbounded<string>(), PubSub.shutdown)
    let known: ReadonlySet<string> = new Set()
    const show = (list: ReadonlyArray<MenuItem>) => {
      known = leaves(list)
      bar.data.parse(toData(list))
    }
    if (Array.isArray(items)) show(items as ReadonlyArray<MenuItem>)
    else yield* follow(items as SubscriptionRef.SubscriptionRef<ReadonlyArray<MenuItem>>, show)
    yield* resource(
      "listener",
      () => bar.events.on("click" as never, ((id: string | number) => {
        if (known.has(String(id))) Effect.runSync(PubSub.publish(choices, String(id)))
      }) as never),
      () => bar.events.detach("click" as never)
    )
    return choices
  })

/** A DHTMLX Menu bar in the host. Gives each chosen id. The theme follows `Browser.dark`. */
export const menu = (options: { readonly items: Items }) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const bar = yield* resource("menu", () => new Menu(host, { css: "dhxe-menu" }), (bar) => bar.destructor())
    const choices = yield* wire(bar as unknown as Navbar, options.items)
    yield* follow(browser.dark, (dark) => setTheme(dark ? "dark" : "light", host))
    return { menu: bar, choices: Stream.fromPubSub(choices) }
  }) as Effect.Effect<{ readonly menu: Menu; readonly choices: Stream.Stream<string> }, never, Host | Browser | Scope.Scope>

/** A DHTMLX Ribbon in the host: blocks of items with a title. Gives each chosen id. */
export type RibbonBlock = { readonly title: string; readonly items: ReadonlyArray<MenuItem & { readonly size?: "small" | "medium" }> }

export const ribbon = (options: { readonly blocks: ReadonlyArray<RibbonBlock> }) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const bar = yield* resource("ribbon", () => new Ribbon(host, { css: "dhxe-ribbon" }), (bar) => bar.destructor())
    const data = options.blocks.map((block, n) => ({
      type: "block",
      id: `block-${n}`,
      title: block.title,
      items: block.items.map((item) => ("separator" in item ? { type: "separator" } : { ...(toData([item])[0] as object), type: "button", size: item.size ?? "small" }))
    }))
    const choices = yield* Effect.acquireRelease(PubSub.unbounded<string>(), PubSub.shutdown)
    const known = leaves(options.blocks.flatMap((block) => block.items))
    bar.data.parse(data as never)
    yield* resource(
      "listener",
      () => bar.events.on("click" as never, ((id: string | number) => {
        if (known.has(String(id))) Effect.runSync(PubSub.publish(choices, String(id)))
      }) as never),
      () => bar.events.detach("click" as never)
    )
    yield* follow(browser.dark, (dark) => setTheme(dark ? "dark" : "light", host))
    return { ribbon: bar, choices: Stream.fromPubSub(choices) }
  }) as Effect.Effect<{ readonly ribbon: Ribbon; readonly choices: Stream.Stream<string> }, never, Host | Browser | Scope.Scope>

/** The item buttons of an open context menu, in the page. */
const menuButtons = () => [...document.querySelectorAll<HTMLElement>(".dhxe-context .dhx_menu-button:not([disabled])")]

/**
 * Opens a DHTMLX ContextMenu at a mouse event or an element, and waits: gives the chosen id, or none
 * when the menu closes with no choice (a click outside, Escape). The keyboard works too: the first
 * item has the focus, the arrows move it, Enter chooses, Escape closes. An interrupt closes the menu.
 */
export const openContextMenu = (at: MouseEvent | HTMLElement, items: ReadonlyArray<MenuItem>) =>
  Effect.scoped(Effect.gen(function* () {
    const browser = yield* Browser
    const done = yield* Deferred.make<Option.Option<string>>()
    const known = leaves(items)
    const view = yield* resource("context menu", () => new ContextMenu(undefined, { css: "dhxe-context" }), (view) => view.destructor())
    view.data.parse(toData(items) as never)
    yield* resource(
      "listener",
      () => {
        view.events.on("click" as never, ((id: string | number) => {
          if (known.has(String(id))) Effect.runSync(Deferred.succeed(done, Option.some(String(id))))
        }) as never)
        view.events.on("afterHide" as never, (() => Effect.runSync(Deferred.succeed(done, Option.none()))) as never)
      },
      () => {
        view.events.detach("click" as never)
        view.events.detach("afterHide" as never)
      }
    )
    // DHTMLX has no arrow keys in a menu: ours, on the document, for the life of the menu.
    yield* resource(
      "listener",
      () => {
        const keys = (event: KeyboardEvent) => {
          const buttons = menuButtons()
          if (buttons.length === 0) return
          const at = buttons.indexOf(document.activeElement as HTMLElement)
          const move = (step: number) => {
            event.preventDefault()
            buttons[(at + step + buttons.length) % buttons.length]?.focus()
          }
          if (event.key === "ArrowDown") move(1)
          else if (event.key === "ArrowUp") move(at === -1 ? 0 : -1)
          else if (event.key === "Escape") {
            // `hide` sends no afterHide: the menu ends here with no choice.
            event.preventDefault()
            Effect.runSync(Deferred.succeed(done, Option.none()))
          }
        }
        document.addEventListener("keydown", keys, true)
        return keys
      },
      (keys) => document.removeEventListener("keydown", keys, true)
    )
    view.showAt(at as never)
    const isDark = yield* SubscriptionRef.get(browser.dark)
    for (const root of document.querySelectorAll<HTMLElement>(".dhxe-context")) setTheme(isDark ? "dark" : "light", root.closest<HTMLElement>(".dhx_popup") ?? root)
    // Focus the first item after the menu is in the page, so the keyboard can go on.
    yield* Effect.sync(() => requestAnimationFrame(() => menuButtons()[0]?.focus()))
    return yield* Deferred.await(done)
  }))

/**
 * A context menu on the rows of a Grid: a right click on a row, or the Menu key or
 * Shift+F10 on the selected row, opens it. Gives each choice with the id of its row.
 */
export const gridContextMenu = (view: Grid, items: (row: string) => ReadonlyArray<MenuItem>) =>
  Effect.gen(function* () {
    const choices = yield* Effect.acquireRelease(PubSub.unbounded<{ readonly row: string; readonly choice: string }>(), PubSub.shutdown)
    const context = yield* Effect.context<Browser>()
    // An open menu lives in the scope of the Grid: it closes with it.
    const open_ = yield* FiberSet.make()
    const open = (row: string, at: MouseEvent | HTMLElement) =>
      Effect.runFork(FiberSet.run(open_, openContextMenu(at, items(row)).pipe(
        Effect.flatMap(Option.match({ onNone: () => Effect.void, onSome: (choice) => PubSub.publish(choices, { row, choice }) })),
        Effect.provideContext(context)
      )))
    yield* resource(
      "listener",
      () =>
        view.events.on("cellRightClick" as never, ((row: { id: string | number }, _column: unknown, event: MouseEvent) => {
          event.preventDefault()
          view.selection.setCell(row.id)
          open(String(row.id), event)
        }) as never),
      () => view.events.detach("cellRightClick" as never)
    )
    const root = view.getRootNode()
    yield* resource(
      "listener",
      () => {
        const keys = (event: KeyboardEvent) => {
          if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return
          const cell = view.selection.getCell() as { row?: { id: string | number } } | undefined
          if (cell?.row === undefined) return
          event.preventDefault()
          const element = root.querySelector<HTMLElement>(`[data-dhx-id="${CSS.escape(String(cell.row.id))}"]`) ?? root
          open(String(cell.row.id), element)
        }
        root.addEventListener("keydown", keys)
        return keys
      },
      (keys) => root.removeEventListener("keydown", keys)
    )
    return Stream.fromPubSub(choices)
  })
