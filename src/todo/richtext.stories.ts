import type { Meta } from "@storybook/html-vite"
import { notWrapped } from "./listing"

const meta: Meta = { title: "RichText" }
export default meta

export const NotWrappedYet = notWrapped({
  about: "A rich text editor, with HTML and Markdown in and out.",
  page: "https://dhtmlx.com/docs/products/dhtmlxRichText/",
  npm: "@dhtmlx/richtext",
  licence: "GPL-2.0"
})
