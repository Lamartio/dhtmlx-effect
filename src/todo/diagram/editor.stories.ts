import type { Meta } from "@storybook/html-vite"
import { notWrapped } from "../listing"

const meta: Meta = { title: "Diagram/Editor" }
export default meta

export const NotWrappedYet = notWrapped({
  about: "The live editor: a person draws and changes a diagram in the browser.",
  page: "https://dhtmlx.com/docs/products/dhtmlxDiagram/",
  npm: "@dhtmlx/diagram",
  licence: "GPL-2.0"
})
