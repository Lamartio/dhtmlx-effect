/**
 * The UI that the sender sends: the tree, the config and the data, composed with the Schemas of
 * dhtmlx-effect. `.make` checks each node. Change it and save: the sender loads it again, and the
 * page changes only what changed.
 */
import { Button, Column, Combobox, Grid, Kanban, Layout, Sidebar, Slider, Tabbar, Toolbar } from "../src/model/nodes"

const issues = [
  { id: "156", title: "Headless models", status: "done" },
  { id: "164", title: "Remote models", status: "done" },
  { id: "166", title: "The UI as data", status: "done" },
  { id: "167", title: "A demo with two servers", status: "doing" },
  { id: "168", title: "The next step", status: "todo" }
]

const grid = Grid.make({
  id: "issues",
  columns: [
    { id: "id", header: "#", width: 70 },
    { id: "title", header: "Title", filter: "input" },
    { id: "status", header: "Status", filter: "select" }
  ],
  rows: issues,
  // A right click on a row.
  menu: [{ id: "open", label: "Open" }, { separator: true }, { id: "close", label: "Close the issue" }]
})

const board = Kanban.make({
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

export default Layout.make({
  id: "frame",
  direction: "cols",
  // Put "settings" here to hide the cell on the right.
  hidden: [],
  cells: [
    {
      child: Sidebar.make({
        id: "side",
        width: 180,
        items: [
          { label: "Issues", icon: "dxi dxi-file-outline", child: grid },
          { label: "Board", icon: "dxi dxi-view-column", child: board },
          { label: "Both", icon: "dxi dxi-tune", child: Tabbar.make({ id: "views", tabs: [{ label: "Points", child: Slider.make({ id: "more-points", label: "More points", min: 0, max: 13, value: 8 }) }] }) }
        ]
      })
    },
    {
      header: "Settings",
      size: 320,
      collapsable: true,
      child: Column.make({
        id: "settings",
        children: [
          Toolbar.make({ id: "bar", size: 56, items: [{ title: "Settings" }, { spacer: true }, { id: "reset", label: "Reset", view: "link" }] }),
          Slider.make({ id: "points", label: "Points", min: 0, max: 13, value: 5, size: 90 }),
          Combobox.make({ id: "status", label: "Status", value: "todo", options: [{ value: "todo", label: "To do" }, { value: "doing", label: "Doing" }, { value: "done", label: "Done" }], size: 90 }),
          Button.make({ id: "save", label: "Save", color: "primary", size: 56 })
        ]
      })
    }
  ]
})
