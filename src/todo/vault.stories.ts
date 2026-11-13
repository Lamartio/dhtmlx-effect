import type { Meta } from "@storybook/html-vite"
import { notWrapped } from "./listing"

const meta: Meta = { title: "Vault" }
export default meta

export const NotWrappedYet = notWrapped({
  about: "A file uploader: drag and drop, a list or a grid of files, previews, and a progress bar.",
  page: "https://dhtmlx.com/docs/products/dhtmlxVault/",
  npm: "@dhtmlx/vault",
  licence: "GPL-2.0"
})
