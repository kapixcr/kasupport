import { useState } from "react";
import { api, type Conversation } from "@/lib/api";
import type { Selection } from "@/lib/selection";
import {
  Mail,
  RefreshCw,
  Search,
  X,
  MessageSquare,
  ArrowUpRight,
  Building2,
  Trash2,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";


interface Props {
  conversations: Conversation[];
  onSelect: (selection: Selection) => void;
  onClose?: () => void;
  onRefreshConversations: () => void;
  embedded?: boolean;
}

export function MailboxModal({
  conversations,
  onSelect,
  onClose,
  onRefreshConversations,
  embedded,
}: Props) {
  const [filter, setFilter] = useState<"all" | "email" | "whatsapp" | "widget" | "open" | "closed">("all");

  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await api.emailSync();
      setSyncMessage(
        res.newlyProcessed > 0
          ? `✓ Se sincronizaron ${res.newlyProcessed} correos nuevos.`
          : `✓ Bandeja actualizada. No hay correos nuevos pendientes.`
      );
      onRefreshConversations();
    } catch (e: any) {
      setSyncMessage(`× Error: ${e.message || "No se pudo sincronizar"}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!window.confirm(`¿Estás seguro de eliminar el ticket #${id}? Esta acción borrará el historial de este correo.`)) {
      return;
    }
    setDeletingId(id);
    try {
      await api.deleteConversation(id);
      onRefreshConversations();
    } catch (err: any) {
      alert(`No se pudo eliminar: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteClosed = async () => {
    const closedCount = conversations.filter((c) => c.status === "closed").length;
    if (closedCount === 0) {
      alert("No hay tickets cerrados para eliminar.");
      return;
    }
    if (!window.confirm(`¿Deseas eliminar permanentemente los ${closedCount} tickets cerrados del sistema?`)) {
      return;
    }
    setSyncing(true);
    try {
      const res = await api.bulkDeleteConversations({ onlyClosed: true });
      setSyncMessage(`✓ Se eliminaron ${res.deletedCount} tickets cerrados.`);
      onRefreshConversations();
    } catch (err: any) {
      setSyncMessage(`× Error al eliminar: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleStatus = async (e: React.MouseEvent, id: number, currentStatus: string) => {
    e.stopPropagation();
    const nextStatus = currentStatus === "closed" ? "open" : "closed";
    try {
      await api.setConversationStatus(id, nextStatus);
      onRefreshConversations();
    } catch (err: any) {
      alert(`No se pudo cambiar el estado: ${err.message}`);
    }
  };

  const filtered = conversations.filter((c) => {
    if (filter === "whatsapp" && c.source !== "whatsapp") return false;

    if (filter === "email" && c.source !== "email") return false;
    if (filter === "widget" && (c.source === "email" || c.source === "whatsapp")) return false;
    if (filter === "open" && c.status === "closed") return false;
    if (filter === "closed" && c.status !== "closed") return false;

    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.visitor_name && c.visitor_name.toLowerCase().includes(q)) ||
      (c.visitor_email && c.visitor_email.toLowerCase().includes(q)) ||
      (c.visitor_phone && c.visitor_phone.toLowerCase().includes(q)) ||
      (c.subject && c.subject.toLowerCase().includes(q)) ||
      (c.last_message && c.last_message.toLowerCase().includes(q))
    );
  });

  const emailCount = conversations.filter((c) => c.source === "email").length;
  const whatsappCount = conversations.filter((c) => c.source === "whatsapp").length;
  const widgetCount = conversations.filter((c) => c.source !== "email" && c.source !== "whatsapp").length;
  const openCount = conversations.filter((c) => c.status === "open").length;
  const closedCount = conversations.filter((c) => c.status === "closed").length;

  const content = (
    <div
      className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-sm flex flex-col overflow-hidden ${
        embedded ? "w-full max-w-5xl h-full mx-auto" : "w-full max-w-3xl max-h-[85vh] shadow-2xl animate-in fade-in zoom-in-95"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <header className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Buzón de Soporte
              <span className="text-xs font-normal text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full font-mono">
                soporte@kapix.co.cr
              </span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {conversations.length} tickets en total · {openCount} abiertos · {closedCount} cerrados
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {closedCount > 0 && (
            <button
              onClick={handleDeleteClosed}
              disabled={syncing}
              title="Eliminar todos los tickets que ya están cerrados"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-zinc-100 hover:bg-rose-50 dark:bg-zinc-800 dark:hover:bg-rose-950/40 text-zinc-600 dark:text-zinc-300 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1.5 transition-all border border-zinc-200/60 dark:border-zinc-700/60"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpiar cerrados ({closedCount})</span>
            </button>
          )}

          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white flex items-center gap-2 transition-all shadow-xs active:scale-[0.98]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            <span>{syncing ? "Sincronizando..." : "Sincronizar"}</span>
          </button>

          {onClose && !embedded && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

        {syncMessage && (
          <div className={`px-6 py-2 text-xs font-medium border-b ${
            syncMessage.startsWith("✓")
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 border-emerald-100 dark:border-emerald-900"
              : "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border-rose-100 dark:border-rose-900"
          }`}>
            {syncMessage}
          </div>
        )}

        {/* Barra de Filtros y Búsqueda */}
        <div className="px-6 py-3 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {(
              [
                ["all", `Todos (${conversations.length})`],
                ["open", `Abiertos (${openCount})`],
                ["closed", `Cerrados (${closedCount})`],
                ["whatsapp", `💬 WhatsApp (${whatsappCount})`],
                ["email", `✉️ Correo (${emailCount})`],
                ["widget", `🌐 Web (${widgetCount})`],
              ] as [typeof filter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all ${
                  filter === key
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por asunto, remitente o texto..."
              className="bg-transparent w-full text-zinc-800 dark:text-zinc-200 outline-none placeholder:text-zinc-400 text-xs"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Lista de Tickets / Correos */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/80">
          {filtered.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 mb-3">
                <Mail className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                No hay tickets en esta vista
              </p>
              <p className="text-xs text-zinc-400 max-w-sm mt-1">
                La bandeja está limpia. Los nuevos mensajes de WhatsApp, correos o chats web aparecerán aquí automáticamente.
              </p>
            </div>
          ) : (
            filtered.map((cv) => {
              const isWhatsApp = cv.source === "whatsapp";
              const isEmail = cv.source === "email";
              const isOpen = cv.status === "open";
              const isDeleting = deletingId === cv.id;
              return (
                <div
                  key={cv.id}
                  onClick={() => {
                    onSelect({ kind: "conversation", id: cv.id, channelId: cv.channel_id });
                    onClose?.();
                  }}
                  className={`p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-all flex items-start gap-3.5 group ${
                    isDeleting ? "opacity-30 pointer-events-none" : ""
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 font-bold text-xs ${
                      isWhatsApp
                        ? "bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400"
                        : isEmail
                        ? "bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400"
                        : "bg-sky-100 dark:bg-sky-950/70 text-sky-600 dark:text-sky-400"
                    }`}
                  >
                    {isEmail ? <Mail className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                          {cv.visitor_name}
                        </span>
                        {cv.visitor_phone && (
                          <span className="text-[11px] text-zinc-400 truncate">
                            {cv.visitor_phone}
                          </span>
                        )}
                        {cv.visitor_email && !cv.visitor_phone && (
                          <span className="text-[11px] text-zinc-400 truncate">
                            &lt;{cv.visitor_email}&gt;
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Botón rápido para abrir/cerrar */}
                        <button
                          onClick={(e) => handleToggleStatus(e, cv.id, cv.status)}
                          title={isOpen ? "Marcar como cerrado" : "Reabrir ticket"}
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider transition-all flex items-center gap-1 ${
                            isOpen
                              ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200"
                          }`}
                        >
                          {isOpen ? <CheckCircle2 className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
                          <span>{cv.status}</span>
                        </button>

                        <span className="text-[10px] text-zinc-400">
                          {new Date(cv.created_at).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>

                        {/* Botón para eliminar ticket individual */}
                        <button
                          onClick={(e) => handleDelete(e, cv.id)}
                          title="Eliminar ticket definitivamente"
                          className="p-1 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>

                    <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate mb-1">
                      {isWhatsApp ? "WhatsApp: " : isEmail ? `Ticket #${cv.id}: ` : "Chat web: "}
                      {cv.subject || "Consulta de soporte"}
                    </p>


                    {cv.last_message && (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate line-clamp-1">
                        {cv.last_message}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-400">
                      {cv.department_name && (
                        <span className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">
                          <Building2 className="w-3 h-3" />
                          {cv.department_name}
                        </span>
                      )}
                      <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">
                        {cv.message_count || 1} mensajes
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
  );

  if (embedded) {
    return (
      <div className="flex-1 flex flex-col h-full bg-zinc-50/50 dark:bg-zinc-950 p-6 md:p-8 overflow-hidden">
        {content}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      {content}
    </div>
  );
}
