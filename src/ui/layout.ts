import { Layout, setTheme } from "dhx-suite"
import type { ICellConfig } from "dhx-suite/codebase/types/ts-layout/sources/types"
import { Effect, Scope, type SubscriptionRef } from "effect"
import { Browser, follow } from "./browser"
import { Host, resource, type Widget } from "./host"
import { slot } from "./slot"

/** One cell of a layout: the part that runs in it, and how DHTMLX draws the cell. */
export type LayoutCell<A = unknown> = {
  readonly id: string
  readonly part: Widget<A>
  /** A title bar on the cell. */
  readonly header?: string
  /** A size in px or %, such as `240` or `"30%"`. The cells with no size share what is left. */
  readonly width?: number | string
  readonly height?: number | string
  /** A drag handle between this cell and the next one. */
  readonly resizable?: boolean
  /** A button in the header that folds the cell. Needs a header. */
  readonly collapsable?: boolean
  /** True hides the cell, and the cells next to it take its place. A part outside the layout, such as a toolbar button, can fold a cell with it. */
  readonly hidden?: SubscriptionRef.SubscriptionRef<boolean>
}

export type LayoutOptions<Cells extends ReadonlyArray<LayoutCell>> = {
  /** Rows go from top to bottom, columns from left to right. A cell can hold a layout of its own. */
  readonly direction: "rows" | "cols"
  readonly cells: Cells
  /** The look of the borders between the cells: lines, gaps, or none. */
  readonly type?: "line" | "wide" | "space" | "none"
}

type Results<Cells extends ReadonlyArray<LayoutCell>> = { -readonly [K in keyof Cells]: Cells[K] extends LayoutCell<infer A> ? A : never }

const config = (cell: LayoutCell): ICellConfig => ({
  id: cell.id,
  ...(cell.header === undefined ? {} : { header: cell.header }),
  ...(cell.width === undefined ? {} : { width: cell.width }),
  ...(cell.height === undefined ? {} : { height: cell.height }),
  ...(cell.resizable === undefined ? {} : { resizable: cell.resizable }),
  ...(cell.collapsable === undefined ? {} : { collapsable: cell.collapsable })
})

/**
 * A DHTMLX Layout in the host, with a part in each cell. Each part gets its own element in its cell
 * as its `Host`, and runs in the scope of the layout: the parts close before the layout, in reverse
 * order. Gives what each part gives, in the order of the cells. The theme follows `Browser.dark`.
 */
export const layout = <const Cells extends ReadonlyArray<LayoutCell>>(options: LayoutOptions<Cells>) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const view = yield* resource(
      "layout",
      () => new Layout(host, { type: options.type ?? "line", [options.direction]: options.cells.map(config) }),
      (view) => view.destructor()
    )
    yield* follow(browser.dark, (dark) => setTheme(dark ? "dark" : "light", host))
    const results: Array<unknown> = []
    for (const cell of options.cells) {
      const element = yield* slot((html) => view.getCell(cell.id).attachHTML(html))
      results.push(yield* Effect.provideService(cell.part, Host, element))
      if (cell.hidden !== undefined) {
        yield* follow(cell.hidden, (hidden) => {
          const drawn = view.getCell(cell.id)
          if (hidden !== drawn.isVisible()) return
          if (hidden) drawn.hide()
          else drawn.show()
        }, `The cell ${cell.id} of a layout`)
      }
    }
    return results as Results<Cells>
  }) as Effect.Effect<Results<Cells>, never, Host | Browser | Scope.Scope>
