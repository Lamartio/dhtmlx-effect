/**
 * The UI that the sender sends: the tree, the data and the config, in one value. Change it and save:
 * the sender loads it again, and the page changes only what changed.
 */
import type { Spec } from "./spec"

export default {
  _tag: "column",
  id: "main",
  children: [
    {
      _tag: "row",
      id: "top",
      size: 90,
      children: [
        { _tag: "slider", id: "points", label: "Points", min: 0, max: 13, value: 5 },
        { _tag: "combobox", id: "status", label: "Status", value: "todo", options: [{ value: "todo", label: "To do" }, { value: "doing", label: "Doing" }, { value: "done", label: "Done" }] }
      ]
    },
    {
      _tag: "grid",
      id: "issues",
      size: 220,
      columns: [
        { id: "id", header: "#", width: 70 },
        { id: "title", header: "Title", filter: "input" },
        { id: "status", header: "Status", filter: "select" }
      ],
      rows: [
        { id: "156", title: "Headless models", status: "done" },
        { id: "164", title: "Remote models", status: "done" },
        { id: "166", title: "The UI as data", status: "done" },
        { id: "167", title: "A demo with two servers", status: "doing" }
      ]
    },
    {
      _tag: "kanban",
      id: "board",
      field: "status",
      labelField: "title",
      columns: [
        { id: "todo", label: "To do" },
        { id: "doing", label: "Doing", limit: 1, strictLimit: true },
        { id: "done", label: "Done" }
      ],
      rows: [
        { id: "156", title: "Headless models", status: "done" },
        { id: "164", title: "Remote models", status: "done" },
        { id: "167", title: "A demo with two servers", status: "doing" },
        { id: "168", title: "The next step", status: "todo" }
      ]
    }
  ]
} satisfies Spec
