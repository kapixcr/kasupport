import { io } from "socket.io-client";

export const API: string =
  localStorage.getItem("kasupport_api_url") ||
  (import.meta.env.VITE_API_URL as string) ||
  "http://jdycqg6dnnt1x8qxav2bvbgd.192.99.247.181.sslip.io";

export const DEFAULT_KAPIX_AGENT_URL = "http://127.0.0.1:3080";

export function getKapixAgentUrl(): string {
  return localStorage.getItem("kapix_agent_url") || (import.meta.env.VITE_KAPIX_AGENT_URL as string) || DEFAULT_KAPIX_AGENT_URL;
}

export function setKapixAgentUrl(url: string) {
  const trimmed = url.trim();
  if (trimmed) {
    localStorage.setItem("kapix_agent_url", trimmed);
  } else {
    localStorage.removeItem("kapix_agent_url");
  }
}

export const socket = io(API, {
  transports: ["websocket", "polling"],
  autoConnect: false,
  auth: (callback) => callback({ token: getToken() }),
});


// Id del agente logueado, para presencia (se registra al iniciar sesión)
let currentAgentId: number | null = null;
export function setPresenceAgent(id: number | null) {
  currentAgentId = id;
  if (id) {
    socket.auth = { token: getToken() };
    if (!socket.connected) socket.connect();
    else socket.emit("agents:join");
  } else if (socket.connected) {
    socket.disconnect();
  }
}

// Al (re)conectar, unirse de nuevo al inbox de agentes.
// Sin esto, tras un reinicio del server el socket reconecta pero pierde
// la membresía de sala y dejan de llegar los mensajes en tiempo real.
socket.on("connect", () => {
  if (currentAgentId) socket.emit("agents:join");
});

// Aviso de "está escribiendo..." (limitado a 1 cada 2 segundos por canal)
const typingSent = new Map<number, number>();
export function emitTyping(channelId: number, name: string, authorType: "agent" | "visitor" = "agent") {
  const now = Date.now();
  if (now - (typingSent.get(channelId) || 0) < 2000) return;
  typingSent.set(channelId, now);
  socket.emit("typing", { channelId, name, authorType });
}

export interface Theme {
  sidebar: string;  // fondo de la barra lateral
  accent: string;   // selección, botones
  bubble: string;   // mis burbujas en chats de soporte
  glow?: string | null; // si existe, efecto neón con este color
}

export const DEFAULT_THEME: Theme = {
  sidebar: "#19171d",
  accent: "#1164a3",
  bubble: "#4f46e5",
};

export interface Agent {
  id: number;
  name: string;
  email?: string;
  color: string;
  role: "admin" | "agent";
  avatar?: string | null;
  status_emoji?: string | null;
  status_text?: string | null;
  theme?: Theme | null;
  dark_mode?: boolean;
  bg_image?: string | null;
  notif_enabled?: boolean;
  notif_sound?: boolean;
}

export interface Department {
  id: number;
  name: string;
  slug: string;
}

export interface Channel {
  id: number;
  name: string;
  type: "channel" | "dm" | "support";
  department_id?: number | null;
  department_name?: string | null;
  is_private: boolean;
  post_policy: "all" | "admin";
  is_member?: boolean;
}

export interface Reaction {
  emoji: string;
  count: number;
  agent_ids: number[];
}

export interface Message {
  id: number;
  channel_id: number;
  conversation_id?: number | null;
  author_type: "agent" | "visitor";
  author_id?: number | null;
  author_name: string;

  author_avatar?: string | null;
  body: string;
  kind: "text" | "sticker" | "image" | "file";
  parent_id?: number | null;
  reply_count?: string;
  reactions?: Reaction[];
  created_at: string;
}

export interface UploadedFile {
  url: string;
  name: string;
  mime: string;
  size: number;
}

export interface StickerItem {
  name: string;
  url: string;
}

export interface Dm {
  id: number;            // id del canal DM
  name: string;
  created_at: string;
  other_id: number;
  other_name: string;
  other_avatar?: string | null;
  other_status_emoji?: string | null;
  other_status_text?: string | null;
}

export interface SearchResult {
  id: number;
  channel_id: number;
  conversation_id?: number | null;
  author_type: "agent" | "visitor";
  author_name: string;
  body: string;
  kind: string;
  parent_id?: number | null;
  created_at: string;
  channel_name: string;
  channel_type: "channel" | "dm" | "support";
  visitor_name?: string | null;
  dm_other_name?: string | null;
}

