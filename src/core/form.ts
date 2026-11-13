import { Schema } from "effect"

/**
 * What a form needs with no DHTMLX: the check of a value by an Effect Schema, with the
 * errors by field, and the days, times and weeks of a locale and a time zone.
 */

/** A day as a form keeps it: `YYYY-MM-DD`, with no time and no zone. */
export const Day = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/, { message: "Give a day as YYYY-MM-DD" }))
/** A time of day as a form keeps it: `HH:mm`, 24 hours. */
export const Time = Schema.String.check(Schema.isPattern(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Give a time as HH:mm" }))
/** A colour as a form keeps it: `#rrggbb`. */
export const Color = Schema.String.check(Schema.isPattern(/^#[0-9a-fA-F]{6}$/, { message: "Give a colour as #rrggbb" }))

export type Checked<A> =
  | { readonly _tag: "valid"; readonly value: A }
  | { readonly _tag: "invalid"; readonly errors: Readonly<Record<string, string>> }

/**
 * Checks the values of a form with the Schema. Gives the typed value, or one message for each field
 * that is wrong: the first one, as a form shows one line under a field. An error with no field
 * (a check on the whole value) goes under the key "".
 */
export const check = <S extends Schema.Top>(schema: S, values: unknown): Checked<S["Type"]> => {
  const standard = Schema.toStandardSchemaV1(schema as never, { parseOptions: { errors: "all" } }) as {
    readonly "~standard": { readonly validate: (value: unknown) => { readonly value?: unknown; readonly issues?: ReadonlyArray<{ readonly message: string; readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> }> } | Promise<unknown> }
  }
  const result = standard["~standard"].validate(values)
  if (result instanceof Promise) throw new Error("A form Schema must check with no async step")
  if (result.issues === undefined) return { _tag: "valid", value: result.value as S["Type"] }
  const errors: Record<string, string> = {}
  for (const issue of result.issues) {
    const first = issue.path?.[0]
    const key = first === undefined ? "" : String(typeof first === "object" ? first.key : first)
    errors[key] ??= issue.message
  }
  return { _tag: "invalid", errors }
}

const pad = (n: number) => String(n).padStart(2, "0")

/** The parts of an instant in a time zone. */
const partsIn = (instant: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") }
}

/** The day and the time of an instant on a clock in the time zone. */
export const zoned = (instant: Date, timeZone: string): { readonly day: string; readonly time: string } => {
  const p = partsIn(instant, timeZone)
  return { day: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` }
}

/**
 * The instant of a day and a time on a clock in the time zone. A time that the clock skips (the
 * spring change to summer time) gives the instant an hour later, as most calendars do.
 */
export const instant = (day: string, time: string, timeZone: string): Date => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number]
  const [hh, mm] = time.split(":").map(Number) as [number, number]
  const wanted = Date.UTC(y, m - 1, d, hh, mm)
  // Guess with the offset of the zone at that time, then once more with the offset at the guess.
  let guess = wanted
  for (let step = 0; step < 2; step++) {
    const p = partsIn(new Date(guess), timeZone)
    const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess
    guess = wanted - offset
  }
  return new Date(guess)
}

/** A day as a `Date` at local noon, for a DHTMLX calendar, which works in the time of the browser. */
export const dayToDate = (day: string): Date => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number]
  return new Date(y, m - 1, d, 12)
}

/** A `Date` from a DHTMLX calendar as a day: the browser keeps it in its own time. */
export const dateToDay = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** The names and the first day of the week of a locale, for the calendar of DHTMLX. */
export const calendarLocale = (locale: string) => {
  const month = (style: "long" | "short", n: number) => new Intl.DateTimeFormat(locale, { month: style, timeZone: "UTC" }).format(new Date(Date.UTC(2026, n, 1)))
  // 4 Jan 2026 is a Sunday.
  const weekday = (style: "long" | "short", n: number) => new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 4 + n)))
  const range = (n: number) => Array.from({ length: n }, (_, i) => i)
  const info = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } }
  const firstDay = (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay ?? 1
  const hourCycle = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hourCycle
  return {
    monthFull: range(12).map((n) => month("long", n)),
    monthShort: range(12).map((n) => month("short", n)),
    dayFull: range(7).map((n) => weekday("long", n)),
    dayShort: range(7).map((n) => weekday("short", n)),
    /** `monday` or `sunday`: DHTMLX knows no other first day. Saturday becomes Sunday. */
    weekStart: firstDay === 1 ? ("monday" as const) : ("sunday" as const),
    /** A clock of 12 hours, with AM and PM, or of 24 hours. */
    twelveHours: hourCycle === "h12" || hourCycle === "h11",
    /** The order of day, month and year in a short date, as a DHTMLX format such as `%d/%m/%Y`. */
    dateFormat: new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" })
      .formatToParts(new Date(Date.UTC(2026, 10, 9)))
      .map((part) => (part.type === "day" ? "%d" : part.type === "month" ? "%m" : part.type === "year" ? "%Y" : part.value))
      .join("")
  }
}
