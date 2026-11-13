import type { Meta } from "@storybook/html-vite"
import { notWrapped } from "./listing"

const meta: Meta = { title: "Booking" }
export default meta

export const NotWrappedYet = notWrapped({
  about: "A widget to book an appointment: cards with free time slots, filters, and a form.",
  page: "https://dhtmlx.com/docs/products/dhtmlxBooking/",
  npm: "@dhtmlx/booking",
  licence: "GPL-2.0"
})
