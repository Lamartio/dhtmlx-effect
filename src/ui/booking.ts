import { Booking, defaultCardShape, locales } from "@dhtmlx/booking"
import { Effect, PubSub, Scope, Stream, SubscriptionRef } from "effect"
import { Browser, follow } from "./browser"
import { Host, resource } from "./host"
import { reportedCallback } from "./problems"
import { wxClear, wxLanguage, wxTheme } from "./wx"
import type { BookingCard } from "../model/booking"

export type { BookingCard, BookingRule } from "../model/booking"

/** A slot that a person booked: the card, the start of the slot and its length in minutes, and what they wrote in the form. */
export type BookingConfirmed = { readonly card: string; readonly start: Date; readonly minutes: number; readonly form: Readonly<Record<string, string>> }

export type BookingOptions = {
  /** The cards. The widget shows each change. */
  readonly cards: SubscriptionRef.SubscriptionRef<ReadonlyArray<BookingCard>>
  /** The first and the last day with slots. Default: from the day of `Browser.now`, for a year. */
  readonly start?: Date
  readonly end?: Date
}

/** The parts of a card. The review part reads the review of each card, so it is off when a card has none. */
const shape = (cards: ReadonlyArray<BookingCard>) => ({ ...defaultCardShape, review: cards.length > 0 && cards.every((card) => card.review !== undefined) })

const copy = (cards: ReadonlyArray<BookingCard>) =>
  cards.map((card) => ({
    ...card,
    ...(card.review === undefined ? {} : { review: { ...card.review } }),
    ...(card.slots === undefined ? {} : { slots: card.slots.map((rule) => ({ ...rule, ...(rule.days === undefined ? {} : { days: [...rule.days] }), ...(rule.dates === undefined ? {} : { dates: [...rule.dates] }) })) }),
    ...(card.usedSlots === undefined ? {} : { usedSlots: [...card.usedSlots] })
  }))

/**
 * A DHTMLX Booking widget in the host: cards with free time slots, filters, and a form. It sends
 * nothing: `confirmed` gives each slot that a person books, and the app saves it and takes the slot
 * out of the cards. The theme and the language follow `Browser`.
 */
export const booking = (options: BookingOptions) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const confirmed = yield* Effect.acquireRelease(PubSub.unbounded<BookingConfirmed>(), PubSub.shutdown)
    const first = yield* SubscriptionRef.get(options.cards)
    const dark = yield* SubscriptionRef.get(browser.dark)
    const language = wxLanguage(yield* SubscriptionRef.get(browser.locale))
    const start = options.start ?? (yield* SubscriptionRef.get(browser.now))
    const view = yield* resource(
      "booking",
      () =>
        new Booking(host, {
          data: copy(first) as never,
          cardShape: shape(first),
          start,
          ...(options.end === undefined ? {} : { end: options.end }),
          theme: wxTheme(dark),
          locale: locales[language]
        }),
      (view) => {
        view.destructor()
        wxClear(host)
      }
    )
    const onConfirm = yield* reportedCallback("The Booking, on a booked slot", (event: { readonly slot: { readonly id: string | number; readonly time: readonly [number, number] }; readonly data: Record<string, string>; readonly confirm?: { readonly done?: (value: unknown) => void } }) => {
      Effect.runSync(PubSub.publish(confirmed, { card: String(event.slot.id), start: new Date(event.slot.time[0]), minutes: event.slot.time[1], form: { ...event.data } }))
      // The widget waits for this, then shows that the slot is booked.
      event.confirm?.done?.(undefined)
    })
    view.setConfirmHandler(onConfirm as never)

    let shown = first
    yield* follow(options.cards, (cards) => {
      if (cards === shown) return
      shown = cards
      view.setConfig({ data: copy(cards) as never, cardShape: shape(cards) })
    }, "The Booking, while it followed its cards")
    let shownDark = dark
    yield* follow(browser.dark, (next) => {
      if (next === shownDark) return
      shownDark = next
      view.setConfig({ theme: wxTheme(next) })
    })
    let shownLanguage = language
    yield* follow(browser.locale, (tag) => {
      const next = wxLanguage(tag)
      if (next === shownLanguage) return
      shownLanguage = next
      view.setLocale(locales[next])
    })
    return { booking: view, confirmed: Stream.fromPubSub(confirmed) }
  }) as Effect.Effect<{ readonly booking: Booking; readonly confirmed: Stream.Stream<BookingConfirmed> }, never, Host | Browser | Scope.Scope>
