import type { Meta } from "@storybook/html-vite"
import { notWrapped } from "../listing"

const meta: Meta = { title: "Suite/Chart" }
export default meta

export const NotWrappedYet = notWrapped({
  about: "Charts of the Suite: line, bar, area, pie, donut, radar, scatter and more.",
  page: "https://dhtmlx.com/docs/products/dhtmlxChart/",
  npm: "dhx-suite",
  licence: "GPL-2.0"
})
