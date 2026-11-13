import { Schema } from "effect"
import { expect, it } from "vitest"
import { calendarLocale, check, dateToDay, Day, dayToDate, instant, Time, zoned } from "./form"

const Issue = Schema.Struct({
  title: Schema.String.check(Schema.isMinLength(3, { message: "At least 3 letters" })),
  status: Schema.Literals(["todo", "doing", "done"]),
  due: Day,
  at: Time,
  points: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 13 }))
})

it("gives the typed value when each field is right", () => {
  const value = { title: "Forms", status: "todo", due: "2026-11-20", at: "09:30", points: 5 }
  expect(check(Issue, value)).toEqual({ _tag: "valid", value })
})

it("gives one message for each wrong field, under the name of the field", () => {
  const result = check(Issue, { title: "Fo", status: "later", due: "20-11-2026", at: "9:30", points: 40 })
  expect(result._tag).toBe("invalid")
  if (result._tag !== "invalid") return
  expect(Object.keys(result.errors).sort()).toEqual(["at", "due", "points", "status", "title"])
  expect(result.errors["title"]).toBe("At least 3 letters")
  expect(result.errors["due"]).toBe("Give a day as YYYY-MM-DD")
})

it("gives the day and the time of an instant in a time zone, and back", () => {
  const at = new Date("2026-11-09T23:30:00Z")
  expect(zoned(at, "Europe/Amsterdam")).toEqual({ day: "2026-11-10", time: "00:30" })
  expect(zoned(at, "America/New_York")).toEqual({ day: "2026-11-09", time: "18:30" })
  expect(instant("2026-11-10", "00:30", "Europe/Amsterdam").toISOString()).toBe("2026-11-09T23:30:00.000Z")
  expect(instant("2026-07-01", "12:00", "Europe/Amsterdam").toISOString()).toBe("2026-07-01T10:00:00.000Z")
  expect(instant("2026-11-09", "18:30", "America/New_York").toISOString()).toBe("2026-11-09T23:30:00.000Z")
})

it("keeps a day the same through the Date of a DHTMLX calendar", () => {
  expect(dateToDay(dayToDate("2026-03-29"))).toBe("2026-03-29")
})

it("gives the month names, the first day of the week, the clock and the date order of a locale", () => {
  const nl = calendarLocale("nl-NL")
  expect(nl.monthFull[0]).toBe("januari")
  expect(nl.weekStart).toBe("monday")
  expect(nl.twelveHours).toBe(false)
  expect(nl.dateFormat).toBe("%d-%m-%Y")
  const us = calendarLocale("en-US")
  expect(us.dayShort[0]).toBe("Sun")
  expect(us.weekStart).toBe("sunday")
  expect(us.twelveHours).toBe(true)
  expect(us.dateFormat).toBe("%m/%d/%Y")
})
