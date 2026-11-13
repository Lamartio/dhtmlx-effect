# The components of DHTMLX

Each product and widget on [dhtmlx.com/docs/products](https://dhtmlx.com/docs/products/), and what this repository has for it. Read from that page and from the npm registry on 13 Nov 2026.

- **Wrapped**: there is a part in `src/ui/`, with stories and tests.
- **Listing**: there is no part yet. The book has an empty listing for it, from `src/todo/`. When the part is there, its stories go next to its code, and the file in `src/todo/` goes.

Count: 35 components are wrapped, and 3 listings are empty. [What is left](#what-is-left) says why for each one.

## Products

| Product | What it is | Free npm package | Licence of that package | Here |
|---|---|---|---|---|
| Gantt | Gantt chart for project plans | `dhtmlx-gantt` | MIT | Wrapped: `dhtmlx-effect/gantt` |
| Planning Engine | Headless core for resource planning and leveling. It has no UI | None found | | Nothing: there is no widget to wrap |
| Scheduler | Calendar of events, as Outlook or Google Calendar | `dhtmlx-scheduler` | GPL-2.0 | Wrapped: `dhtmlx-effect/scheduler` |
| Grid | Data grid. It is the Grid of the Suite, also sold alone | `dhx-suite`, `@dhtmlx/grid` | GPL-2.0 | Wrapped, in the Suite |
| Suite | UI library of 22 widgets, below | `dhx-suite`, `@dhtmlx/suite` | GPL-2.0 | 21 wrapped, 1 listing |
| Diagram | Flowcharts, org charts, mind maps, PERT charts, and a live editor | `@dhtmlx/diagram` | GPL-2.0 | Wrapped: `dhtmlx-effect/diagram` |
| Booking | Widget to book an appointment | `@dhtmlx/booking` | GPL-2.0 | Wrapped: `dhtmlx-effect/booking` |
| Kanban | Board of cards in columns | `@dhtmlx/kanban` | GPL-2.0 | Wrapped: `dhtmlx-effect/kanban` |
| To Do List | Checklists with subtasks | `@dhtmlx/todolist` | GPL-2.0 | Wrapped: `dhtmlx-effect/todolist` |
| Event Calendar | Light calendar of events with six views | None found | | Listing |
| Chatbot | Chat widget for an AI agent | None found. DHTMLX says it is MIT | | Listing |
| Spreadsheet | Editable spreadsheet with formulas | `@dhtmlx/spreadsheet` | GPL-2.0 | Wrapped: `dhtmlx-effect/spreadsheet` |
| Pivot | Pivot table | `@dhtmlx/pivot` | GPL-2.0 | Wrapped: `dhtmlx-effect/pivot` |
| Vault | File uploader | `@dhtmlx/vault` | GPL-2.0 | Wrapped: `dhtmlx-effect/vault` |
| RichText | Rich text editor | `@dhtmlx/richtext` | GPL-2.0 | Wrapped: `dhtmlx-effect/richtext` |

"None found" means that a search of the public npm registry gave no package. The product can still have a trial or a commercial package.

## The widgets of the Suite

| Widget | Here | Part | Stories |
|---|---|---|---|
| Calendar | Wrapped | `calendar` in `src/ui/inputs.ts` | Suite/Calendar |
| Chart | Wrapped | `chart` in `src/ui/chart.ts` | Suite/Chart |
| ColorPicker | Wrapped | `colorpicker` in `src/ui/inputs.ts` | Suite/ColorPicker |
| ComboBox | Wrapped | `combobox` in `src/ui/inputs.ts` | Suite/ComboBox |
| DataView | Wrapped | `dataView` in `src/ui/data.ts` | Suite/DataView |
| DatePicker | Wrapped: alone, and as the kind `date` of the Form | `datepicker` in `src/ui/datepicker.ts` | Suite/DatePicker |
| Form | Wrapped, from an Effect Schema | `form` in `src/ui/form.ts` | Suite/Form |
| Grid | Wrapped | `grid` in `src/ui/data.ts` | Suite/Grid |
| Layout | Wrapped | `layout` in `src/ui/layout.ts` | Suite/Layout |
| List | Wrapped | `list` in `src/ui/data.ts` | Suite/List |
| Menu | Wrapped | `menu` in `src/ui/menus.ts` | Suite/Menu |
| Message | Wrapped: message, alert, confirm and tooltip | `Dialogs` in `src/ui/dialogs.ts` | Suite/Message |
| Pagination | Listing. It is not in the free packages: `dhx-suite` 9.3.2 and `@dhtmlx/suite` 9.4.2 have no Pagination |  | Suite/Pagination |
| Popup | Wrapped | `openPopup` in `src/ui/overlay.ts` | Suite/Popup |
| Ribbon | Wrapped | `ribbon` in `src/ui/menus.ts` | Suite/Ribbon |
| Sidebar | Wrapped | `sidebar` in `src/ui/sidebar.ts` | Suite/Sidebar |
| Slider | Wrapped | `slider` in `src/ui/inputs.ts` | Suite/Slider |
| Tabbar | Wrapped | `tabbar` in `src/ui/tabbar.ts` | Suite/Tabbar |
| TimePicker | Wrapped | `timepicker` in `src/ui/inputs.ts` | Suite/TimePicker |
| Toolbar | Wrapped | `toolbar` in `src/ui/toolbar.ts` | Suite/Toolbar |
| Tree | Wrapped | `tree` in `src/ui/data.ts` | Suite/Tree |
| Window | Wrapped | `openWindow` in `src/ui/overlay.ts` | Suite/Window |

The [page of the Suite](https://dhtmlx.com/docs/products/dhtmlxSuite/) has the same 22 widgets, in four groups: data (Chart, DataView, Grid, List, Tree), forms and editors (Calendar, ColorPicker, ComboBox, DatePicker, Form, Slider, TimePicker), layout and navigation (Layout, Menu, Pagination, Ribbon, Sidebar, Tabbar, Toolbar), and windows and popups (Message, Popup, Window). The [docs of the Suite](https://docs.dhtmlx.com/suite/) have 21 widgets: the DatePicker is there a control of the Form, an input with a Calendar.

Parts here that the products page does not list as a widget: a Button (the CSS of the Suite on a plain button), a ContextMenu (`openContextMenu`, `gridContextMenu`), and a file picker (the part of the Uploader that picks files).

## Inside the widgets of the Suite

One level deeper, from the docs of the Suite. A widget that is wrapped is not wrapped in full.

### The controls of the Form

The Form has 20 controls. `form` makes 19 of them from a field kind. The Container is only in the PRO edition of the Suite.

| Control | Here |
|---|---|
| Input | The kinds `text` and `number` |
| Textarea | The kind `textarea` |
| Checkbox | The kind `checkbox` |
| Select | The kind `select` |
| Combo | The kind `combo` |
| DatePicker (in the docs: Calendar) | The kind `date` |
| TimePicker | The kind `time` |
| Slider | The kind `slider` |
| ColorPicker | The kind `color` |
| Button | Only the submit button |
| RadioGroup | The kind `radio`: one option, as a string |
| CheckboxGroup | The kind `checks`: the chosen options, as an array |
| Toggle | The kind `toggle`: a boolean |
| ToggleGroup | The kind `toggles`: the chosen options, as an array |
| Text | The kind `note`: a value that the user cannot change |
| Avatar | The kind `avatar`: one picture, as a link or a picked file |
| SimpleVault | The kind `files`: a list of picked files. The form sends nothing |
| Fieldset | The kind `fieldset`: a box around its `fields`. Their values stay in the flat record of the form |
| Spacer | The kind `spacer`: empty room |
| Container | Not in the free Suite: the Form makes it only in the PRO edition |

### The types of the Chart

13 types, all in `chart` through its `type`: Line, Spline, Bar, X-Bar, Area, SplineArea, Pie, Pie 3D, Donut, Radar, Scatter, Treemap, and Calendar heatmap.

### The kinds of the Message

Message, alert, confirm and tooltip. All four are in `Dialogs` and `tooltipOn`.

### The Grid

`grid` has columns, a sort and the selected row both ways. A column can be `editable` (with an `editor` and `options`), `resizable`, and can have a `filter` in its header and a `type`. An edit of the user comes in the stream `edits`: the app writes it into the store, as the store is the truth.

Not in the free Suite: range and block selection, the clipboard, the history, the drag panel and the TreeGrid mode. The Grid of the free Suite does not make them, also when the config asks for them; a test here checks that.

### Themes

The Suite has four themes: light, dark, and a contrast variant of each. The parts here set light or dark from `Browser.dark`. There is no fact for contrast yet.

### Helpers

Not widgets, but a part of the package: AJAX, AwaitRedraw (used here), CssManager, DataCollection and TreeCollection (used here), DataDrivers, DataProxy, dynamic loading, the Resizer, the Selection object and the Uploader (used here by the file picker).

## Diagram

One package, with four modes and an editor. `diagram` in `src/ui/diagram.ts` draws the four modes by its `type`, and `diagramEditor` is the editor. Each one has a story under Diagram.

| Story | What it is |
|---|---|
| Flowchart | The default mode: flowcharts, block diagrams, decision trees, swimlanes |
| Org chart | A hierarchy of people or departments |
| Mind map | A core topic with branches |
| PERT chart | Tasks in stages, with durations and dependencies |
| Editor | A person draws and changes a diagram in the browser |

## The products alone

Each one is a part with an entry of its own. The theme follows `Browser.dark` in each one; the language follows `Browser.locale` in the RichText, the Booking and the Pivot, which come with English, German and Chinese.

| Part | The store | What comes back |
|---|---|---|
| `richtext({ value, format })` | The text, as HTML, Markdown or plain text | The same store: what the user writes |
| `todo({ data })` | The tasks, the projects and the people | The same store: a check, a new task, a new text, a move |
| `booking({ cards })` | The cards with the rules for their slots | `confirmed`: a stream of booked slots. The widget sends nothing |
| `pivot({ rows, fields, config })` | The rows, and the build of the table | The store of the build: what the user sets in the panel |
| `spreadsheet({ data })` | The cells | The same store: each edit |
| `vault({ target })` | None: the user adds the files | `files`: the list of now. `uploaded` and `failed`: streams |

## What is left

| Listing | Why it is empty |
|---|---|
| Suite/Pagination | It is not in the free packages of the Suite |
| Event Calendar | No public npm package found |
| Chatbot | No public npm package found |

Only in the PRO edition, so with no part and no listing: the Container control of the Form, and of the Grid the range and block selection, the clipboard, the history, the drag panel and the TreeGrid mode.

## Notes for the wrapping

- **The Suite has a new package name.** This repository uses `dhx-suite` 9.3.2. Version 9.4.2 is on npm as `@dhtmlx/suite`, and some widgets also have a package alone: `@dhtmlx/grid`, `@dhtmlx/tree`, `@dhtmlx/calendar`, `@dhtmlx/chart`.
- **Not each product has a free package.** Check the licence of a package before it becomes a dependency here.
- **The book has one entry for each widget**, with the name that DHTMLX gives it, in `src/book/suite/`. The stories themselves are in `src/ui/*.examples.ts`, next to the parts: a story can be in more than one entry, such as the Grid and the List on one store.
