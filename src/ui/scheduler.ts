import { scheduler as scheduler_, type SchedulerStatic } from "dhtmlx-scheduler"
import { Effect, Option, Scope, Stream, SubscriptionRef } from "effect"
import { calendarLocale, dateToDay, dayToDate, instant, zoned } from "../core/form"
import { diffRows } from "../core/rows"
import { Browser, follow } from "./browser"
import { reporting } from "./problems"
import { Host, resource } from "./host"
import { type CalendarEvent, type SchedulerModel, type SchedulerView, schedulerModel, type SchedulerModelOptions } from "../model/scheduler"

/**
 * The DHTMLX Scheduler, community edition (GPL-2.0), as a part of the Effect tree:
 * a calendar of events with a start and an end.
 */

export type { CalendarEvent, SchedulerView } from "../model/scheduler"

/** The language code of the Scheduler for a BCP 47 tag, as for the Gantt. English when it has none. */
export const schedulerLanguage = (locale: string): string => {
  const primary = locale.toLowerCase().split(/[-_]/)[0] ?? "en"
  const mapped = ({ ja: "jp", zh: "cn", uk: "ua", nb: "no", nn: "no" } as Record<string, string>)[primary] ?? primary
  return LANGUAGES.has(mapped) ? mapped : "en"
}
const LANGUAGES = new Set("ar be ca cn cs da de el en es fi fr he hu id it jp nb nl no pl pt ro ru si sk sl sv tr ua".split(" "))

/** An instant as the Scheduler keeps it: a `Date` in the time of the browser, with the wall clock of the zone. */
export const toWall = (iso: string, timeZone: string): Date => {
  const { day, time } = zoned(new Date(iso), timeZone)
  const [y, m, d] = day.split("-").map(Number) as [number, number, number]
  const [hh, mm] = time.split(":").map(Number) as [number, number]
  return new Date(y, m - 1, d, hh, mm)
}

/** A `Date` of the Scheduler back as an instant, read on the wall clock of the zone. */
export const fromWall = (date: Date, timeZone: string): string => {
  const pad = (n: number) => String(n).padStart(2, "0")
  return instant(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, `${pad(date.getHours())}:${pad(date.getMinutes())}`, timeZone).toISOString()
}

/**
 * The community Scheduler has one instance for the page: `getSchedulerInstance` is in the paid
 * editions only. So one Scheduler can live at a time; a second one is a defect with a clear message.
 */
let inUse = false

/** The Scheduler of the page, with three views and no editor of its own: a click gives the id of the event, not a form. */
const takeScheduler = (): SchedulerStatic => {
  if (inUse) throw new Error("The community DHTMLX Scheduler has one instance for the page, and it is in use")
  inUse = true
  const chart = scheduler_
  chart.config.header = ["day", "week", "month", "date", "prev", "today", "next"]
  chart.config.details_on_dblclick = false
  chart.config.dblclick_create = false
  chart.config.drag_create = false
  chart.config.details_on_create = false
  chart.config.select = false
  chart.config.first_hour = 0
  chart.config.scroll_hour = 8
  return chart
}

/** Gives the Scheduler back: its events and its page go, so the next one starts clean. */
const giveBack = (chart: SchedulerStatic, host: HTMLElement) => {
  try {
    chart.clearAll()
    host.replaceChildren()
    host.removeAttribute("data-scheduler-theme")
  } finally {
    inUse = false
  }
}

/** The events, the view (default `week`) and the day in view, `YYYY-MM-DD` (default: today in `Browser.timeZone`). */
export type SchedulerOptions = SchedulerModelOptions

/**
 * A DHTMLX Scheduler in the host, with day, week and month views. The events come from the store as
 * changes (as the Gantt does), and a drag or a resize writes the event back. `opened` gives the id of
 * each event that is clicked, so the app can open it. The language, the first day of the week, the clock,
 * the time zone and the skin follow `Browser`, in place.
 *
 * The Scheduler runs on its model (`schedulerModel`): a drag, a resize, a click and a change of the
 * view in the Scheduler are its actions, and the events, the view and the day of the model show in it.
 */
