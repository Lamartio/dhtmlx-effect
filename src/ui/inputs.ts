import { Calendar, Colorpicker, Combobox, i18n, setTheme, Slider, Timepicker, Uploader } from "dhx-suite"
import { Effect, PubSub, Scope, Stream, SubscriptionRef } from "effect"
import { calendarLocale, dateToDay, dayToDate, zoned } from "../core/form"
import { Browser, follow } from "./browser"
import { button } from "./button"
import { child, Host, resource } from "./host"

/**
 * The inputs of a form, alone: Calendar, Timepicker, Slider, Colorpicker and Combobox.
 * Each one keeps its value in a `SubscriptionRef`, both ways: a change by the user sets it, and a new
 * value shows in the widget. A value that came from the ref is not sent back.
 */
type Events = { readonly on: (name: never, f: (...args: Array<never>) => void) => void; readonly detach: (name: never) => void }

const twoWay = <A, W>(
  widget: W & { readonly events: Events },
  ref: SubscriptionRef.SubscriptionRef<A>,
  read: () => A,
  write: (value: A) => void,
  same: (a: A, b: A) => boolean = Object.is
) =>
  Effect.gen(function* () {
    let applying = false
    yield* resource(
      "listener",
      () =>
        widget.events.on("change" as never, () => {
          if (applying) return
          const value = read()
          if (!same(Effect.runSync(SubscriptionRef.get(ref)), value)) Effect.runSync(SubscriptionRef.set(ref, value))
        }),
      () => widget.events.detach("change" as never)
    )
    yield* follow(ref, (value) => {
      if (same(read(), value)) return
      applying = true
      try {
        write(value)
      } finally {
        applying = false
      }
    })
  })

const themed = Effect.gen(function* () {
  const host = yield* Host
  const browser = yield* Browser
  yield* follow(browser.dark, (dark) => setTheme(dark ? "dark" : "light", host))
})

/** Sets the names of the months and days of the locale in DHTMLX. It is one setting for the whole page. */
export const calendarNames = (locale: string) => {
  const names = calendarLocale(locale)
  i18n.setLocale("calendar", { months: names.monthFull, monthsShort: names.monthShort, days: names.dayFull, daysShort: names.dayShort })
  return names
}

/**
 * A DHTMLX Calendar. The day is `YYYY-MM-DD`, or undefined for none. The names of the months and
 * days and the first day of the week follow the locale of `Browser`; with no day, it opens on the
 * day of `Browser.now` in `Browser.timeZone`.
 */
export const calendar = (options: { readonly value?: SubscriptionRef.SubscriptionRef<string | undefined> } = {}) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const value = options.value ?? (yield* SubscriptionRef.make<string | undefined>(undefined))
    const names = calendarNames(yield* SubscriptionRef.get(browser.locale))
    const start = yield* SubscriptionRef.get(value)
    const view = yield* resource(
      "calendar",
      () => new Calendar(host, { weekStart: names.weekStart, css: "dhxe-calendar", ...(start === undefined ? {} : { value: dayToDate(start) }) }),
      (view) => view.destructor()
    )
    yield* themed
    const read = () => {
      const date = view.getValue(true) as Date | undefined
      return date instanceof Date ? dateToDay(date) : undefined
    }
    yield* twoWay(view as never, value, read, (day) => {
      if (day === undefined) view.clear()
      else view.setValue(dayToDate(day))
    })
    yield* follow(browser.locale, (locale) => {
      const next = calendarNames(locale)
      view.config.weekStart = next.weekStart
      view.paint()
    })
    // With no day chosen, show the month of today in the time zone of the browser.
    const today = Effect.gen(function* () {
      const now = yield* SubscriptionRef.get(browser.now)
      const zone = yield* SubscriptionRef.get(browser.timeZone)
      return zoned(now, zone).day
    })
    if (start === undefined) view.showDate(dayToDate(yield* today))
    return { calendar: view, value }
  }) as Effect.Effect<{ readonly calendar: Calendar; readonly value: SubscriptionRef.SubscriptionRef<string | undefined> }, never, Host | Browser | Scope.Scope>

const pad = (n: number) => String(n).padStart(2, "0")

/** A DHTMLX Timepicker. The time is `HH:mm`, 24 hours; the picker shows 12 or 24 hours, as the locale does. */
export const timepicker = (options: { readonly value?: SubscriptionRef.SubscriptionRef<string> } = {}) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const value = options.value ?? (yield* SubscriptionRef.make("09:00"))
    const twelve = calendarLocale(yield* SubscriptionRef.get(browser.locale)).twelveHours
    const view = yield* resource(
      "timepicker",
      () => new Timepicker(host, { timeFormat: twelve ? 12 : 24, controls: false, css: "dhxe-timepicker" }),
      (view) => view.destructor()
    )
    yield* themed
    const read = () => {
      const time = view.getValue(true) as unknown as { hour: number; minute: number; AM?: boolean }
      const hour = time.AM === undefined ? time.hour : (time.hour % 12) + (time.AM ? 0 : 12)
      return `${pad(hour)}:${pad(time.minute)}`
    }
    // As a string: an object with no `AM` reads as PM in DHTMLX, so 09:30 showed as 21:30.
    const write = (time: string) => view.setValue(time)
    write(yield* SubscriptionRef.get(value))
    yield* twoWay(view as never, value, read, write)
    yield* follow(browser.locale, (locale) => {
      const next = calendarLocale(locale).twelveHours ? 12 : 24
      if (view.config.timeFormat === next) return
      const keep = read()
      view.config.timeFormat = next
      view.paint()
      write(keep)
    })
    return { timepicker: view, value }
  }) as Effect.Effect<{ readonly timepicker: Timepicker; readonly value: SubscriptionRef.SubscriptionRef<string> }, never, Host | Browser | Scope.Scope>

