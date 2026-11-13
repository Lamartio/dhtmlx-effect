import type { Meta } from "@storybook/html-vite"
import { notWrapped } from "../listing"

const meta: Meta = { title: "Diagram/Diagram" }
export default meta

export const NotWrappedYet = notWrapped({
  about: "The default mode: flowcharts, block diagrams, decision trees, swimlanes, from shapes and connectors.",
  page: "https://dhtmlx.com/docs/products/dhtmlxDiagram/",
  npm: "@dhtmlx/diagram",
  licence: "GPL-2.0"
})
