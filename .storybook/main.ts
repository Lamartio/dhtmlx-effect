import type { StorybookConfig } from "@storybook/html-vite"

/**
 * The book of the DHTMLX widgets in Effect. The html renderer: a story gives an Effect tree, and the
 * decorator in preview.ts runs it with the Browser layer of Storybook.
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: "@storybook/html-vite",
  core: { disableTelemetry: true },
  // Behind a reverse proxy, hot reload must dial the port of the proxy, not the port of Storybook:
  // set STORYBOOK_CLIENT_PORT to that port.
  viteFinal: (vite) => {
    const port = process.env["STORYBOOK_CLIENT_PORT"]
    if (port === undefined) return vite
    return { ...vite, server: { ...vite.server, hmr: { ...(vite.server?.hmr as object), clientPort: Number(port) } } }
  }
}

export default config
