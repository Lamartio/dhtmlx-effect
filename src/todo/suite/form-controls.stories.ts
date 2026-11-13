import type { Meta } from "@storybook/html-vite"
import { notWrapped } from "../listing"

const meta: Meta = { title: "Suite/Form controls" }
export default meta

export const NotWrappedYet = notWrapped({
  about: "The Form has 20 controls. The form of this repository makes 15 of them. These 5 have no field kind yet: Avatar and SimpleVault, which hold files, and Container, Fieldset and Spacer, which shape the layout.",
  page: "https://docs.dhtmlx.com/suite/form/",
  npm: "dhx-suite",
  licence: "GPL-2.0"
})
