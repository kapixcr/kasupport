import { useState, useEffect, useRef } from "react";
import { getKapixAgentUrl, setKapixAgentUrl, DEFAULT_KAPIX_AGENT_URL, type Agent, type Theme } from "@/lib/api";
import {
  Bot,
  RefreshCw,
  ExternalLink,
  Settings2,
  AlertCircle,
  CheckCircle2,
  Globe,
} from "lucide-react";

interface Props {
  agent?: Agent;
  theme?: Theme;
  serverUrl?: string;
}

export function KapixAgentView({ serverUrl }: Props) {
  const [currentUrl, setCurrentUrl] = useState(() => serverUrl || getKapixAgentUrl());
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlInput, setUrlInput] = useState(() => currentUrl);
  const [checking, setChecking] = useState(true);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [iframeKey, setIframeKey] = useState(1);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const checkAbortRef = useRef<AbortController | null>(null);

  const checkConnection = async (targetUrl: string) => {
    setChecking(true);
    if (checkAbortRef.current) {
      checkAbortRef.current.abort();
    }
    const controller = new AbortController();
    checkAbortRef.current = controller;

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 4000);

    try {
      // Intentar una petición ligera para verificar si el host responde
      await fetch(targetUrl, {
        method: "HEAD",
        mode: "no-cors",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      setIsOnline(true);
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e?.name === "AbortError") {
        setIsOnline(false);
      } else {
        setIsOnline(false);
      }
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    const url = serverUrl || getKapixAgentUrl();
    setCurrentUrl(url);
    setUrlInput(url);
    void checkConnection(url);
    return () => {
      if (checkAbortRef.current) checkAbortRef.current.abort();
    };
  }, [serverUrl]);

  const handleSaveUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = urlInput.trim();
    if (!cleanUrl) return;
    setKapixAgentUrl(cleanUrl);
    setCurrentUrl(cleanUrl);
    setEditingUrl(false);
    setSavedSuccess(true);
    setIframeKey((k) => k + 1);
    void checkConnection(cleanUrl);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleResetDefault = () => {
    setUrlInput(DEFAULT_KAPIX_AGENT_URL);
    setKapixAgentUrl(DEFAULT_KAPIX_AGENT_URL);
    setCurrentUrl(DEFAULT_KAPIX_AGENT_URL);
    setEditingUrl(false);
    setIframeKey((k) => k + 1);
    void checkConnection(DEFAULT_KAPIX_AGENT_URL);
  };

  const handleRetry = () => {
    setIframeKey((k) => k + 1);
    void checkConnection(currentUrl);
  };

  const handleOpenExternal = () => {
    if (window.open) {
      window.open(currentUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full bg-[#111113] overflow-hidden relative select-none">
      {/* Barra superior de estado de Kapix Agent */}
      <div className="h-10 px-4 bg-[#18181b] border-b border-white/[0.08] flex items-center justify-between text-xs text-zinc-300 shrink-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                checking
                  ? "bg-amber-400 animate-pulse"
                  : isOnline
                  ? "bg-emerald-400 ring-2 ring-emerald-400/20"
                  : "bg-rose-500"
              }`}
            />
            <span className="font-semibold text-zinc-200 flex items-center gap-1">
              <Bot className="w-3.5 h-3.5 text-indigo-400" />
              Kapix Agent
            </span>
          </div>

          <span className="text-zinc-500">|</span>

          <span className="font-mono text-[11px] text-zinc-400 truncate max-w-[280px]" title={currentUrl}>
            {currentUrl}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {savedSuccess && (
            <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> URL guardada
            </span>
          )}

          <button
            onClick={() => {
              setEditingUrl(!editingUrl);
              setUrlInput(currentUrl);
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-colors ${
              editingUrl
                ? "bg-indigo-600 text-white"
                : "bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white"
            }`}
            title="Cambiar URL del servidor"
          >
            <Settings2 className="w-3 h-3" />
            <span>{editingUrl ? "Cerrar" : "Cambiar URL"}</span>
          </button>

          <button
            onClick={handleRetry}
            disabled={checking}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
            title="Reintentar conexión"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={handleOpenExternal}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Abrir en navegador externo"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Editor rápido de URL */}
      {editingUrl && (
        <div className="bg-[#1c1c20] border-b border-white/10 p-3.5 px-4 z-20 animate-in fade-in slide-in-from-top-2">
          <form onSubmit={handleSaveUrl} className="flex items-center gap-2.5">
            <div className="flex-1 flex items-center gap-2 bg-black/40 border border-white/15 rounded-xl px-3 py-1.5 focus-within:ring-1 focus-within:ring-indigo-400">
              <Globe className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="http://127.0.0.1:3080 o http://192.168.1.100:3080"
                required
                className="w-full bg-transparent text-xs text-white outline-none font-mono placeholder:text-zinc-500"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-xs transition-all shrink-0 cursor-pointer"
            >
              Guardar y Conectar
            </button>
            <button
              type="button"
              onClick={handleResetDefault}
              className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-zinc-200 text-xs rounded-xl transition-all shrink-0 cursor-pointer"
            >
              Restablecer (127.0.0.1:3080)
            </button>
          </form>
        </div>
      )}

      {/* Vista principal: Iframe o Pantalla de Desconexión */}
      <div className="flex-1 w-full h-full relative overflow-hidden bg-[#111113]">
        {/* Si no está online y terminó de verificar, mostrar pantalla informativa con diagnóstico */}
        {!checking && isOnline === false && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 bg-[#111113] text-center">
            <div className="max-w-md w-full bg-zinc-900/90 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-500/10">
                <AlertCircle className="w-6 h-6" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-white tracking-tight">
                  No se pudo conectar con Kapix Agent
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  No se detectó respuesta en la dirección:
                </p>
                <div className="bg-black/50 border border-white/10 rounded-xl px-3 py-1.5 font-mono text-xs text-indigo-300 break-all select-all">
                  {currentUrl}
                </div>
              </div>

              <div className="text-[11px] text-zinc-400 bg-white/[0.03] p-3 rounded-2xl border border-white/5 text-left space-y-1.5">
                <p className="font-semibold text-zinc-300">💡 ¿Cómo solucionarlo?</p>
                <ul className="list-disc list-inside space-y-1 text-zinc-400">
                  <li>
                    Si estás en <strong>otra computadora</strong>, debes ingresar la dirección IP o dominio del servidor donde está corriendo el agente (ej: <code>http://192.168.1.X:3080</code>).
                  </li>
                  <li>
                    Si estás en la computadora principal, asegúrate de que el servicio de <strong>Kapix Harness / Agent</strong> esté iniciado en el puerto <code>3080</code>.
                  </li>
                </ul>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => {
                    setEditingUrl(true);
                    setUrlInput(currentUrl);
                  }}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Settings2 className="w-4 h-4" />
                  <span>Configurar Dirección del Servidor</span>
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={handleRetry}
                    className="flex-1 py-2 px-3 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-medium rounded-xl border border-white/5 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reintentar</span>
                  </button>
                  <button
                    onClick={handleOpenExternal}
                    className="flex-1 py-2 px-3 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-medium rounded-xl border border-white/5 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir en navegador</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Iframe con el harness */}
        <iframe
          key={iframeKey}
          src={currentUrl}
          title="Kapix Agent Harness"
          className="w-full h-full border-none flex-1 bg-[#111113]"
          allow="clipboard-read; clipboard-write; microphone; camera"
          onError={() => setIsOnline(false)}
        />
      </div>
    </div>
  );
}
