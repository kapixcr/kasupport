import { useEffect, useRef, useState } from "react";
import {
  API,
  api,
  type Agent,
  type Channel,
  type Department,
  type Theme,
  type WhatsAppStatus,
} from "@/lib/api";
import { desktopNotify, ensureNotificationPermission, playDing } from "@/lib/notify";
import {
  Settings,
  Hash,
  Building2,
  Users,
  Code2,
  Mail,
  Palette,
  Bell,
  X,
  Plus,
  Lock,
  Megaphone,
  Pencil,
  Trash2,
  KeyRound,
  Copy,
  CheckCheck,
  RefreshCw,
  Moon,
  Sun,
  ImagePlus,
  Volume2,
  BellRing,
  MessageSquare,
  QrCode,
  Smartphone,
  Unlink,
  CheckCircle2,
  Sparkles,
} from "lucide-react";


function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${on ? "bg-indigo-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${on ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

interface Props {
  me: Agent;
  theme: Theme;
  onThemeChange: (theme: Theme | null) => void;
  darkMode: boolean;
  onDarkModeChange: (dark: boolean) => void;
  bgImage?: string | null;
  onBgImageChange: (dataUrl: string | null) => void;
  onPrefChange: (data: { notif_enabled?: boolean; notif_sound?: boolean }) => void;
  onClose: () => void;
  onChanged: () => void;
}

type Tab = "canales" | "departamentos" | "equipo" | "widget" | "correo" | "whatsapp" | "apariencia" | "avisos" | "actualizaciones";


const PRESETS: { name: string; theme: Theme }[] = [
  { name: "Slack oscuro", theme: { sidebar: "#19171d", accent: "#1164a3", bubble: "#4f46e5" } },
  { name: "Bosque",       theme: { sidebar: "#0f2e1d", accent: "#2eb67d", bubble: "#007a5a" } },
  { name: "Uva",          theme: { sidebar: "#2d1b4e", accent: "#7c5cfc", bubble: "#7c5cfc" } },
  { name: "Cereza",       theme: { sidebar: "#3d0c1e", accent: "#e01e5a", bubble: "#e01e5a" } },
  { name: "Océano",       theme: { sidebar: "#0b2545", accent: "#168aad", bubble: "#168aad" } },
  { name: "Café",         theme: { sidebar: "#2b211b", accent: "#b07d4f", bubble: "#8c5a33" } },
];

const NEON_PRESETS: { name: string; theme: Theme }[] = [
  { name: "Cyber",  theme: { sidebar: "#0a0a12", accent: "#00e5ff", bubble: "#7b2ff7", glow: "#00e5ff" } },
  { name: "Verde",  theme: { sidebar: "#050d05", accent: "#39ff14", bubble: "#15803d", glow: "#39ff14" } },
  { name: "Rosa",   theme: { sidebar: "#12051a", accent: "#ff2ec4", bubble: "#a21caf", glow: "#ff2ec4" } },
  { name: "Ámbar",  theme: { sidebar: "#140d02", accent: "#ffb020", bubble: "#b45309", glow: "#ffb020" } },
];

/* --------------------------- fila editable genérica --------------------------- */

interface RowProps {
  label: string;
  sub?: string;
  canEdit: boolean;
  onRename: (name: string) => void;
  onDelete?: () => void;
  deleteLabel?: string;
}

function EditableRow({ label, sub, canEdit, onRename, onDelete, deleteLabel = "Eliminar" }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label);
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="py-2.5 flex items-center gap-2">
      {editing ? (
        <form
          className="flex-1 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && name.trim() !== label) onRename(name.trim());
            setEditing(false);
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-xl px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <button className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold px-2 py-1">
            Guardar
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setName(label); }}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 px-1"
          >
            Cancelar
          </button>
        </form>
      ) : (
        <>
          <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 flex-1 truncate">{label}</span>
          {sub && <span className="text-[10px] text-zinc-400 font-mono">{sub}</span>}
          {canEdit && !confirming && (
            <div className="flex items-center gap-1">
              <button
                className="p-1 rounded-lg text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                onClick={() => setEditing(true)}
                title="Renombrar"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              {onDelete && (
                <button
                  className="p-1 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                  onClick={() => setConfirming(true)}
                  title={deleteLabel}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
          {confirming && (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-zinc-500 text-[11px]">¿Eliminar?</span>
              <button
                className="text-rose-600 font-semibold hover:underline"
                onClick={() => { setConfirming(false); onDelete?.(); }}
              >
                Sí
              </button>
              <button className="text-zinc-400 hover:underline" onClick={() => setConfirming(false)}>No</button>
            </span>
          )}
        </>
      )}
    </li>
  );
}

/* ------------------------ gestión de miembros (privados) ---------------------- */

function MembersManager({ channel, onChanged }: { channel: Channel; onChanged: () => void }) {
  const [members, setMembers] = useState<Agent[]>([]);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState("");

  const load = () => {
    api.channelMembers(channel.id).then(setMembers).catch(() => {});
    api.agents().then(setAllAgents).catch(() => {});
  };
  useEffect(load, [channel.id]);

  const nonMembers = allAgents.filter((a) => !members.some((m) => m.id === a.id));

  return (
    <div className="mt-2 ml-2 border-l-2 border-zinc-100 dark:border-zinc-800 pl-3 pb-2">
      <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1">Miembros ({members.length})</p>
      <ul className="space-y-1 mb-2">
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between text-xs text-zinc-700 dark:text-zinc-300">
            <span>{m.name}</span>
            <button
              className="text-[11px] text-rose-500 hover:text-rose-700 hover:underline"
              onClick={() => api.removeChannelMember(channel.id, m.id).then(() => { load(); onChanged(); })}
            >
              quitar
            </button>
          </li>
        ))}
      </ul>
      {nonMembers.length > 0 && (
        <div className="flex gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-lg px-2 py-1 text-xs flex-1 outline-none"
          >
            <option value="">Agregar miembro...</option>
            {nonMembers.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button
            disabled={!selected}
            onClick={() =>
              api.addChannelMember(channel.id, Number(selected)).then(() => { setSelected(""); load(); onChanged(); })
            }
            className="text-xs bg-indigo-600 disabled:opacity-40 text-white rounded-lg px-2.5 py-1 font-medium transition-all"
          >
            Agregar
          </button>
        </div>
      )}
    </div>
  );
}

