import type { Meta } from "@storybook/html-vite"
import { notWrapped } from "../listing"

const meta: Meta = { title: "Suite/DatePicker" }
export default meta

export const NotWrappedYet = notWrapped({
  about: "A text input that opens a Calendar in a popup. The Form has it as a field; it has no part of its own yet.",
  page: "https://dhtmlx.com/docs/products/dhtmlxDatepicker/",
  npm: "dhx-suite",
  licence: "GPL-2.0"
})