export const renderScheduler = (model: SchedulerModel) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const zone = { now: yield* SubscriptionRef.get(browser.timeZone) }
    const { view, date } = model
    host.classList.add("dhxe-scheduler")
    const chart = yield* resource("scheduler", takeScheduler, (chart) => giveBack(chart, host))
    const wall = dayToDate
    chart.init(host, wall(yield* SubscriptionRef.get(date)), yield* SubscriptionRef.get(view))

    const show = (event: CalendarEvent) => ({ id: event.id, text: event.text, start_date: toWall(event.start, zone.now), end_date: toWall(event.end, zone.now) })
    // From the store to the Scheduler, as changes. A change that came from the Scheduler is not sent back.
    let applying = false
    const apply = (run: () => void) => {
      applying = true
      try {
        run()
      } finally {
        applying = false
      }
    }
    const current = { events: [] as ReadonlyArray<CalendarEvent> }
    yield* SubscriptionRef.changes(model.events).pipe(
      Stream.zipWithPrevious,
      Stream.runForEach(([before, after]) =>
        Effect.sync(() => {
          current.events = after
          apply(() => {
            if (Option.isNone(before)) {
              chart.clearAll()
              chart.parse(after.map(show))
              return
            }
            for (const op of diffRows(before.value, after)) {
              if (op._tag === "remove" && chart.getEvent(op.id) !== undefined) chart.deleteEvent(op.id)
              if (op._tag === "add" && chart.getEvent(op.row.id) === undefined) chart.addEvent(show(op.row))
              if (op._tag === "update") {
                const shown = chart.getEvent(op.row.id)
                if (shown === undefined) continue
                Object.assign(shown, show(op.row))
                chart.updateEvent(op.row.id)
              }
            }
          })
        })),
      reporting("The Scheduler, while it showed its events"),
      Effect.forkScoped
    )
    // From the Scheduler to the store: one event for a drag or a resize.
    const listen = (name: string, f: (...args: Array<never>) => unknown) =>
      resource("listener", () => chart.attachEvent(name as never, f as never), (id) => chart.detachEvent(id))
    yield* listen("onEventChanged", (id: string, event: { text: string; start_date: Date; end_date: Date }) => {
      if (applying) return
      const changed: CalendarEvent = { id: String(id), text: String(event.text), start: fromWall(event.start_date, zone.now), end: fromWall(event.end_date, zone.now) }
      Effect.runSync(model.updateEvent(changed))
    })
    yield* listen("onClick", (id: string) => {
      Effect.runSync(model.open(String(id)))
      return false
    })
    yield* listen("onViewChange", (mode: string, shown: Date) => {
      if (applying) return
      const day = dateToDay(shown)
      if (Effect.runSync(SubscriptionRef.get(view)) !== mode) Effect.runSync(model.showView(mode as SchedulerView))
      if (Effect.runSync(SubscriptionRef.get(date)) !== day) Effect.runSync(model.showDate(day))
    })
    const showView = () =>
      apply(() => chart.setCurrentView(wall(Effect.runSync(SubscriptionRef.get(date))), Effect.runSync(SubscriptionRef.get(view))))
    yield* follow(view, (mode) => {
      if (chart.getState().mode !== mode) showView()
    })
    yield* follow(date, (day) => {
      if (dateToDay((chart.getState() as { date: Date }).date) !== day) showView()
    })

    yield* follow(browser.dark, (dark) => {
      chart.setSkin(dark ? "dark" : "terrace")
      host.setAttribute("data-scheduler-theme", dark ? "dark" : "terrace")
    })
    yield* follow(browser.locale, (tag) => {
      const names = calendarLocale(tag)
      chart.i18n.setLocale(schedulerLanguage(tag))
      chart.config.start_on_monday = names.weekStart === "monday"
      chart.config.hour_date = names.twelveHours ? "%g:%i %A" : "%H:%i"
      chart.templates.hour_scale = chart.date.date_to_str(chart.config.hour_date)
      apply(() => chart.render())
    })
    // A new zone moves each event to the wall clock of that zone.
    yield* follow(browser.timeZone, (next) => {
      if (next === zone.now) return
      zone.now = next
      apply(() => {
        chart.clearAll()
        chart.parse(current.events.map(show))
      })
    })
    return { scheduler: chart, view, date, opened: model.opened, model }
  }) as Effect.Effect<{
    readonly scheduler: SchedulerStatic
    readonly view: SubscriptionRef.SubscriptionRef<SchedulerView>
    readonly date: SubscriptionRef.SubscriptionRef<string>
    readonly opened: Stream.Stream<string>
    readonly model: SchedulerModel
  }, never, Host | Browser | Scope.Scope>

/** The Scheduler with its own model. With no `date`, it opens on today in `Browser.timeZone`. */
export const scheduler = (options: SchedulerOptions) =>
  Effect.gen(function* () {
    const browser = yield* Browser
    const today = zoned(yield* SubscriptionRef.get(browser.now), yield* SubscriptionRef.get(browser.timeZone)).day
    return yield* renderScheduler(yield* schedulerModel({ ...options, date: options.date ?? today }))
  })
