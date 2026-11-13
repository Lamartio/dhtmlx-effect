import type { Meta } from "@storybook/html-vite"
import { notWrapped } from "../listing"

const meta: Meta = { title: "Suite/Pagination" }
export default meta

export const NotWrappedYet = notWrapped({
  about: "Pages for a Grid, a List or a DataView on one data collection.",
  page: "https://dhtmlx.com/docs/products/dhtmlxPagination/",
  npm: "dhx-suite",
  licence: "GPL-2.0"
})
