import type { Meta } from "@storybook/html-vite"
import { notWrapped } from "./listing"

const meta: Meta = { title: "Chatbot" }
export default meta

export const NotWrappedYet = notWrapped({
  about: "A chat widget for an AI agent, for any language model. DHTMLX gives it under the MIT licence.",
  page: "https://dhtmlx.com/docs/products/dhtmlxChatbot/"
})
