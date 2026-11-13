import { Kanban, locales } from "@dhtmlx/kanban"
import { Effect, Option, PubSub, Scope, Stream, SubscriptionRef } from "effect"
import { diffRows, type Row } from "../core/rows"
import { Browser, follow } from "./browser"
import { reporting } from "./problems"
import { Host, resource } from "./host"

/**
 * The DHTMLX Kanban (the GPL edition, `@dhtmlx/kanban`) as a part of the Effect tree: a board of
 * cards, with one column for each value of a field.
 */

/**
 * The id of a card in the Kanban. The Kanban reads an id from the page and turns one that looks like
 * a number into a number, so `080` came back as `80` and a drag of `007` found no card. A prefix keeps
 * each id a string.
 */
const cardId = (id: string) => `card:${id}`
const rowId = (id: string | number) => String(id).replace(/^card:/, "")

export type KanbanColumn = { readonly id: string; readonly label: string }

export type KanbanOptions<R extends Row> = {
  /** The rows, such as the issues of a tracker. Each one is a card. */
  readonly rows: SubscriptionRef.SubscriptionRef<ReadonlyArray<R>>
  /** The field of a row that says its column, such as `status`. A drag to another column changes it. */
  readonly field: keyof R & string
  readonly columns: ReadonlyArray<KanbanColumn>
  /** The text on a card. */
  readonly label: (row: R) => string
  /** A second line on a card. */
  readonly description?: (row: R) => string | undefined
}

/** The language of the Kanban for a BCP 47 tag; English when it has none. */
export const kanbanLanguage = (locale: string): keyof typeof locales => {
  const primary = locale.toLowerCase().split(/[-_]/)[0] ?? "en"
  const mapped = ({ ja: "jp", zh: "cn" } as Record<string, string>)[primary] ?? primary
  return (mapped in locales ? mapped : "en") as keyof typeof locales
}

/**
 * A DHTMLX Kanban in the host. The cards come from the store as changes (as the Gantt and the data
 * widgets do). A drag to another column is an event back: it changes `field` of that row in the
 * store. A click on a card gives its id in `opened`, so the app can open it. The Kanban edits nothing of
 * its own: no editor, no new cards, as the store is the truth. The theme and the language follow `Browser`.
 */
export const kanban = <R extends Row>(options: KanbanOptions<R>) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const opened = yield* Effect.acquireRelease(PubSub.unbounded<string>(), PubSub.shutdown)
    const card = (row: R): Readonly<Record<string, string>> => {
      const description = options.description?.(row)
      return { id: cardId(row.id), label: options.label(row), [options.field]: String(row[options.field]), ...(description === undefined ? {} : { description }) }
    }
    host.classList.add("dhxe-kanban")
    const board = yield* resource(
      "kanban",
      () =>
        new Kanban(host, {
          columns: options.columns.map((column) => ({ id: column.id, label: column.label })),
          cards: [],
          columnKey: options.field,
          readonly: { edit: false, add: false, select: true, dnd: true },
          cardShape: { label: true, description: true, menu: { show: false } },
          columnShape: { menu: { show: false } } as never,
          history: false
        }),
      (board) => {
        board.destructor()
        // Svelte leaves its markers, and the theme is a class on the host.
        host.replaceChildren()
        for (const name of [...host.classList]) if (/^wx-.*-theme$/.test(name)) host.classList.remove(name)
      }
    )

    // From the store to the Kanban, as changes. `exec` runs later (it gives a Promise), so a move that
    // came from the store is known by its value, not by a flag.
    yield* SubscriptionRef.changes(options.rows).pipe(
      Stream.zipWithPrevious,
      Stream.runForEach(([before, after]) =>
        Effect.sync(() => {
          if (Option.isNone(before)) {
            board.parse({ cards: after.map(card) as never })
            return
          }
          for (const op of diffRows(before.value, after)) {
            if (op._tag === "remove") void board.api.exec("delete-card", { id: cardId(op.id) })
            if (op._tag === "add") void board.api.exec("add-card", { id: cardId(op.row.id), card: card(op.row), columnId: String(op.row[options.field]), select: false })
            if (op._tag === "update") {
              const id = cardId(op.row.id)
              const shown = board.api.getCard(id) as Record<string, unknown> | undefined
              const next = card(op.row)
              if (shown !== undefined && shown[options.field] !== next[options.field]) void board.api.exec("move-card", { id, columnId: next[options.field] })
              void board.api.exec("update-card", { id, card: next })
            }
          }
        })),
      reporting("The Kanban, while it showed its rows"),
      Effect.forkScoped
    )

    // From the Kanban to the store: a drag to another column changes the field of that row.
    board.api.on("move-card", ({ id, columnId }: { id: string | number; columnId?: string | number }) => {
      if (columnId === undefined || columnId === null) return
      const key = rowId(id)
      const row = Effect.runSync(SubscriptionRef.get(options.rows)).find((one) => one.id === key)
      if (row === undefined || String(row[options.field]) === String(columnId)) return
      Effect.runFork(SubscriptionRef.update(options.rows, (all) => all.map((one) => (one.id === key ? { ...one, [options.field]: String(columnId) } : one))))
    })
    board.api.on("select-card", ({ id }: { id: string | number }) => {
      Effect.runSync(PubSub.publish(opened, rowId(id)))
    })

    // A new theme makes the board again inside the Kanban (`_reset`): the cards stay, as it keeps its store.
    yield* follow(browser.dark, (dark) => board.setTheme({ name: dark ? "willow-dark" : "willow", fonts: false }))
    yield* follow(browser.locale, (tag) => board.setLocale(locales[kanbanLanguage(tag)]))
    return { kanban: board, opened: Stream.fromPubSub(opened) }
  }) as Effect.Effect<{ readonly kanban: Kanban; readonly opened: Stream.Stream<string> }, never, Host | Browser | Scope.Scope>
