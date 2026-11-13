/**
 * What the newer DHTMLX widgets share (RichText, To Do List, Booking, Pivot): they are made with
 * Svelte, take a theme by name, and come with three languages.
 */

/** The theme of a widget for the dark mode of the browser. `fonts: false`: the widget loads no font from a CDN. */
export const wxTheme = (dark: boolean) => ({ name: dark ? "willow-dark" : "willow", fonts: false })

/** The language of a widget for a BCP 47 tag: German, Chinese, or English when it has none. */
export const wxLanguage = (tag: string): "en" | "de" | "cn" => {
  const primary = tag.toLowerCase().split(/[-_]/)[0]
  return primary === "de" ? "de" : primary === "zh" ? "cn" : "en"
}

/** After the destructor: Svelte leaves its markers in the host, and the theme is a class on it. */
export const wxClear = (host: HTMLElement) => {
  host.replaceChildren()
  for (const name of [...host.classList]) if (/^wx-.*-theme$/.test(name)) host.classList.remove(name)
}

/** The theme as a class on the host, for a widget that has no theme setting of its own. */
export const wxThemeClass = (host: HTMLElement, dark: boolean) => {
  host.classList.toggle("wx-willow-theme", !dark)
  host.classList.toggle("wx-willow-dark-theme", dark)
}
