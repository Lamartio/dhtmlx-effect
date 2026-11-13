import type { Meta } from "@storybook/html-vite"
import { notWrapped } from "../listing"

const meta: Meta = { title: "Diagram/Mind map" }
export default meta

export const NotWrappedYet = notWrapped({
  about: "The mind map mode: a core topic with branches of subtopics.",
  page: "https://dhtmlx.com/docs/products/dhtmlxDiagram/",
  npm: "@dhtmlx/diagram",
  licence: "GPL-2.0"
})
