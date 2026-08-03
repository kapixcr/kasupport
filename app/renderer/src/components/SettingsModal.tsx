import { useEffect, useRef, useState } from "react";
import {
  API,
  api,
  type Agent,
  type Channel,
  type Department,
  type Theme,
} from "@/lib/api";
import { desktopNotify, ensureNotificationPermission, playDing } from "@/lib/notify";

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-12 h-7 rounded-full relative transition-colors shrink-0 ${on ? "bg-indigo-500" : "bg-zinc-300 dark:bg-zinc-600"}`}
    >
      <span
        className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`}
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
  onChanged: () => void; // refrescar canales/departamentos en la app
}

type Tab = "canales" | "departamentos" | "equipo" | "widget" | "apariencia" | "avisos";

const PRESETS: { name: string; theme: Theme }[] = [
  { name: "Slack oscuro", theme: { sidebar: "#19171d", accent: "#1164a3", bubble: "#4f46e5" } },
  { name: "Bosque",       theme: { sidebar: "#0f2e1d", accent: "#2eb67d", bubble: "#007a5a" } },
  { name: "Uva",          theme: { sidebar: "#2d1b4e", accent: "#7c5cfc", bubble: "#7c5cfc" } },
  { name: "Cereza",       theme: { sidebar: "#3d0c1e", accent: "#e01e5a", bubble: "#e01e5a" } },
  { name: "Océano",       theme: { sidebar: "#0b2545", accent: "#168aad", bubble: "#168aad" } },
  { name: "Café",         theme: { sidebar: "#2b211b", accent: "#b07d4f", bubble: "#8c5a33" } },
];

