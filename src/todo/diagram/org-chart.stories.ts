import type { Meta } from "@storybook/html-vite"
import { notWrapped } from "../listing"

const meta: Meta = { title: "Diagram/Org chart" }
export default meta

export const NotWrappedYet = notWrapped({
  about: "The org chart mode: a hierarchy of people or departments, with partners and assistants.",
  page: "https://dhtmlx.com/docs/products/dhtmlxDiagram/",
  npm: "@dhtmlx/diagram",
  licence: "GPL-2.0"
})
