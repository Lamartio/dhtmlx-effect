import type { Meta } from "@storybook/html-vite"
import * as data from "../../ui/data.examples"
import * as extras from "../../ui/grid-extras.examples"

const meta: Meta = { title: "Suite/Grid" }
export default meta

export const OneStoreTwoViews = data.OneStoreTwoViews
export const EditAndFilter = extras.EditAndFilter
export const LargeList = data.LargeList
