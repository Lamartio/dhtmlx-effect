import type { Meta } from "@storybook/html-vite"
import * as layout from "../../ui/form-layout.examples"
import * as form from "../../ui/form.examples"

const meta: Meta = { title: "Suite/Form" }
export default meta

export const FromSchema = form.FromSchema
export const Choices = form.Choices
export const Layout = layout.Layout
