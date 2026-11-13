import type { Meta } from "@storybook/html-vite"
import { notWrapped } from "./listing"

const meta: Meta = { title: "Event Calendar" }
export default meta

export const NotWrappedYet = notWrapped({
  about: "A calendar of events with Day, Week, Month, Year, Agenda and Timeline views, an editor and a sidebar.",
  page: "https://dhtmlx.com/docs/products/dhtmlxEventCalendar/"
})
