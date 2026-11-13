import { setTheme, Spreadsheet } from "@dhtmlx/spreadsheet"
import { Effect, Scope, SubscriptionRef } from "effect"
import { Browser, follow } from "./browser"
import { Host, resource } from "./host"
import { reportedCallback } from "./problems"

/** One cell: its name, such as `B2`, and its value. A value that starts with `=` is a formula. */
export type SpreadsheetCell = { readonly cell: string; readonly value?: string | number; readonly css?: string; readonly format?: string; readonly [key: string]: unknown }

/** The cells of one sheet, or what DHTMLX gives when it has styles or more sheets. */
export type SpreadsheetData =
  | ReadonlyArray<SpreadsheetCell>
  | { readonly data?: ReadonlyArray<SpreadsheetCell>; readonly styles?: Readonly<Record<string, unknown>>; readonly sheets?: ReadonlyArray<unknown>; readonly [key: string]: unknown }

export type SpreadsheetOptions = {
  /** The cells, both ways: an edit of the user goes in, and a new value from the code shows in the sheet. */
  readonly data: SubscriptionRef.SubscriptionRef<SpreadsheetData>
  readonly rowsCount?: number
  readonly colsCount?: number
  /** The line above the grid that shows the formula of the cell. Default: true. */
  readonly editLine?: boolean
  /** Default: false. */
  readonly menu?: boolean
  readonly readonly?: boolean
  /** More than one sheet, with tabs. Default: false. */
  readonly multiSheets?: boolean
}

const copy = (data: SpreadsheetData): unknown => JSON.parse(JSON.stringify(data))

/**
 * A DHTMLX Spreadsheet in the host. The cells are in `data`, both ways. After an edit, the value in
 * `data` is what the Spreadsheet gives back: the cells with a value, and the styles when there are
 * some. Give the host a height. The theme follows `Browser.dark`.
 */
export const spreadsheet = (options: SpreadsheetOptions) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const view = yield* resource(
      "spreadsheet",
      () =>
        new Spreadsheet(host, {
          editLine: options.editLine ?? true,
          menu: options.menu ?? false,
          multiSheets: options.multiSheets ?? false,
          ...(options.rowsCount === undefined ? {} : { rowsCount: options.rowsCount }),
          ...(options.colsCount === undefined ? {} : { colsCount: options.colsCount }),
          ...(options.readonly === undefined ? {} : { readonly: options.readonly })
        }),
      (view) => view.destructor()
    )
    // The value that the sheet has now: one that came from the sheet is not parsed again.
    let known: SpreadsheetData | undefined
    let applying = false
    yield* follow(options.data, (data) => {
      if (data === known) return
      known = data
      applying = true
      try {
        view.parse(copy(data) as never)
      } finally {
        applying = false
      }
    }, "The Spreadsheet, while it followed its cells")
    const onAction = yield* reportedCallback("The Spreadsheet, on an edit", () => {
      if (applying) return
      known = view.serialize() as unknown as SpreadsheetData
      Effect.runSync(SubscriptionRef.set(options.data, known))
    })
    yield* resource(
      "listener",
      () => view.events.on("afterAction" as never, onAction as never),
      () => view.events.detach("afterAction" as never)
    )
    yield* follow(browser.dark, (dark) => setTheme(dark ? "dark" : "light", host))
    return { spreadsheet: view, data: options.data }
  }) as Effect.Effect<{ readonly spreadsheet: Spreadsheet; readonly data: SubscriptionRef.SubscriptionRef<SpreadsheetData> }, never, Host | Browser | Scope.Scope>