/** A DHTMLX Slider with one thumb. */
export const slider = (options: { readonly value?: SubscriptionRef.SubscriptionRef<number>; readonly min?: number; readonly max?: number; readonly step?: number; readonly label?: string }) =>
  Effect.gen(function* () {
    const host = yield* Host
    const value = options.value ?? (yield* SubscriptionRef.make(options.min ?? 0))
    const view = yield* resource(
      "slider",
      () =>
        new Slider(host, {
          min: options.min ?? 0,
          max: options.max ?? 100,
          step: options.step ?? 1,
          tooltip: true,
          value: Effect.runSync(SubscriptionRef.get(value)),
          ...(options.label === undefined ? {} : { label: options.label, labelPosition: "top" })
        }),
      (view) => view.destructor()
    )
    yield* themed
    yield* twoWay(view as never, value, () => view.getValue()[0] ?? 0, (n) => view.setValue(n))
    return { slider: view, value }
  }) as Effect.Effect<{ readonly slider: Slider; readonly value: SubscriptionRef.SubscriptionRef<number> }, never, Host | Browser | Scope.Scope>

/** A DHTMLX Colorpicker. The colour is `#rrggbb`. */
export const colorpicker = (options: { readonly value?: SubscriptionRef.SubscriptionRef<string> } = {}) =>
  Effect.gen(function* () {
    const host = yield* Host
    const value = options.value ?? (yield* SubscriptionRef.make("#2e7dd1"))
    const view = yield* resource("colorpicker", () => new Colorpicker(host, { css: "dhxe-colorpicker" }), (view) => view.destructor())
    yield* themed
    const read = () => String(view.getValue()).toLowerCase()
    view.setValue(Effect.runSync(SubscriptionRef.get(value)))
    yield* twoWay(view as never, value, read, (color) => view.setValue(color), (a, b) => a.toLowerCase() === b.toLowerCase())
    return { colorpicker: view, value }
  }) as Effect.Effect<{ readonly colorpicker: Colorpicker; readonly value: SubscriptionRef.SubscriptionRef<string> }, never, Host | Browser | Scope.Scope>

/** A DHTMLX Combobox with one choice: the value is the id of the chosen option, or undefined. */
export const combobox = (options: {
  readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>
  readonly value?: SubscriptionRef.SubscriptionRef<string | undefined>
  readonly label?: string
  readonly placeholder?: string
}) =>
  Effect.gen(function* () {
    const host = yield* Host
    const value = options.value ?? (yield* SubscriptionRef.make<string | undefined>(undefined))
    const view = yield* resource(
      "combobox",
      () =>
        new Combobox(host, {
          data: options.options.map((option) => ({ id: option.value, value: option.label })) as never,
          ...(options.label === undefined ? {} : { label: options.label, labelPosition: "top" }),
          ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder })
        }),
      (view) => view.destructor()
    )
    yield* themed
    const read = () => {
      const id = view.getValue() as unknown
      return id === undefined || id === null || id === "" ? undefined : String(Array.isArray(id) ? id[0] : id)
    }
    yield* twoWay(view as never, value, read, (id) => {
      if (id === undefined) view.clear()
      else view.setValue(id)
    })
    return { combobox: view, value }
  }) as Effect.Effect<{ readonly combobox: Combobox; readonly value: SubscriptionRef.SubscriptionRef<string | undefined> }, never, Host | Browser | Scope.Scope>

/**
 * Picks files, with a button or a drop on the host: only the part of the DHTMLX Uploader that picks.
 * It sends nothing: `files` gives each picked file, and the app decides where the bytes go. `accept` is as on an `<input type="file">`, such as `image/*`.
 */
export const filePicker = (options: { readonly label?: string; readonly accept?: string } = {}) =>
  Effect.gen(function* () {
    const host = yield* Host
    const files = yield* Effect.acquireRelease(PubSub.unbounded<File>(), PubSub.shutdown)
    host.classList.add("dhxe-drop")
    const uploader = yield* resource(
      "uploader",
      () => new Uploader({ autosend: false, ...(options.accept === undefined ? {} : { accept: options.accept }) }),
      (uploader) => {
        uploader.unlinkDropArea(host)
        uploader.data.removeAll()
      }
    )
    yield* resource(
      "listener",
      () =>
        uploader.data.events.on("afterAdd" as never, (item: { id: string | number; file: File }) => {
          Effect.runSync(PubSub.publish(files, item.file))
          // Picked and given on: the Uploader keeps nothing.
          queueMicrotask(() => uploader.data.exists(item.id) && uploader.data.remove(item.id))
        }),
      () => uploader.data.events.detach("afterAdd" as never)
    )
    yield* Effect.sync(() => uploader.linkDropArea(host))
    const pick = yield* Effect.provideService(button({ label: options.label ?? "Choose files", color: "secondary" }), Host, yield* child("dhxe-drop-button"))
    yield* pick.clicks.pipe(Stream.runForEach(() => Effect.sync(() => uploader.selectFile())), Effect.forkScoped)
    return { uploader, files: Stream.fromPubSub(files) }
  }) as Effect.Effect<{ readonly uploader: Uploader; readonly files: Stream.Stream<File> }, never, Host | Browser | Scope.Scope>
