/**
 * The UI that the sender sends: the tree, the config and the data, composed with the Schemas of
 * dhtmlx-effect. `.make` checks each node. Change it and save: the sender loads it again, and the
 * page changes only what changed.
 */
import { Column, Combobox, Grid, Kanban, Row, Slider } from "../src/model/nodes"

const issues = [
  { id: "156", title: "Headless models", status: "done" },
  { id: "164", title: "Remote models", status: "done" },
  { id: "166", title: "The UI as data", status: "done" },
  { id: "167", title: "A demo with two servers", status: "doing" },
  { id: "168", title: "The next step", status: "todo" }
]

export default Column.make({
  id: "main",
  children: [
    Row.make({
      id: "top",
      size: 90,
      children: [
        Slider.make({ id: "points", label: "Points", min: 0, max: 13, value: 5 }),
        Combobox.make({ id: "status", label: "Status", value: "todo", options: [{ value: "todo", label: "To do" }, { value: "doing", label: "Doing" }, { value: "done", label: "Done" }] })
      ]
    }),
    Grid.make({
      id: "issues",
      size: 240,
      columns: [
        { id: "id", header: "#", width: 70 },
        { id: "title", header: "Title", filter: "input" },
        { id: "status", header: "Status", filter: "select" }
      ],
      rows: issues
    }),
    Kanban.make({
      id: "board",
      field: "status",
      labelField: "title",
      columns: [
        { id: "todo", label: "To do" },
        { id: "doing", label: "Doing", limit: 1, strictLimit: true },
        { id: "done", label: "Done" }
      ],
      rows: issues
    })
  ]
})
