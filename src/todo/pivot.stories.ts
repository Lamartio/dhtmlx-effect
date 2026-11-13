import type { Meta } from "@storybook/html-vite"
import { notWrapped } from "./listing"

const meta: Meta = { title: "Pivot" }
export default meta

export const NotWrappedYet = notWrapped({
  about: "A pivot table: totals and other operations over a big dataset, flat or as a tree.",
  page: "https://dhtmlx.com/docs/products/dhtmlxPivot/",
  npm: "@dhtmlx/pivot",
  licence: "GPL-2.0"
})
