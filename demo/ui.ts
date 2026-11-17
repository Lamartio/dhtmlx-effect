/**
 * The UI that the sender sends: the tree, the config and the data, composed with the Schemas of
 * dhtmlx-effect. `.make` checks each node. Change it and save: the sender loads it again, and the
 * page changes only what changed.
 */
import { Booking, Button, Chart, Column, Combobox, DatePicker, Diagram, Form, Grid, Kanban, Layout, Pivot, RichText, Sidebar, Slider, Spreadsheet, Tabbar, Todo, Toolbar } from "../src/plugin"

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
          {
            label: "Chart",
            icon: "dxi dxi-tune",
            child: Chart.make({
              id: "points-chart",
              config: {
                type: "bar",
                series: [{ id: "done", value: "done", color: "#2e7dd1", fill: "#2e7dd1" }, { id: "open", value: "open", color: "#e0a030", fill: "#e0a030" }],
                scales: { bottom: { text: "month" }, left: {} },
                legend: { series: ["done", "open"], halign: "right", valign: "top" }
              },
              rows: [
                { id: "sep", month: "Sep", done: 4, open: 9 },
                { id: "oct", month: "Oct", done: 8, open: 6 },
                { id: "nov", month: "Nov", done: 12, open: 3 }
              ]
            })
          },
          {
            label: "Flow",
            icon: "dxi dxi-tune",
            child: Diagram.make({
              id: "flow",
              editor: true,
              items: [
                { id: "plan", type: "rectangle", text: "Plan", x: 40, y: 40 },
                { id: "build", type: "rectangle", text: "Build", x: 300, y: 40 },
                { id: "ship", type: "rectangle", text: "Ship", x: 560, y: 40 },
                { id: "a", type: "line", from: "plan", to: "build" },
                { id: "b", type: "line", from: "build", to: "ship" }
              ]
            })
          },
          {
            label: "Notes",
            icon: "dxi dxi-file-outline",
            child: Column.make({
              id: "notes-column",
              children: [
                RichText.make({ id: "notes", format: "markdown", value: "# Notes\n\nWhat we learned this week." }),
                Todo.make({ id: "tasks", size: 300, data: { tasks: [{ id: "t1", text: "Write the notes" }, { id: "t2", text: "Read them again", parent: "t1" }] } })
              ]
            })
          },
          {
            label: "Office",
            icon: "dxi dxi-tune",
            child: Tabbar.make({
              id: "office",
              tabs: [
                { label: "Rooms", child: Booking.make({ id: "rooms", cards: [{ id: "blue", title: "Blue room", slots: [{ from: 9, to: 17 }] }, { id: "red", title: "Red room", slots: [{ from: 10, to: 12 }] }] }) },
                {
                  label: "Hours",
                  child: Pivot.make({
                    id: "hours",
                    fields: [{ id: "team", label: "Team", type: "text" }, { id: "month", label: "Month", type: "text" }, { id: "hours", label: "Hours", type: "number" }],
                    rows: [{ id: "1", team: "North", month: "Oct", hours: 5 }, { id: "2", team: "South", month: "Oct", hours: 7 }, { id: "3", team: "North", month: "Nov", hours: 4 }],
                    config: { rows: ["team"], columns: ["month"], values: [{ field: "hours", method: "sum" }] }
                  })
                },
                { label: "Sheet", child: Spreadsheet.make({ id: "sheet", data: [{ cell: "A1", value: "Apples" }, { cell: "B1", value: 3 }, { cell: "B2", value: "=B1*2" }] }) }
              ]
            })
          },
          {
            label: "New issue",
            icon: "dxi dxi-calendar",
            child: Form.make({
              id: "new-issue",
              submitLabel: "Add",
              fields: [
                { name: "title", label: "Title", kind: "text", required: true },
                { name: "code", label: "Code", kind: "text", pattern: "^[A-Z]{3}$", message: "Three capitals, such as SWI" },
                { name: "points", label: "Points", kind: "number", min: 0, max: 13 },
                { name: "due", label: "Due", kind: "date" }
              ]
            })
          },
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
          DatePicker.make({ id: "day", label: "Day", size: 90 }),
          Button.make({ id: "save", label: "Save", color: "primary", size: 56 })
        ]
      })
    }
  ]
})
