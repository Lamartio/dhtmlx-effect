import { Effect, PubSub, Schema, type Scope, Stream } from "effect"
import { type Entry, history } from "./model"

/**
 * The model of a Toolbar, a Button, a Menu or a Ribbon: the items are config, and the user has one
 * action, `click`. A click on an item that is not there, that is disabled, or that opens a sub menu
 * is refused; a click that is taken goes out in `clicked`, for the logic of the plugin.
 */

/** An item of a menu: a plain object; a click comes back as its id. */
export type MenuItem =
  | { readonly id: string; readonly label: string; readonly icon?: string; readonly hotkey?: string; readonly disabled?: boolean; readonly items?: ReadonlyArray<MenuItem> }
  | { readonly separator: true }

export const MenuItemSchema: Schema.Codec<MenuItem> = Schema.Union([
  Schema.Struct({
    id: Schema.String,
    label: Schema.String,
    icon: Schema.optional(Schema.String),
    hotkey: Schema.optional(Schema.String),
    disabled: Schema.optional(Schema.Boolean),
    items: Schema.optional(Schema.Array(Schema.suspend((): Schema.Codec<MenuItem> => MenuItemSchema)))
  }),
  Schema.Struct({ separator: Schema.Literal(true) })
]) as never

/** An item of a toolbar: a button, a title, a spacer that pushes the rest to the right, or a separator. */
export type ToolbarItem =
  | { readonly id: string; readonly label?: string; readonly icon?: string; readonly tooltip?: string; readonly color?: "primary" | "secondary"; readonly view?: "flat" | "link"; readonly disabled?: boolean }
  | { readonly title: string }
  | { readonly spacer: true }
  | { readonly separator: true }

export const ToolbarItemSchema: Schema.Codec<ToolbarItem> = Schema.Union([
  Schema.Struct({
    id: Schema.String,
    label: Schema.optional(Schema.String),
    icon: Schema.optional(Schema.String),
    tooltip: Schema.optional(Schema.String),
    color: Schema.optional(Schema.Literals(["primary", "secondary"])),
    view: Schema.optional(Schema.Literals(["flat", "link"])),
    disabled: Schema.optional(Schema.Boolean)
  }),
  Schema.Struct({ title: Schema.String }),
  Schema.Struct({ spacer: Schema.Literal(true) }),
  Schema.Struct({ separator: Schema.Literal(true) })
]) as never

/** The ids of the items of a menu that a click can choose: not a separator, not disabled, not a sub menu. */
export const clickable = (items: ReadonlyArray<MenuItem | ToolbarItem>): ReadonlyArray<string> =>
  items.flatMap((item) => {
    if (!("id" in item) || item.disabled === true) return []
    return "items" in item && item.items !== undefined ? clickable(item.items) : [item.id]
  })

export type ClickModel = {
  /** The id of each item that the user clicked, when the model took it. */
  readonly clicked: Stream.Stream<string>
  /** A click on an item. An item that is not one of `ids` is refused. */
  readonly click: (id: string) => Effect.Effect<boolean>
  readonly recent: Effect.Effect<ReadonlyArray<Entry>>
  readonly snapshot: Effect.Effect<Record<string, never>>
  readonly changes: Stream.Stream<void>
}

/** The actions of a `ClickModel`, by name. */
export const CLICK_ACTIONS = ["click"] as const satisfies ReadonlyArray<keyof ClickModel>

/** A model whose items with `ids` can be clicked. */
export const clickModel = (ids: ReadonlyArray<string>, options: { readonly history?: number } = {}): Effect.Effect<ClickModel, never, Scope.Scope> =>
  Effect.gen(function* () {
    const clicked = yield* Effect.acquireRelease(PubSub.unbounded<string>(), PubSub.shutdown)
    const log = yield* history(options.history ?? 0)
    return {
      clicked: Stream.fromPubSub(clicked),
      click: (id) =>
        Effect.gen(function* () {
          if (!ids.includes(id)) return false
          yield* log.record({ _tag: "action", name: "click", value: id })
          yield* PubSub.publish(clicked, id)
          yield* log.record({ _tag: "event", name: "clicked", value: id })
          return true
        }),
      recent: log.recent,
      snapshot: Effect.succeed({}),
      // No state: the items are config, so the document has the part with no fields.
      changes: Stream.make(undefined)
    }
  })
