import { Effect, PubSub, Schema, type Scope, Stream, SubscriptionRef } from "effect"
import { changesOf, type Entry, history, type Input, input, recordInput } from "./model"

/**
 * The model of a Booking: the cards as data. A booking of a slot is the action `book`; a booking
 * that is taken goes out in `confirmed`, and its start goes into the `usedSlots` of its card.
 */

/** When a card has time slots: from and to as `HH:mm` or a number of hours, on these days of the week (0 is Sunday). */
export type BookingRule = { readonly from: number | string; readonly to: number | string; readonly size?: number; readonly gap?: number; readonly days?: ReadonlyArray<number>; readonly dates?: ReadonlyArray<number> }

/** One thing to book, such as a person or a room, with the rules for its free slots. */
export type BookingCard = {
  readonly id: string
  readonly title: string
  readonly category?: string
  readonly subtitle?: string
  readonly details?: string
  readonly preview?: string
  readonly price?: string
  /** The stars (0 to 5) and the number of reviews. The cards show reviews only when each card has one. */
  readonly review?: { readonly stars: number; readonly count: number }
  readonly slots?: ReadonlyArray<BookingRule>
  /** The starts of the slots that are taken, as timestamps. */
  readonly usedSlots?: ReadonlyArray<number>
  /** Minutes. */
  readonly slotSize?: number
  readonly slotGap?: number
}

/** A card as data: an id and a title, and any fields. */
export const BookingCardSchema = Schema.Record(Schema.String, Schema.Unknown).pipe(
  Schema.check(Schema.makeFilter((card: Readonly<Record<string, unknown>>) => (typeof card["id"] === "string" && typeof card["title"] === "string") || "A card needs an id and a title"))
) as unknown as Schema.Codec<BookingCard>

/** A slot that the user booked: the card, the start as a timestamp, the length in minutes, and the form. */
export type Booked = { readonly card: string; readonly start: number; readonly minutes: number; readonly form: Readonly<Record<string, string>> }

export type BookingModel = {
  readonly cards: SubscriptionRef.SubscriptionRef<ReadonlyArray<BookingCard>>
  /** Each slot that the model took. */
  readonly confirmed: Stream.Stream<Booked>
  /** Books a slot. A card that is not there, or a slot that is taken, is refused. */
  readonly book: (card: string, start: number, minutes: number, form: Readonly<Record<string, string>>) => Effect.Effect<boolean>
  readonly recent: Effect.Effect<ReadonlyArray<Entry>>
  readonly snapshot: Effect.Effect<{ readonly cards: ReadonlyArray<BookingCard> }>
  readonly changes: Stream.Stream<void>
}

/** The actions of a `BookingModel`, by name. */
export const BOOKING_ACTIONS = ["book"] as const satisfies ReadonlyArray<keyof BookingModel>

export const bookingModel = (options: { readonly cards: Input<ReadonlyArray<BookingCard>>; readonly history?: number }): Effect.Effect<BookingModel, never, Scope.Scope> =>
  Effect.gen(function* () {
    const cards = yield* input<ReadonlyArray<BookingCard>>(options.cards, [])
    const confirmed = yield* Effect.acquireRelease(PubSub.unbounded<Booked>(), PubSub.shutdown)
    const log = yield* history(options.history ?? 0)
    yield* recordInput(log, "cards", cards)
    return {
      cards,
      confirmed: Stream.fromPubSub(confirmed),
      book: (card, start, minutes, form) =>
        Effect.gen(function* () {
          const all = yield* SubscriptionRef.get(cards)
          const one = all.find((each) => each.id === card)
          if (one === undefined || (one.usedSlots ?? []).includes(start)) return false
          const booked = { card, start, minutes, form }
          yield* log.record({ _tag: "action", name: "book", value: booked })
          yield* SubscriptionRef.set(cards, all.map((each) => (each === one ? { ...each, usedSlots: [...(each.usedSlots ?? []), start] } : each)))
          yield* PubSub.publish(confirmed, booked)
          yield* log.record({ _tag: "event", name: "confirmed", value: booked })
          return true
        }),
      recent: log.recent,
      snapshot: Effect.map(SubscriptionRef.get(cards), (now) => ({ cards: now })),
      changes: changesOf(cards)
    }
  })
