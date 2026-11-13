import type { Meta } from "@storybook/html-vite"
import { notWrapped } from "./listing"

const meta: Meta = { title: "Spreadsheet" }
export default meta

export const NotWrappedYet = notWrapped({
  about: "An editable spreadsheet with formulas, more sheets and an export to Excel.",
  page: "https://dhtmlx.com/docs/products/dhtmlxSpreadsheet/",
  npm: "@dhtmlx/spreadsheet",
  licence: "GPL-2.0"
})
