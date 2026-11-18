import { Schema } from "effect"

/**
 * The few Tailwind classes that a node may have: spacing, a place for a node such as a floating
 * button, and the alignment of the children of a frame. No colors, no fonts and no theme: the page
 * decides those. `scripts/utilities.ts` builds the CSS of exactly this list into `src/utilities.css`,
 * so a page needs no Tailwind.
 */
const SCALE = ["0", "1", "2", "3", "4", "6", "8"] as const
const SPACING = ["m", "mx", "my", "mt", "mr", "mb", "ml", "p", "px", "py", "pt", "pr", "pb", "pl", "gap"] as const
const AUTO = ["m", "mx", "my", "mt", "mr", "mb", "ml"] as const
const SIDES = ["top", "right", "bottom", "left"] as const

export const UTILITIES = [
  ...SPACING.flatMap((name) => SCALE.map((step) => `${name}-${step}` as const)),
  ...AUTO.map((name) => `${name}-auto` as const),
  // A node over the others, such as a floating button. Each node is already relative.
  "absolute",
  "inset-0",
  ...SIDES.flatMap((name) => (["0", "2", "4", "6"] as const).map((step) => `${name}-${step}` as const)),
  "z-10",
  "z-50",
  // The children of a column or a row: the frame gives the direction, and `size` the flex of a child.
  // A node that is not stretched across takes the width of its content: good for a button, while a
  // Grid or a Form gets almost none. `justify-*` only shows when the children have a `size`.
  ...(["start", "center", "end", "stretch"] as const).map((place) => `self-${place}` as const),
  ...(["start", "center", "end", "stretch", "baseline"] as const).map((place) => `items-${place}` as const),
  ...(["start", "center", "end", "between"] as const).map((place) => `justify-${place}` as const)
] as const

export type Utility = (typeof UTILITIES)[number]

/** The classes of a node, checked against the list: a class that is not in it fails the decode. */
export const Classes = Schema.optional(Schema.Array(Schema.Literals(UTILITIES)))
