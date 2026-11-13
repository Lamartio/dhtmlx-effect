import { locales, Pivot } from "@dhtmlx/pivot"
import { Effect, Scope, SubscriptionRef } from "effect"
import { Browser, follow } from "./browser"
import { Host, resource } from "./host"
import { reportedCallback } from "./problems"
import { wxClear, wxLanguage, wxTheme } from "./wx"

/** One field of the rows: its id is the key in a row. */
export type PivotField = { readonly id: string; readonly label?: string; readonly type: "number" | "text" | "date" }

/** A value of the table: a field and how it is summed up, such as `sum`, `count`, `min`, `max` or `average`. */
export type PivotValue = { readonly field: string; readonly method: string }

/** How the table is built: the fields of the rows, the fields of the columns, and the values in the cells. */
export type PivotConfig = {
  readonly rows?: ReadonlyArray<string>
  readonly columns?: ReadonlyArray<string>
  readonly values?: ReadonlyArray<PivotValue>
  readonly filters?: Readonly<Record<string, unknown>>
}

export type PivotOptions = {
  /** The rows of data. The table follows each change. */
  readonly rows: SubscriptionRef.SubscriptionRef<ReadonlyArray<Readonly<Record<string, unknown>>>>
  readonly fields: ReadonlyArray<PivotField>
  /** The build of the table, both ways: the user changes it in the panel, and the code can set it. */
  readonly config: SubscriptionRef.SubscriptionRef<PivotConfig>
  /** The panel where the user changes the build. Default: true. */
  readonly configPanel?: boolean
}

/** A field as the store keeps it: its id, when DHTMLX gives the whole field. */
const fieldId = (value: unknown): string =>
  typeof value === "object" && value !== null ? String((value as { readonly field?: unknown; readonly id?: unknown }).field ?? (value as { readonly id?: unknown }).id) : String(value)

/** The build as plain values, from what DHTMLX gives in its event. */
const plain = (config: { readonly rows?: ReadonlyArray<unknown>; readonly columns?: ReadonlyArray<unknown>; readonly values?: ReadonlyArray<unknown>; readonly filters?: unknown }): PivotConfig => ({
  rows: (config.rows ?? []).map(fieldId),
  columns: (config.columns ?? []).map(fieldId),
  values: (config.values ?? []).map((value) => {
    const one = value as { readonly field?: unknown; readonly method?: unknown; readonly id?: unknown }
    return { field: String(one.field ?? one.id), method: String(one.method ?? "sum") }
  }),
  ...(typeof config.filters === "object" && config.filters !== null ? { filters: config.filters as Readonly<Record<string, unknown>> } : {})
})

const forPivot = (config: PivotConfig) => ({
  rows: [...(config.rows ?? [])],
  columns: [...(config.columns ?? [])],
  values: (config.values ?? []).map((value) => ({ ...value })),
  ...(config.filters === undefined ? {} : { filters: { ...config.filters } })
})

const sameConfig = (a: PivotConfig, b: PivotConfig) => JSON.stringify(forPivot(a)) === JSON.stringify(forPivot(b))

/**
 * A DHTMLX Pivot table in the host. The rows come from the store, and the build of the table (the
 * fields of the rows and the columns, and the values) is in `config`, both ways. The theme and the
 * language follow `Browser`.
 */
export const pivot = (options: PivotOptions) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const firstRows = yield* SubscriptionRef.get(options.rows)
    const firstConfig = yield* SubscriptionRef.get(options.config)
    const dark = yield* SubscriptionRef.get(browser.dark)
    const language = wxLanguage(yield* SubscriptionRef.get(browser.locale))
    const view = yield* resource(
      "pivot",
      () =>
        new Pivot(host, {
          data: firstRows.map((row) => ({ ...row })),
          fields: options.fields.map((field) => ({ ...field })) as never,
          config: forPivot(firstConfig) as never,
          configPanel: options.configPanel ?? true,
          theme: wxTheme(dark),
          locale: locales[language]
        }),
      (view) => {
        view.destructor()
        wxClear(host)
      }
    )
    // The build that the table has now. `setConfig` makes the table again from what it gets, so each
    // call gives the rows and the build of now.
    let shownConfig = firstConfig
    let shownRows = firstRows
    let applying = false
    const set = (more: object = {}) => {
      applying = true
      try {
        view.setConfig({ data: shownRows.map((row) => ({ ...row })), config: forPivot(shownConfig) as never, ...more })
      } finally {
        applying = false
      }
    }
    const onConfig = yield* reportedCallback("The Pivot, on a new build of the table", (config: Parameters<typeof plain>[0]) => {
      if (applying) return
      const next = plain(config)
      if (sameConfig(next, shownConfig)) return
      shownConfig = next
      Effect.runSync(SubscriptionRef.set(options.config, next))
    })
    view.api.on("update-config", onConfig as never)

    yield* follow(options.rows, (rows) => {
      if (rows === shownRows) return
      shownRows = rows
      set()
    }, "The Pivot, while it followed its rows")
    yield* follow(options.config, (config) => {
      if (config === shownConfig || sameConfig(config, shownConfig)) return
      shownConfig = config
      set()
    }, "The Pivot, while it followed its config")
    let shownDark = dark
    yield* follow(browser.dark, (next) => {
      if (next === shownDark) return
      shownDark = next
      set({ theme: wxTheme(next) })
    })
    let shownLanguage = language
    yield* follow(browser.locale, (tag) => {
      const next = wxLanguage(tag)
      if (next === shownLanguage) return
      shownLanguage = next
      set({ locale: locales[next] })
    })
    return { pivot: view, config: options.config }
  }) as Effect.Effect<{ readonly pivot: Pivot; readonly config: SubscriptionRef.SubscriptionRef<PivotConfig> }, never, Host | Browser | Scope.Scope>