// Contenido serializado de mensajes tipo image/file
export function parseFileBody(body: string): UploadedFile | null {
  try {
    const p = JSON.parse(body);
    return p && p.url ? (p as UploadedFile) : null;
  } catch {
    return null;
  }
}

export interface Conversation {
  id: number;
  status: "open" | "pending" | "closed";
  created_at: string;
  channel_id: number;
  visitor_name: string;
  visitor_email?: string;
  visitor_phone?: string;
  department_name?: string;
  department_id?: number;
  subject?: string;
  source?: "widget" | "email" | "whatsapp";
  assigned_agent_id?: number | null;
  assigned_agent_name?: string | null;
  message_count: string;
  last_message?: string;
}

export interface WhatsAppStatus {
  status: "disconnected" | "connecting" | "qr_ready" | "connected";
  qr: string | null;
  user: { id: string; name: string; phone: string } | null;
}




/* ------------------------------- auth storage ------------------------------- */

const TOKEN_KEY = "kasupport_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let r: Response;
  try {
    r = await fetch(`${API}${path}`, { headers, ...init });
  } catch (err: any) {
    const detail = err?.message || String(err || "");
    throw new Error(`No se pudo conectar con el servidor backend (${API})${detail ? `: ${detail}` : ""}`);
  }


  if (r.status === 401) {
    setToken(null);
    throw new Error("sesión expirada o credenciales incorrectas");
  }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}


/* --------------------------------- endpoints -------------------------------- */

