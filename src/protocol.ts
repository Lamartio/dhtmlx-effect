/**
 * What a plugin and its page share: the Schemas of the nodes and of their states, the messages and
 * their Schemas, the patch, and the check of a copy. No DHTMLX.
 */
export * from "./model/patch"
export * from "./model/states"
export { type AskMessage, checksum, type FullMessage, MAX_OPEN_ASKS, type Mirror, type PatchMessage, receive, type StateMessage } from "./model/ui-state"
export type { ActionMessage, AnswerMessage, Channel, HostMessage, PluginMessage, ReplyMessage, ResyncMessage } from "./model/remote"
export { HostMessageSchema, PluginMessageSchema } from "./model/transport"
export {
  type FrameNode, type LayoutNode, type SidebarNode, type TabbarNode, TREE_KEY, type UiNode, UiNodeSchema, type WidgetNode, WidgetNodeSchema, WireNodes
} from "./model/tree"
