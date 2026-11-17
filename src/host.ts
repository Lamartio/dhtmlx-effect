/**
 * The page of a plugin: draws the UI that the plugin sends, with DHTMLX, and sends the actions of
 * the user back. Needs the DHTMLX packages of the kinds of node that the tree of the plugin uses.
 */
export * from "./protocol"
export { renderPlugin } from "./ui/plugin-host"
export {
  connectHost, type Host as Page, memoryChannel, remoteChart, remoteClicks, remoteDiagram, remoteForm, remoteGantt, remoteGrid, remoteKanban, remoteModel, remoteScheduler,
  remoteSelection, remoteTodo, remoteBooking, remoteFilePicker, remotePivot, remoteSpreadsheet, remoteVault, remoteTree, remoteValue
} from "./model/remote"
export { openPlugin, portChannel } from "./model/transport"
export { layerBrowserLive } from "./ui/browser"
export { mount } from "./ui/host"
