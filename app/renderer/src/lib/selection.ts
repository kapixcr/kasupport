export interface Selection {
  kind: "channel" | "conversation" | "dm";
  id: number;
  channelId: number;
}
