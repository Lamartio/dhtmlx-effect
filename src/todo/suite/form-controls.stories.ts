import type { Meta } from "@storybook/html-vite"
import { notWrapped } from "../listing"

const meta: Meta = { title: "Suite/Form controls" }
export default meta

export const NotWrappedYet = notWrapped({
  about: "The Form has 20 controls. The form of this repository makes 10 of them. These 10 have no field kind yet: Avatar, CheckboxGroup, Container, Fieldset, RadioGroup, SimpleVault, Spacer, Text, Toggle and ToggleGroup.",
  page: "https://docs.dhtmlx.com/suite/form/",
  npm: "dhx-suite",
  licence: "GPL-2.0"
})
