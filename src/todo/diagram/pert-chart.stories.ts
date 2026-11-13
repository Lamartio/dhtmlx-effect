import type { Meta } from "@storybook/html-vite"
import { notWrapped } from "../listing"

const meta: Meta = { title: "Diagram/PERT chart" }
export default meta

export const NotWrappedYet = notWrapped({
  about: "The PERT mode: tasks in stages, with durations and dependencies. It can share its data with a Gantt.",
  page: "https://dhtmlx.com/docs/products/dhtmlxPERTdiagram/",
  npm: "@dhtmlx/diagram",
  licence: "GPL-2.0"
})
