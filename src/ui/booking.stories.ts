import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect, Stream, SubscriptionRef } from "effect"
import "@dhtmlx/booking/dist/booking.css"
import { element, widgetStory } from "../storybook/story"
import { booking, type BookingCard } from "./booking"
import { column } from "./host"

/**
 * The Booking widget. It sends nothing: a booked slot comes as a value of a stream, and this story
 * takes that slot out of the card, as an app would after it saved the booking.
 */
const meta: Meta = { title: "Booking" }
export default meta
type Story = StoryObj

const WORK_DAYS = [1, 2, 3, 4, 5]

const cards = (): ReadonlyArray<BookingCard> => [
  { id: "anna", title: "Anna Vos", category: "Dentist", subtitle: "12 years of practice", price: "€40", slots: [{ from: 9, to: 12, days: WORK_DAYS }], slotSize: 30 },
  { id: "ben", title: "Ben Smit", category: "Dentist", subtitle: "5 years of practice", price: "€45", slots: [{ from: 13, to: 17, days: WORK_DAYS }], slotSize: 30 },
  { id: "cara", title: "Cara Bos", category: "Hygienist", subtitle: "8 years of practice", price: "€30", slots: [{ from: 10, to: 15, days: [2, 4] }], slotSize: 45 }
]

export const Slots: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const data = yield* SubscriptionRef.make(cards())
      const [log, made] = yield* column([element("pre", "dhxe-log", "Choose a slot, fill in the form and book it."), booking({ cards: data })])
      yield* made.confirmed.pipe(
        Stream.runForEach((slot) =>
          Effect.gen(function* () {
            log.textContent = `booked ${slot.card} at ${slot.start.toISOString()} for ${slot.minutes} minutes: ${JSON.stringify(slot.form)}`
            yield* SubscriptionRef.update(data, (all) => all.map((card) => (card.id === slot.card ? { ...card, usedSlots: [...(card.usedSlots ?? []), slot.start.getTime()] } : card)))
          })),
        Effect.forkScoped
      )
    }))
}