/* ----------------------- gestión de agentes y contraseñas --------------------- */

function AgentRow({
  agent,
  me,
  isAdmin,
  onRoleChange,
}: {
  agent: Agent;
  me: Agent;
  isAdmin: boolean;
  onRoleChange: (role: string) => void;
}) {
  const [changingPass, setChangingPass] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [passError, setPassError] = useState("");
  const [passSuccess, setPassSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError("");
    setPassSuccess("");
    if (newPass.length < 6) {
      setPassError("Mínimo 6 caracteres");
      return;
    }
    setLoading(true);
    try {
      await api.changeAgentPassword(agent.id, newPass);
      setPassSuccess("¡Contraseña actualizada!");
      setNewPass("");
      setTimeout(() => {
        setChangingPass(false);
        setPassSuccess("");
      }, 1500);
    } catch (err) {
      setPassError(err instanceof Error ? err.message : "Error al cambiar contraseña");
    } finally {
      setLoading(false);
    }
  };

  return (
    <li className="py-3 border-b border-zinc-100 dark:border-zinc-800/80 last:border-0">
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-xl text-white flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden shadow-xs"
          style={{ background: agent.color || "#4f46e5" }}
        >
          {agent.avatar ? (
            <img src={agent.avatar} alt={agent.name} className="w-full h-full object-cover" />
          ) : (
            agent.name.charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{agent.name}</p>
          <p className="text-[10px] text-zinc-400 truncate">{agent.email}</p>
        </div>

        {(isAdmin || agent.id === me.id) && (
          <button
            onClick={() => {
              setChangingPass(!changingPass);
              setPassError("");
              setPassSuccess("");
            }}
            className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium inline-flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-1 rounded-lg border border-indigo-100 dark:border-indigo-900"
            title="Cambiar contraseña"
          >
            <KeyRound className="w-3 h-3" />
            <span>Clave</span>
          </button>
        )}

        {isAdmin && agent.id !== me.id ? (
          <select
            value={agent.role}
            onChange={(e) => onRoleChange(e.target.value)}
            className="border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-400"
          >
            <option value="agent">agente</option>
            <option value="admin">admin</option>
          </select>
        ) : (
          <span className="text-[10px] font-bold text-zinc-500 uppercase px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-md">
            {agent.role}
          </span>
        )}
      </div>

      {changingPass && (
        <form onSubmit={handlePasswordSubmit} className="mt-2.5 ml-11 flex flex-col gap-1.5 bg-zinc-50 dark:bg-zinc-800/50 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700">
          <div className="flex gap-2">
            <input
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="Nueva contraseña (mín. 6 caracteres)"
              required
              minLength={6}
              className="flex-1 border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-lg px-2.5 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1 rounded-lg transition-all"
            >
              {loading ? "Guardando..." : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => setChangingPass(false)}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 px-1"
            >
              Cancelar
            </button>
          </div>
          {passError && <p className="text-xs text-rose-500 font-medium">{passError}</p>}
          {passSuccess && <p className="text-xs text-emerald-500 font-medium">{passSuccess}</p>}
        </form>
      )}
    </li>
  );
}

/* ----------------------- gestión de actualizaciones ----------------------- */

interface UpdateStatusInfo {
  version?: string;
}

interface UpdateStatusState {
  status: string;
  info?: UpdateStatusInfo | null;
  progress?: { percent: number } | null;
  error?: string | null;
}

function UpdatesManager() {
  const [version, setVersion] = useState<string>("0.1.0");
  const [statusData, setStatusData] = useState<UpdateStatusState>({ status: "idle" });
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const desktop = (window as unknown as {
      kasupportDesktop?: {
        getAppVersion?: () => Promise<string>;
        getUpdateStatus?: () => Promise<UpdateStatusState>;
        onUpdateStatus?: (callback: (data: UpdateStatusState) => void) => () => void;
      };
    }).kasupportDesktop;

    if (!desktop) return;
    if (desktop.getAppVersion) {
      desktop.getAppVersion().then((v) => v && setVersion(v)).catch(() => {});
    }
    if (desktop.getUpdateStatus) {
      desktop.getUpdateStatus().then((s) => s && setStatusData(s)).catch(() => {});
    }
    if (desktop.onUpdateStatus) {
      const unsub = desktop.onUpdateStatus((s) => {
        setStatusData(s);
        setChecking(false);
      });
      return unsub;
    }
  }, []);

  const handleCheck = async () => {
    const desktop = (window as unknown as {
      kasupportDesktop?: {
        checkForUpdates?: () => Promise<{ dev?: boolean; error?: string }>;
      };
    }).kasupportDesktop;

    if (!desktop?.checkForUpdates) {
      setMessage("Las actualizaciones automáticas están activas en la app de escritorio instalada.");
      return;
    }
    setChecking(true);
    setMessage(null);
    try {
      const res = await desktop.checkForUpdates();
      if (res?.dev) {
        setMessage("Estás en modo de desarrollo (ELECTRON_DEV=1).");
      }
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Error al buscar actualizaciones.");
    } finally {
      setChecking(false);
    }
  };

  const handleRestart = () => {
    const desktop = (window as unknown as {
      kasupportDesktop?: {
        quitAndInstall?: () => void;
      };
    }).kasupportDesktop;
    if (desktop?.quitAndInstall) {
      desktop.quitAndInstall();
    }
  };

  return (
    <div className="space-y-5">
      {/* Versión actual */}
      <div className="bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl p-5 border border-zinc-200/80 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase">
              Versión instalada
            </span>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
              Kasupport v{version}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Canal de distribución: GitHub Releases (kapixcr/kasupport)
            </p>
          </div>
          <button
            onClick={handleCheck}
            disabled={checking || statusData.status === "downloading"}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? "animate-spin" : ""}`} />
            <span>{checking ? "Buscando..." : "Buscar actualizaciones"}</span>
          </button>
        </div>
      </div>

      {/* Estado del Auto-Updater */}
      {statusData.status === "downloading" && statusData.progress && (
        <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
          <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
            Descargando nueva versión ({Math.round(statusData.progress.percent)}%)...
          </p>
          <div className="w-full bg-indigo-200 dark:bg-indigo-900 rounded-full h-2 mt-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.round(statusData.progress.percent)}%` }}
            />
          </div>
        </div>
      )}

      {statusData.status === "downloaded" && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Nueva versión lista para instalar ({statusData.info?.version ? `v${statusData.info.version}` : ""})
            </p>
            <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
              Reinicia Kasupport para aplicar los cambios.
            </p>
          </div>
          <button
            onClick={handleRestart}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reiniciar ahora
          </button>
        </div>
      )}

      {statusData.status === "not-available" && (
        <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 flex items-center gap-2.5 text-xs text-zinc-600 dark:text-zinc-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>Tienes instalada la versión más reciente de Kasupport.</span>
        </div>
      )}

      {statusData.status === "error" && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-600 dark:text-rose-400">
          <p className="font-semibold">Estado de actualización:</p>
          <p className="text-[11px] mt-0.5">{statusData.error}</p>
        </div>
      )}

      {message && (
        <div className="p-3.5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-300">
          {message}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- modal --------------------------------- */

export function SettingsModal({ me, theme, onThemeChange, darkMode, onDarkModeChange, bgImage, onBgImageChange, onPrefChange, onClose, onChanged }: Props) {
  const bgFileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("canales");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [newItem, setNewItem] = useState("");
  const [newPrivate, setNewPrivate] = useState(false);
  const [newAdminOnly, setNewAdminOnly] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [emailInfo, setEmailInfo] = useState<{
    poller: { enabled: boolean; isPolling: boolean; user: string | null; host: string | null; lastPollTime: string | null; lastError: string | null; processedCount: number };
    smtp: { enabled: boolean; from: string };
  } | null>(null);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [whatsAppInfo, setWhatsAppInfo] = useState<WhatsAppStatus | null>(null);
  const [loadingWhatsApp, setLoadingWhatsApp] = useState(false);
  const [waActionLoading, setWaActionLoading] = useState(false);
  const isAdmin = me.role === "admin";

  const load = () => {
    api.channels().then(setChannels).catch(() => {});
    api.departments().then(setDepartments).catch(() => {});
    api.agents().then(setAgents).catch(() => {});
  };
  useEffect(load, []);

  const loadEmailStatus = () => {
    setLoadingEmail(true);
    api.emailStatus()
      .then(setEmailInfo)
      .catch(() => {})
      .finally(() => setLoadingEmail(false));
  };

  const loadWhatsAppStatus = () => {
    setLoadingWhatsApp(true);
    api.whatsAppStatus()
      .then(setWhatsAppInfo)
      .catch(() => {})
      .finally(() => setLoadingWhatsApp(false));
  };

  const handleConnectWhatsApp = async () => {
    setWaActionLoading(true);
    setError("");
    try {
      const res = await api.whatsAppConnect();
      setWhatsAppInfo(res);
    } catch (e: any) {
      setError(e.message || "Error al conectar WhatsApp");
    } finally {
      setWaActionLoading(false);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    if (!confirm("¿Deseas desconectar la sesión de WhatsApp? Dejarás de recibir y enviar tickets por WhatsApp.")) return;
    setWaActionLoading(true);
    setError("");
    try {
      const res = await api.whatsAppDisconnect();
      setWhatsAppInfo(res);
    } catch (e: any) {
      setError(e.message || "Error al desconectar WhatsApp");
    } finally {
      setWaActionLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "correo") loadEmailStatus();
    if (tab === "whatsapp") {
      loadWhatsAppStatus();
      const interval = setInterval(loadWhatsAppStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [tab]);

  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };

  const embedSnippet = `<!-- Kasupport: burbuja de soporte -->\n<script src="${API}/widget.js" async></script>`;
  const copyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedSnippet);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = embedSnippet;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "canales", label: "Canales", icon: <Hash className="w-3.5 h-3.5" /> },
    { id: "departamentos", label: "Dptos", icon: <Building2 className="w-3.5 h-3.5" /> },
    { id: "equipo", label: "Equipo", icon: <Users className="w-3.5 h-3.5" /> },
    { id: "widget", label: "Widget", icon: <Code2 className="w-3.5 h-3.5" /> },
    { id: "correo", label: "Correo", icon: <Mail className="w-3.5 h-3.5" /> },
    { id: "whatsapp", label: "WhatsApp", icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: "apariencia", label: "Tema", icon: <Palette className="w-3.5 h-3.5" /> },
    { id: "avisos", label: "Avisos", icon: <Bell className="w-3.5 h-3.5" /> },
    { id: "actualizaciones", label: "Versión", icon: <Sparkles className="w-3.5 h-3.5" /> },
  ];


  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">Configuración del Sistema</h2>
              <p className="text-[11px] text-zinc-400">Administra canales, accesos y apariencia</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <nav className="px-6 pt-3 pb-2 border-b border-zinc-100 dark:border-zinc-800/80 flex gap-1.5 overflow-x-auto bg-zinc-50/50 dark:bg-zinc-950/40">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-xs px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 transition-all shrink-0 ${
                tab === t.id
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800"
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && <p className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200 dark:border-rose-800 mb-4">{error}</p>}

          {tab === "canales" && (
            <>
              {isAdmin && (
                <form
                  className="mb-4 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newItem.trim())
                      run(() =>
                        api.createChannel(newItem.trim(), {
                          is_private: newPrivate,
                          post_policy: newAdminOnly ? "admin" : "all",
                        })
                      );
                    setNewItem(""); setNewPrivate(false); setNewAdminOnly(false);
                  }}
                >
                  <div className="flex gap-2">
                    <input
                      value={newItem}
                      onChange={(e) => setNewItem(e.target.value)}
                      placeholder="nuevo-canal"
                      className="flex-1 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                    <button className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl px-4 py-2 flex items-center gap-1.5 transition-all shadow-sm">
                      <Plus className="w-3.5 h-3.5" /> Crear
                    </button>
                  </div>
                  <div className="flex gap-4 text-xs text-zinc-600 dark:text-zinc-400">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={newPrivate} onChange={(e) => setNewPrivate(e.target.checked)} className="rounded" />
                      <Lock className="w-3 h-3" /> Privado
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={newAdminOnly} onChange={(e) => setNewAdminOnly(e.target.checked)} className="rounded" />
                      <Megaphone className="w-3 h-3" /> Solo admins
                    </label>
                  </div>
                </form>
              )}
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {channels.map((c) => (
                  <li key={c.id} className="py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-800 dark:text-zinc-200 flex-1 truncate flex items-center gap-1.5 font-medium">
                        {c.is_private ? <Lock className="w-3.5 h-3.5 text-amber-500" /> : c.post_policy === "admin" ? <Megaphone className="w-3.5 h-3.5 text-indigo-500" /> : <Hash className="w-3.5 h-3.5 text-zinc-400" />}
                        {c.name}
                      </span>
                      {isAdmin && (
                        <>
                          <label className="text-xs text-zinc-500 flex items-center gap-1" title="Canal privado">
                            <input
                              type="checkbox"
                              checked={c.is_private}
                              onChange={(e) => run(() => api.updateChannel(c.id, { is_private: e.target.checked }))}
                            />
                            Privado
                          </label>
                          <label className="text-xs text-zinc-500 flex items-center gap-1" title="Solo admins escriben">
                            <input
                              type="checkbox"
                              checked={c.post_policy === "admin"}
                              onChange={(e) =>
                                run(() => api.updateChannel(c.id, { post_policy: e.target.checked ? "admin" : "all" }))
                              }
                            />
                            Solo admin
                          </label>
                          <button
                            className="text-xs text-rose-500 hover:text-rose-600 hover:underline"
                            onClick={() => run(() => api.deleteChannel(c.id))}
                          >
                            Archivar
                          </button>
                        </>
                      )}
                    </div>
                    {c.is_private && isAdmin && <MembersManager channel={c} onChanged={onChanged} />}
                  </li>
                ))}
              </ul>
            </>
          )}

          {tab === "departamentos" && (
            <>
              {isAdmin && (
                <form
                  className="flex gap-2 mb-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newItem.trim()) run(() => api.createDepartment(newItem.trim()));
                    setNewItem("");
                  }}
                >
                  <input
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    placeholder="Nuevo departamento (ej: Ventas, Soporte TI)"
                    className="flex-1 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                  <button className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl px-4 py-2 flex items-center gap-1.5 transition-all shadow-sm">
                    <Plus className="w-3.5 h-3.5" /> Crear
                  </button>
                </form>
              )}
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {departments.map((d) => (
                  <EditableRow
                    key={d.id}
                    label={d.name}
                    sub={d.slug}
                    canEdit={isAdmin}
                    onRename={(name) => run(() => api.renameDepartment(d.id, name))}
                    onDelete={() => run(() => api.deleteDepartment(d.id))}
                  />
                ))}
              </ul>
              <p className="text-[11px] text-zinc-400 mt-3">
                Los visitantes del widget web eligen uno de estos departamentos al iniciar un chat.
              </p>
            </>
          )}

          {tab === "equipo" && (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {agents.map((a) => (
                <AgentRow
                  key={a.id}
                  agent={a}
                  me={me}
                  isAdmin={isAdmin}
                  onRoleChange={(role) => run(() => api.setAgentRole(a.id, role))}
                />
              ))}
            </ul>
          )}

          {tab === "widget" && (
            <div className="space-y-4">
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                Pega este código en cualquier página web antes de <code>&lt;/body&gt;</code> para mostrar
                la burbuja de soporte en tiempo real:
              </p>
              <pre className="bg-zinc-950 text-emerald-400 font-mono text-xs rounded-2xl p-4 overflow-x-auto border border-zinc-800">
                {embedSnippet}
              </pre>
              <button
                onClick={copyEmbed}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl py-2.5 text-xs transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                {copied ? <CheckCheck className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? "¡Copiado al portapapeles!" : "Copiar código embed"}</span>
              </button>
            </div>
          )}

          {tab === "correo" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <div>
                  <h3 className="font-bold text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-indigo-500" /> Integración Google Workspace
                  </h3>
                  <p className="text-[10px] text-zinc-400">
                    Buzón: <strong>soporte@kapix.co.cr</strong>
                  </p>
                </div>
                <button
                  onClick={loadEmailStatus}
                  disabled={loadingEmail}
                  className="text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingEmail ? "animate-spin" : ""}`} />
                  <span>Actualizar</span>
                </button>
              </div>

              {/* Estado IMAP */}
              <div className="bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl p-4 border border-zinc-200/80 dark:border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${emailInfo?.poller?.enabled ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                    <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                      Lector Entrante (IMAP)
                    </span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    emailInfo?.poller?.enabled
                      ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                      : "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                  }`}>
                    {emailInfo?.poller?.enabled ? "Activo" : "Pendiente"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                  <div>
                    <span className="text-zinc-400 block text-[10px]">Cuenta:</span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200">
                      {emailInfo?.poller?.user || "soporte@kapix.co.cr"}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[10px]">Servidor:</span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200">
                      {emailInfo?.poller?.host || "imap.gmail.com"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "whatsapp" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <div>
                  <h3 className="font-bold text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-emerald-500" /> WhatsApp Tickets (Baileys)
                  </h3>
                  <p className="text-[10px] text-zinc-400">
                    Atención de soporte en tiempo real vía WhatsApp Web
                  </p>
                </div>
                <button
                  onClick={loadWhatsAppStatus}
                  disabled={loadingWhatsApp}
                  className="text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingWhatsApp ? "animate-spin" : ""}`} />
                  <span>Actualizar</span>
                </button>
              </div>

              {/* Estado conectado */}
              {whatsAppInfo?.status === "connected" && (
                <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        WhatsApp Vinculado y Activo
                      </span>
                    </div>
                    <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full">
                      En línea
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] bg-white/70 dark:bg-zinc-900/70 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                    <div>
                      <span className="text-zinc-400 block text-[10px]">Número Vinculado:</span>
                      <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        {whatsAppInfo.user?.phone ? `+${whatsAppInfo.user.phone}` : "Desconocido"}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-400 block text-[10px]">Nombre de Sesión:</span>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        {whatsAppInfo.user?.name || "WhatsApp Web"}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    ✓ Los mensajes entrantes a este número crearán tickets automáticamente.
                    <br />
                    ✓ Las respuestas que envíen los agentes en Kasupport llegarán directamente al cliente.
                  </p>

                  <div className="pt-2 border-t border-emerald-100 dark:border-emerald-900/40 flex justify-end">
                    <button
                      onClick={handleDisconnectWhatsApp}
                      disabled={waActionLoading}
                      className="text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      <span>{waActionLoading ? "Desconectando..." : "Desconectar WhatsApp"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Esperando escaneo de código QR */}
              {whatsAppInfo?.status === "qr_ready" && whatsAppInfo.qr && (
                <div className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 text-center space-y-4">
                  <div className="flex flex-col items-center">
                    <div className="bg-white p-3 rounded-2xl shadow-md border border-zinc-200 dark:border-zinc-700">
                      <img
                        src={whatsAppInfo.qr}
                        alt="Código QR de WhatsApp"
                        className="w-48 h-48 rounded-lg"
                      />
                    </div>
                    <span className="mt-2 text-[10px] text-zinc-400 flex items-center gap-1">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Se actualiza automáticamente
                    </span>
                  </div>

                  <div className="bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700/80 text-left text-xs space-y-1.5 text-zinc-600 dark:text-zinc-300">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-emerald-500" /> Pasos para vincular:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <li>Abre <strong>WhatsApp</strong> en tu celular.</li>
                      <li>Toca <strong>Menú (⋮)</strong> o <strong>Ajustes</strong> &gt; <strong>Dispositivos vinculados</strong>.</li>
                      <li>Toca <strong>Vincular un dispositivo</strong> y apunta tu cámara a este código QR.</li>
                    </ol>
                  </div>

                  <button
                    onClick={handleDisconnectWhatsApp}
                    disabled={waActionLoading}
                    className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline font-medium"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {/* Estado conectando */}
              {whatsAppInfo?.status === "connecting" && (
                <div className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 text-center space-y-3">
                  <RefreshCw className="w-6 h-6 text-emerald-500 animate-spin mx-auto" />
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    Iniciando conexión con WhatsApp...
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Generando código QR seguro para vincular tu dispositivo.
                  </p>
                </div>
              )}

              {/* Estado desconectado */}
              {(!whatsAppInfo || whatsAppInfo.status === "disconnected") && (
                <div className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <QrCode className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        Vincular número de WhatsApp
                      </h4>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Convierte chats de WhatsApp en tickets atendidos por tus agentes.
                      </p>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700/80 text-[11px] text-zinc-600 dark:text-zinc-300 space-y-1">
                    <p className="font-semibold text-zinc-800 dark:text-zinc-200">✨ Características:</p>
                    <ul className="list-disc list-inside text-zinc-500 dark:text-zinc-400 space-y-0.5 text-[10px]">
                      <li>Multi-agente: Todos tus agentes podrán responder desde Kasupport.</li>
                      <li>Soporte para fotos, audios, documentos y texto.</li>
                      <li>Sin costos por mensaje de Meta ni APIs complejas.</li>
                    </ul>
                  </div>

                  <button
                    onClick={handleConnectWhatsApp}
                    disabled={waActionLoading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98]"
                  >
                    {waActionLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Generando código QR...</span>
                      </>
                    ) : (
                      <>
                        <QrCode className="w-4 h-4" />
                        <span>Generar Código QR de Vinculación</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === "avisos" && (

            <div className="space-y-4">
              <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl p-4 border border-zinc-200/80 dark:border-zinc-800">
                <div>
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 flex items-center gap-1.5">
                    <BellRing className="w-3.5 h-3.5 text-indigo-500" /> Notificaciones de escritorio
                  </p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Avisos del sistema operativo aunque la app esté en segundo plano
                  </p>
                </div>
                <Toggle
                  on={me.notif_enabled !== false}
                  onClick={() => onPrefChange({ notif_enabled: me.notif_enabled === false })}
                />
              </div>

              <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl p-4 border border-zinc-200/80 dark:border-zinc-800">
                <div>
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-indigo-500" /> Sonido de aviso (Ding)
                  </p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Reproduce un sonido cuando llega un mensaje o chat nuevo
                  </p>
                </div>
                <Toggle
                  on={me.notif_sound !== false}
                  onClick={() => onPrefChange({ notif_sound: me.notif_sound === false })}
                />
              </div>

              <button
                onClick={async () => {
                  const granted = await ensureNotificationPermission();
                  playDing();
                  if (granted) desktopNotify("🔔 Prueba de Kasupport", "Así se verán los avisos en tu pantalla");
                }}
                className="w-full border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold rounded-xl py-2.5 hover:bg-indigo-100/50 dark:hover:bg-indigo-900/40 transition-all flex items-center justify-center gap-2"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Probar sonido y notificación</span>
              </button>
            </div>
          )}

          {tab === "apariencia" && (
            <div className="space-y-5">
              {/* Modo Oscuro */}
              <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl p-4 border border-zinc-200/80 dark:border-zinc-800">
                <div>
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 flex items-center gap-1.5">
                    {darkMode ? <Moon className="w-3.5 h-3.5 text-indigo-400" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
                    {darkMode ? "Modo oscuro activo" : "Modo claro activo"}
                  </p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Ajusta los fondos del área de chat y paneles secundarios
                  </p>
                </div>
                <Toggle on={darkMode} onClick={() => onDarkModeChange(!darkMode)} />
              </div>

              {/* Presets Rápidos */}
              <div>
                <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2">Temas rápidos</p>
                <div className="grid grid-cols-3 gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => onThemeChange(p.theme)}
                      className="border border-zinc-200 dark:border-zinc-800 rounded-2xl p-2.5 hover:border-indigo-400 text-left bg-zinc-50/50 dark:bg-zinc-800/40 transition-all"
                    >
                      <span className="flex gap-1.5 mb-1.5">
                        <span className="w-4 h-4 rounded-md" style={{ background: p.theme.sidebar }} />
                        <span className="w-4 h-4 rounded-md" style={{ background: p.theme.accent }} />
                        <span className="w-4 h-4 rounded-md" style={{ background: p.theme.bubble }} />
                      </span>
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Presets Neón */}
              <div>
                <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2">Temas Neón</p>
                <div className="grid grid-cols-4 gap-2">
                  {NEON_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => onThemeChange(p.theme)}
                      className="rounded-2xl p-2.5 text-left border transition-all"
                      style={{
                        background: p.theme.sidebar,
                        borderColor: p.theme.glow || p.theme.accent,
                        boxShadow: `0 0 10px ${p.theme.glow}40`,
                      }}
                    >
                      <span
                        className="block text-xs font-bold"
                        style={{ color: p.theme.accent, textShadow: `0 0 6px ${p.theme.glow}` }}
                      >
                        {p.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fondo Personalizado */}
              <div>
                <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2">Fondo del área de mensajes</p>
                <input
                  ref={bgFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => onBgImageChange(String(reader.result));
                    reader.readAsDataURL(f);
                  }}
                />
                {bgImage ? (
                  <div className="flex items-center gap-3">
                    <img src={bgImage} alt="fondo" className="w-20 h-14 object-cover rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-xs" />
                    <button
                      onClick={() => onBgImageChange(null)}
                      className="text-xs text-rose-500 hover:text-rose-600 border border-rose-200 dark:border-rose-900 rounded-xl px-3 py-1.5 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors"
                    >
                      Quitar fondo
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => bgFileRef.current?.click()}
                    className="text-xs text-indigo-600 dark:text-indigo-400 border border-dashed border-indigo-200 dark:border-indigo-800 rounded-2xl px-4 py-3 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 w-full flex items-center justify-center gap-2 transition-all font-medium"
                  >
                    <ImagePlus className="w-4 h-4" />
                    <span>Subir imagen de fondo</span>
                  </button>
                )}
              </div>

              {/* Colores individuales */}
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Colores personalizados</p>
                {(
                  [
                    ["sidebar", "Barra lateral"],
                    ["accent", "Acento (botones y selección)"],
                    ["bubble", "Burbujas de soporte"],
                  ] as ["sidebar" | "accent" | "bubble", string][]
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-3 text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/40 p-2 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
                    <input
                      type="color"
                      value={theme[key]}
                      onChange={(e) => onThemeChange({ ...theme, [key]: e.target.value })}
                      className="w-8 h-8 rounded-lg cursor-pointer border border-zinc-300 dark:border-zinc-700 bg-transparent"
                    />
                    <span className="font-medium">{label}</span>
                    <span className="text-[11px] font-mono text-zinc-400 ml-auto">{theme[key]}</span>
                  </label>
                ))}
              </div>

              <button
                onClick={() => onThemeChange(null)}
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 transition-colors"
              >
                Restablecer colores por defecto
              </button>
            </div>
          )}

          {tab === "actualizaciones" && <UpdatesManager />}
        </div>
      </div>
    </div>
  );
}