const NEON_PRESETS: { name: string; theme: Theme }[] = [
  { name: "Neón cyber",  theme: { sidebar: "#0a0a12", accent: "#00e5ff", bubble: "#7b2ff7", glow: "#00e5ff" } },
  { name: "Neón verde",  theme: { sidebar: "#050d05", accent: "#39ff14", bubble: "#15803d", glow: "#39ff14" } },
  { name: "Neón rosa",   theme: { sidebar: "#12051a", accent: "#ff2ec4", bubble: "#a21caf", glow: "#ff2ec4" } },
  { name: "Neón ámbar",  theme: { sidebar: "#140d02", accent: "#ffb020", bubble: "#b45309", glow: "#ffb020" } },
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
            className="flex-1 border border-indigo-300 rounded px-2 py-1 text-sm outline-none"
          />
          <button className="text-xs text-indigo-600 font-semibold">Guardar</button>
          <button type="button" onClick={() => { setEditing(false); setName(label); }} className="text-xs text-zinc-400">
            Cancelar
          </button>
        </form>
      ) : (
        <>
          <span className="text-sm text-zinc-800 dark:text-zinc-200 flex-1 truncate">{label}</span>
          {sub && <span className="text-xs text-zinc-400">{sub}</span>}
          {canEdit && !confirming && (
            <>
              <button className="text-xs text-indigo-600 hover:underline" onClick={() => setEditing(true)}>
                Renombrar
              </button>
              {onDelete && (
                <button className="text-xs text-red-600 hover:underline" onClick={() => setConfirming(true)}>
                  {deleteLabel}
                </button>
              )}
            </>
          )}
          {confirming && (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-zinc-500">¿Seguro?</span>
              <button
                className="text-red-600 font-semibold"
                onClick={() => { setConfirming(false); onDelete?.(); }}
              >
                Sí
              </button>
              <button className="text-zinc-400" onClick={() => setConfirming(false)}>No</button>
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
    <div className="mt-2 ml-2 border-l-2 border-zinc-100 pl-3 pb-2">
      <p className="text-xs font-semibold text-zinc-500 mb-1">Miembros ({members.length})</p>
      <ul className="space-y-1 mb-2">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-2 text-xs text-zinc-700">
            <span>{m.name}</span>
            <button
              className="text-red-500 hover:underline"
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
            className="border border-zinc-300 rounded px-2 py-1 text-xs flex-1"
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
            className="text-xs bg-indigo-600 disabled:bg-zinc-300 text-white rounded px-2 py-1"
          >
            Agregar
          </button>
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
  const isAdmin = me.role === "admin";

  const load = () => {
    api.channels().then(setChannels).catch(() => {});
    api.departments().then(setDepartments).catch(() => {});
    api.agents().then(setAgents).catch(() => {});
  };
  useEffect(load, []);

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
      // Fallback para Electron/HTTP
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

  const TABS: { id: Tab; label: string }[] = [
    { id: "canales", label: "Canales" },
    { id: "departamentos", label: "Dptos." },
    { id: "equipo", label: "Equipo" },
    { id: "widget", label: "Widget web" },
    { id: "apariencia", label: "🎨" },
    { id: "avisos", label: "🔔" },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
          <h2 className="font-bold text-lg text-zinc-900 dark:text-zinc-100">Configuración</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-xl">×</button>
        </header>

        <nav className="px-6 pt-3 flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium ${
                tab === t.id
                  ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200"
                  : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

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
                      className="flex-1 border border-zinc-300 rounded-lg px-3 py-2 text-sm outline-none"
                    />
                    <button className="bg-[#4f46e5] text-white text-sm font-semibold rounded-lg px-4">
                      Crear
                    </button>
                  </div>
                  <div className="flex gap-4 text-xs text-zinc-600">
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={newPrivate} onChange={(e) => setNewPrivate(e.target.checked)} />
                      🔒 Privado
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={newAdminOnly} onChange={(e) => setNewAdminOnly(e.target.checked)} />
                      📢 Solo admins escriben
                    </label>
                  </div>
                </form>
              )}
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {channels.map((c) => (
                  <li key={c.id} className="py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-800 dark:text-zinc-200 flex-1 truncate">
                        {c.is_private ? "🔒" : c.post_policy === "admin" ? "📢" : "#"} {c.name}
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
                            className="text-xs text-red-600 hover:underline"
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
                    placeholder="Nuevo departamento"
                    className="flex-1 border border-zinc-300 rounded-lg px-3 py-2 text-sm outline-none"
                  />
                  <button className="bg-[#4f46e5] text-white text-sm font-semibold rounded-lg px-4">
                    Crear
                  </button>
                </form>
              )}
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
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
              <p className="text-xs text-zinc-400 mt-3">
                Los visitantes del widget web eligen uno de estos departamentos al iniciar un chat.
                Solo se puede eliminar un departamento sin conversaciones.
              </p>
            </>
          )}

          {tab === "equipo" && (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {agents.map((a) => (
                <li key={a.id} className="py-2.5 flex items-center gap-3">
                  <span
                    className="w-8 h-8 rounded text-white flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden"
                    style={{ background: a.color || "#4f46e5" }}
                  >
                    {a.avatar ? (
                      <img src={a.avatar} alt={a.name} className="w-full h-full object-cover" />
                    ) : (
                      a.name.charAt(0).toUpperCase()
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-800 dark:text-zinc-200 truncate">{a.name}</p>
                    <p className="text-xs text-zinc-400 truncate">{a.email}</p>
                  </div>
                  {isAdmin && a.id !== me.id ? (
                    <select
                      value={a.role}
                      onChange={(e) => run(() => api.setAgentRole(a.id, e.target.value))}
                      className="border border-zinc-300 rounded px-2 py-1 text-xs"
                    >
                      <option value="agent">agente</option>
                      <option value="admin">admin</option>
                    </select>
                  ) : (
                    <span className="text-xs text-zinc-500">{a.role}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {tab === "widget" && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-600">
                Pega este código en cualquier página web antes de <code>&lt;/body&gt;</code> para mostrar
                la burbuja de soporte. Los visitantes elegirán departamento y el chat llegará
                directo a esta app.
              </p>
              <pre className="bg-zinc-900 text-green-300 text-xs rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">
                {embedSnippet}
              </pre>
              <button
                onClick={copyEmbed}
                className="w-full bg-[#4f46e5] hover:bg-[#4338ca] text-white font-semibold rounded-lg py-2.5 text-sm"
              >
                {copied ? "✓ ¡Copiado!" : "Copiar código embed"}
              </button>
              <div className="text-xs text-zinc-500 space-y-1">
                <p>• Personaliza título y color antes del script:</p>
                <pre className="bg-zinc-100 rounded p-2 text-[11px] overflow-x-auto">
{`<script>
  window.KASUPPORT = { title: 'Ayuda', color: '#e01e5a' };
</script>`}
                </pre>
                <p>
                  • Página de prueba: <code>{API}/demo.html</code>
                </p>
              </div>
            </div>
          )}
          {tab === "avisos" && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Avisos cuando llegan chats nuevos del widget web o mensajes de visitantes.
                Son preferencias personales de tu cuenta.
              </p>

              <div className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-800 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">🔔 Notificaciones de escritorio</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Aviso del sistema aunque la app esté minimizada
                  </p>
                </div>
                <Toggle
                  on={me.notif_enabled !== false}
                  onClick={() => onPrefChange({ notif_enabled: me.notif_enabled === false })}
                />
              </div>

              <div className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-800 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">🔊 Sonido de aviso</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Un "ding" corto con cada chat o mensaje nuevo
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
                  if (granted) desktopNotify("🔔 Prueba de Kasupport", "Así se verán los avisos de chats nuevos");
                }}
                className="w-full border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 text-sm font-semibold rounded-lg py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-950"
              >
                Probar notificación y sonido
              </button>

              <p className="text-xs text-zinc-400">
                Si no sale el aviso del sistema, revisa los permisos de notificaciones de tu
                navegador o de macOS para la app.
              </p>
            </div>
          )}

          {tab === "apariencia" && (
            <div className="space-y-5">
              {/* Modo oscuro */}
              <div className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-800 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    {darkMode ? "🌙 Modo oscuro" : "☀️ Modo claro"}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Cambia el fondo del área de chats y paneles
                  </p>
                </div>
                <button
                  onClick={() => onDarkModeChange(!darkMode)}
                  className={`w-12 h-7 rounded-full relative transition-colors ${
                    darkMode ? "bg-indigo-500" : "bg-zinc-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${
                      darkMode ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Personaliza los colores de <strong>tu</strong> aplicación. Es una preferencia
                personal: no afecta a otros usuarios.
              </p>

              {/* Presets */}
              <div>
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">Temas rápidos</p>
                <div className="grid grid-cols-3 gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => onThemeChange(p.theme)}
                      className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 hover:border-indigo-400 text-left"
                    >
                      <span className="flex gap-1 mb-1.5">
                        <span className="w-4 h-4 rounded" style={{ background: p.theme.sidebar }} />
                        <span className="w-4 h-4 rounded" style={{ background: p.theme.accent }} />
                        <span className="w-4 h-4 rounded" style={{ background: p.theme.bubble }} />
                      </span>
                      <span className="text-xs text-zinc-700 dark:text-zinc-300">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Presets neón */}
              <div>
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">✨ Temas neón</p>
                <div className="grid grid-cols-4 gap-2">
                  {NEON_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => onThemeChange(p.theme)}
                      className="border rounded-lg p-2 text-left"
                      style={{
                        background: p.theme.sidebar,
                        borderColor: p.theme.glow || p.theme.accent,
                        boxShadow: `0 0 10px ${p.theme.glow}55`,
                      }}
                    >
                      <span
                        className="block text-xs font-semibold"
                        style={{ color: p.theme.accent, textShadow: `0 0 8px ${p.theme.glow}` }}
                      >
                        {p.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fondo de imagen */}
              <div>
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">🖼️ Fondo del área de chat</p>
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
                    <img src={bgImage} alt="fondo" className="w-24 h-16 object-cover rounded-lg border border-zinc-300 dark:border-zinc-600" />
                    <button
                      onClick={() => onBgImageChange(null)}
                      className="text-xs text-red-600 border border-red-200 dark:border-red-900 rounded-lg px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      Quitar fondo
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => bgFileRef.current?.click()}
                    className="text-xs text-indigo-600 dark:text-indigo-400 border border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg px-4 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-950 w-full"
                  >
                    + Subir imagen de fondo (se aplica con un velo para leer bien los mensajes)
                  </button>
                )}
              </div>

              {/* Colores individuales */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-zinc-500">Colores personalizados</p>
                {(
                  [
                    ["sidebar", "Barra lateral"],
                    ["accent", "Acento (selección y botones)"],
                    ["bubble", "Mis burbujas de chat"],
                  ] as ["sidebar" | "accent" | "bubble", string][]
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                    <input
                      type="color"
                      value={theme[key]}
                      onChange={(e) => onThemeChange({ ...theme, [key]: e.target.value })}
                      className="w-10 h-8 rounded cursor-pointer border border-zinc-300 dark:border-zinc-600"
                    />
                    {label}
                    <span className="text-xs text-zinc-400 ml-auto">{theme[key]}</span>
                  </label>
                ))}
              </div>

              <button
                onClick={() => onThemeChange(null)}
                className="text-xs text-zinc-500 border border-zinc-300 rounded-lg px-3 py-1.5 hover:bg-zinc-50"
              >
                Restablecer colores por defecto
              </button>
            </div>
          )}
        </div>

        {!isAdmin && tab !== "widget" && tab !== "apariencia" && tab !== "avisos" && (
          <footer className="px-6 py-3 border-t border-zinc-100 text-xs text-zinc-400">
            Solo los administradores pueden crear o modificar canales y departamentos.
          </footer>
        )}
      </div>
    </div>
  );
}
