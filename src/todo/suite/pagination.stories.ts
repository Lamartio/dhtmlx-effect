import type { Meta } from "@storybook/html-vite"
import { notWrapped } from "../listing"

const meta: Meta = { title: "Suite/Pagination" }
export default meta

export const NotWrappedYet = notWrapped({
  about: "Pages for a Grid, a List or a DataView on one data collection. It is not in the free packages (dhx-suite 9.3.2, @dhtmlx/suite 9.4.2), so it waits for a commercial package.",
  page: "https://dhtmlx.com/docs/products/dhtmlxPagination/"
})