export const api = {
  // Auth
  register: (name: string, email: string, password: string) =>
    req<{ token: string; agent: Agent }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),
  login: (email: string, password: string) =>
    req<{ token: string; agent: Agent }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => req<Agent>("/api/auth/me"),
  updateMe: (data: {
    avatar?: string; name?: string; theme?: Theme | null; dark_mode?: boolean;
    bg_image?: string | null; notif_enabled?: boolean; notif_sound?: boolean;
    status_emoji?: string | null; status_text?: string | null;
  }) => req<Agent>("/api/agents/me", { method: "PATCH", body: JSON.stringify(data) }),
  agents: () => req<Agent[]>("/api/agents"),
  createAgent: (data: { name: string; email: string; password: string; role?: string; color?: string }) =>
    req<Agent>("/api/agents", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteAgent: (id: number) =>
    req<{ ok: boolean; agent: { id: number; name: string; email: string } }>(`/api/agents/${id}`, {
      method: "DELETE",
    }),
  setAgentRole: (id: number, role: string) =>
    req<Agent>(`/api/agents/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  changeAgentPassword: (id: number, password: string) =>
    req<{ ok: boolean }>(`/api/agents/${id}/password`, {
      method: "PATCH",
      body: JSON.stringify({ password }),
    }),


  // Departamentos
  departments: () => req<Department[]>("/api/departments"),
  createDepartment: (name: string) =>
    req<Department>("/api/departments", { method: "POST", body: JSON.stringify({ name }) }),
  renameDepartment: (id: number, name: string) =>
    req<Department>(`/api/departments/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteDepartment: (id: number) =>
    req<{ ok: boolean }>(`/api/departments/${id}`, { method: "DELETE" }),

  // Canales
  channels: () => req<Channel[]>("/api/channels"),
  createChannel: (name: string, opts?: { is_private?: boolean; post_policy?: string }) =>
    req<Channel>("/api/channels", {
      method: "POST",
      body: JSON.stringify({ name, ...opts }),
    }),
  updateChannel: (id: number, data: { name?: string; is_private?: boolean; post_policy?: string }) =>
    req<Channel>(`/api/channels/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteChannel: (id: number) =>
    req<{ ok: boolean }>(`/api/channels/${id}`, { method: "DELETE" }),
  channelMembers: (id: number) => req<Agent[]>(`/api/channels/${id}/members`),
  addChannelMember: (id: number, agentId: number) =>
    req<{ ok: boolean }>(`/api/channels/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ agentId }),
    }),
  removeChannelMember: (id: number, agentId: number) =>
    req<{ ok: boolean }>(`/api/channels/${id}/members/${agentId}`, { method: "DELETE" }),

  // Mensajes directos
  dms: () => req<Dm[]>("/api/dms"),
  createDm: (agentId: number) =>
    req<{ channel_id: number }>("/api/dms", {
      method: "POST",
      body: JSON.stringify({ agentId }),
    }),

  // Estado y Sincronización del correo IMAP/SMTP
  emailStatus: () =>
    req<{
      poller: {
        enabled: boolean;
        isPolling: boolean;
        user: string | null;
        host: string | null;
        lastPollTime: string | null;
        lastError: string | null;
        processedCount: number;
      };
      smtp: {
        enabled: boolean;
        from: string;
      };
    }>("/api/email/status"),
  emailSync: () =>
    req<{
      success: boolean;
      newlyProcessed: number;
      totalProcessed: number;
      lastPollTime: string;
      lastError: string | null;
    }>("/api/email/sync", { method: "POST" }),

  // WhatsApp Baileys
  whatsAppStatus: () => req<WhatsAppStatus>("/api/whatsapp/status"),
  whatsAppConnect: () => req<WhatsAppStatus>("/api/whatsapp/connect", { method: "POST" }),
  whatsAppDisconnect: () => req<WhatsAppStatus>("/api/whatsapp/disconnect", { method: "POST" }),




  // Búsqueda global
  search: (q: string) => req<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`),

  // Conversaciones y mensajes
  conversations: () => req<Conversation[]>("/api/conversations"),
  setConversationStatus: (id: number, status: string) =>
    req<Conversation>(`/api/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  assignConversation: (id: number, agentId: number | null) =>
    req<Conversation>(`/api/conversations/${id}/assign`, {
      method: "PATCH",
      body: JSON.stringify({ agentId }),
    }),
  deleteConversation: (id: number) =>
    req<{ ok: boolean; id: number }>(`/api/conversations/${id}`, {
      method: "DELETE",
    }),
  bulkDeleteConversations: (options: { ids?: number[]; onlyClosed?: boolean }) =>
    req<{ ok: boolean; deletedCount: number }>("/api/conversations/bulk-delete", {
      method: "POST",
      body: JSON.stringify(options),
    }),


  messages: (channelId: number) => req<Message[]>(`/api/channels/${channelId}/messages`),
  sendMessage: (channelId: number, body: string, kind: "text" | "sticker" | "image" | "file" = "text", parentId?: number) =>
    req<Message>(`/api/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body, kind, parent_id: parentId }),
    }),
  thread: (messageId: number) =>
    req<{ parent: Message; replies: Message[] }>(`/api/messages/${messageId}/replies`),
  toggleReaction: (messageId: number, emoji: string) =>
    req<{ message_id: number; channel_id: number; reactions: Reaction[] }>(
      `/api/messages/${messageId}/reactions`,
      { method: "POST", body: JSON.stringify({ emoji }) }
    ),

  // Archivos y stickers
  upload: (file: UploadedFilePayload) =>
    req<UploadedFile>("/api/upload", { method: "POST", body: JSON.stringify(file) }),
  stickers: () => req<StickerItem[]>("/api/stickers"),
  uploadSticker: (name: string, file: UploadedFilePayload) =>
    req<StickerItem>("/api/stickers", {
      method: "POST",
      body: JSON.stringify({ name, mime: file.mime, data: file.data }),
    }),
  deleteSticker: (name: string) =>
    req<{ ok: boolean }>(`/api/stickers/${name}`, { method: "DELETE" }),

  // Reuniones tipo Google Meet
  createMeeting: async (title?: string) => {
    const res = await req<any>("/api/meetings", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    return (res?.meeting || res) as Meeting;
  },

  getMeeting: (publicId: string) => req<Meeting>(`/api/meetings/${publicId}`),
  joinMeeting: (publicId: string, displayName?: string) =>
    req<{ join_token?: string; participant?: unknown }>(`/api/meetings/${publicId}/join`, {
      method: "POST",
      body: JSON.stringify({ display_name: displayName }),
    }),
};

export interface Meeting {
  id: number;
  public_id: string;
  title: string;
  status: "active" | "ended";
  created_at: string;
  host_agent_id?: number | null;
  host_name?: string;
  host_avatar?: string | null;
}


export interface UploadedFilePayload {
  name: string;
  mime: string;
  data: string; // base64 sin prefijo
}

export function fileToBase64(file: File): Promise<UploadedFilePayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve({ name: file.name || "archivo", mime: file.type || "application/octet-stream", data: base64 });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Redimensiona una imagen a data URL cuadrada (para foto de perfil)
export function fileToAvatar(file: File, size = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const s = Math.max(size / img.width, size / img.height);
      const sw = img.width * s;
      const sh = img.height * s;
      ctx.drawImage(img, (size - sw) / 2, (size - sh) / 2, sw, sh);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
