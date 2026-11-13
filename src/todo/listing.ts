import type { StoryObj } from "@storybook/html-vite"

/** What an empty listing says about its component. */
export type Listing = {
  /** One line: what the component is. */
  readonly about: string
  /** The page of the component at dhtmlx.com. */
  readonly page: string
  /** The public npm package with a free edition, when there is one. */
  readonly npm?: string
  /** The licence of that package. */
  readonly licence?: string
}

/**
 * The one story of a component that has no wrapper yet: a few lines of text, and no widget. The
 * listing keeps the place of the component in the book. When the wrapper is there, its stories go
 * next to its code, and the file in `src/todo/` goes.
 */
export const notWrapped = (listing: Listing): StoryObj => ({
  render: () => {
    const box = document.createElement("div")
    box.className = "dhxe-story"
    const line = (text: string, className = "dhxe-note") => {
      const p = document.createElement("p")
      p.className = className
      p.textContent = text
      box.append(p)
      return p
    }
    line("Not wrapped yet.", "")
    line(listing.about)
    line(listing.npm === undefined ? "No public npm package found: a trial or a commercial licence." : `npm: ${listing.npm}${listing.licence === undefined ? "" : ` (${listing.licence})`}`)
    const link = document.createElement("a")
    link.href = listing.page
    link.target = "_blank"
    link.rel = "noopener"
    link.textContent = listing.page
    line("").append(link)
    return box
  }
})
