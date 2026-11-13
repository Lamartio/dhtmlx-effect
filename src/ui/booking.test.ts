import { it } from "@effect/vitest"
import { Effect, Fiber, Stream, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "@dhtmlx/booking/dist/booking.css"
import { booking, type BookingCard } from "./booking"
import { alive, Host } from "./host"
import { run, settle } from "./wx-test"

const CARDS: ReadonlyArray<BookingCard> = [
  { id: "anna", title: "Anna Vos", category: "Dentist", price: "€40", slots: [{ from: 9, to: 12, days: [1, 2, 3, 4, 5] }], slotSize: 30 },
  { id: "ben", title: "Ben Smit", category: "Dentist", price: "€45", slots: [{ from: 13, to: 17, days: [1, 2, 3, 4, 5] }], slotSize: 30 }
]

it.live("shows the cards of the store, and a new list of cards", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const cards = yield* SubscriptionRef.make(CARDS)
    yield* booking({ cards })
    yield* settle
    expect(host.textContent).toContain("Anna Vos")
    expect(host.textContent).toContain("Ben Smit")

    yield* SubscriptionRef.set(cards, [{ id: "cara", title: "Cara Bos", category: "Doctor", slots: [{ from: 9, to: 12, days: [1, 2, 3, 4, 5] }], slotSize: 30 }])
    yield* settle
    expect(host.textContent).toContain("Cara Bos")
    expect(host.textContent).not.toContain("Anna Vos")
    expect((yield* SubscriptionRef.get(alive)).get("booking")).toBe(1)
  })))

it.live("gives a booked slot as a stream, with the card, the start and the form", () =>
  run(Effect.gen(function* () {
    const cards = yield* SubscriptionRef.make(CARDS)
    const made = yield* booking({ cards })
    yield* settle
    const got = yield* made.confirmed.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* Effect.yieldNow
    const start = Date.UTC(2026, 10, 9, 9, 0)
    let done = false
    // What the Book button does, after a person chose a slot and filled in the form.
    void made.booking.api.exec("confirm-slot", {
      slot: { id: "anna", time: [start, 30] },
      data: { name: "Pete", email: "pete@example.com" },
      confirm: { promise: Promise.resolve(), done: () => (done = true), error: () => undefined }
    })
    yield* settle
    expect(yield* Fiber.join(got)).toEqual([{ card: "anna", start: new Date(start), minutes: 30, form: { name: "Pete", email: "pete@example.com" } }])
    expect(done).toBe(true)
  })))
