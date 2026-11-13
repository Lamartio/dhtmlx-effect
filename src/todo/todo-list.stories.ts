import type { Meta } from "@storybook/html-vite"
import { notWrapped } from "./listing"

const meta: Meta = { title: "To Do List" }
export default meta

export const NotWrappedYet = notWrapped({
  about: "Checklists with projects, subtasks, owners, priorities, due dates and tags.",
  page: "https://dhtmlx.com/docs/products/dhtmlxTodo/",
  npm: "@dhtmlx/todolist",
  licence: "GPL-2.0"
})
