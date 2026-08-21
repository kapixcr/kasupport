import { useState } from "react";
import { api, setToken, getBackendUrl, setBackendUrl, checkBackendHealth, type Agent } from "@/lib/api";
import { Mail, Lock, User, ArrowRight, Loader2, Server, Settings2, CheckCircle2, AlertCircle, RefreshCw, X } from "lucide-react";
import { KapixLogo } from "@/components/KapixLogo";

interface Props {
  onAuth: (agent: Agent) => void;
}

export function AuthScreen({ onAuth }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Modal de configuración del servidor backend
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [backendInput, setBackendInput] = useState(() => getBackendUrl());
  const [testingServer, setTestingServer] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [serverSavedSuccess, setServerSavedSuccess] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res =
        mode === "login"
          ? await api.login(email, password)
          : await api.register(name, email, password);
      setToken(res.token);
      onAuth(res.agent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingServer(true);
    setTestResult(null);
    try {
      const res = await checkBackendHealth(backendInput);
      setTestResult(res);
    } finally {
      setTestingServer(false);
    }
  };

  const handleSaveBackendUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = backendInput.trim();
    if (!cleanUrl) return;
    setBackendUrl(cleanUrl);
    setServerSavedSuccess(true);
    setError("");
    setTimeout(() => {
      setServerSavedSuccess(false);
      setServerModalOpen(false);
    }, 1200);
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-zinc-950 p-4 select-none relative overflow-hidden">
      {/* Luces de fondo sutiles */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Botón flotante para configurar servidor */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={() => {
            setBackendInput(getBackendUrl());
            setTestResult(null);
            setServerModalOpen(true);
          }}
          className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-xs flex items-center gap-1.5 transition-all shadow-sm"
          title="Configurar servidor backend"
        >
          <Server className="w-3.5 h-3.5 text-indigo-400" />
          <span>Servidor</span>
        </button>
      </div>

      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl p-8 z-10 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <KapixLogo className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Kasupport</h1>
              <p className="text-xs text-zinc-400">Plataforma de soporte y equipo</p>
            </div>
          </div>
        </div>

        <div className="flex mb-6 bg-zinc-100 dark:bg-zinc-800/80 rounded-2xl p-1 border border-zinc-200/50 dark:border-zinc-700/50">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(""); }}
              className={`flex-1 text-xs py-2 rounded-xl font-semibold transition-all ${
                mode === m
                  ? "bg-white dark:bg-zinc-900 shadow-sm text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {m === "login" ? "Iniciar Sesión" : "Crear Cuenta"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3.5">
          {mode === "register" && (
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">Nombre completo</label>
              <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-2xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
                <User className="w-4 h-4 text-zinc-400 shrink-0" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="María López"
                  className="w-full bg-transparent text-xs text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">Correo electrónico</label>
            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-2xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
              <Mail className="w-4 h-4 text-zinc-400 shrink-0" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="tu@empresa.com"
                className="w-full bg-transparent text-xs text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">Contraseña</label>
            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-2xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
              <Lock className="w-4 h-4 text-zinc-400 shrink-0" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-transparent text-xs text-zinc-900 dark:text-zinc-100 outline-none placeholder:text-zinc-400"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 space-y-2">
              <p className="text-xs text-rose-500 font-medium leading-relaxed">
                {error}
              </p>
              <button
                type="button"
                onClick={() => {
                  setBackendInput(getBackendUrl());
                  setTestResult(null);
                  setServerModalOpen(true);
                }}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold flex items-center gap-1.5"
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>Cambiar dirección del servidor backend</span>
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-2xl py-3 text-xs transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 active:scale-98 mt-2 cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>{mode === "login" ? "Entrar al Sistema" : "Crear Cuenta"}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        {mode === "register" && (
          <p className="text-[11px] text-zinc-400 text-center mt-4 leading-relaxed">
            El primer usuario registrado se convierte automáticamente en administrador.
          </p>
        )}
      </div>

      {/* Modal de Configuración del Servidor Backend */}
      {serverModalOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onClick={() => setServerModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    Servidor Backend
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Dirección de la API y WebSocket de Kasupport
                  </p>
                </div>
              </div>
              <button
                onClick={() => setServerModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBackendUrl} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  URL del Backend (API)
                </label>
                <input
                  type="url"
                  value={backendInput}
                  onChange={(e) => {
                    setBackendInput(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="http://localhost:4100 o https://tu-servidor.com"
                  required
                  className="w-full border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-indigo-400 font-mono"
                />
              </div>

              {/* Accesos rápidos / presets */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Accesos rápidos:</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBackendInput("http://localhost:4100");
                      setTestResult(null);
                    }}
                    className="flex-1 py-1 px-2.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-[11px] font-medium rounded-lg transition-colors text-center border border-zinc-200 dark:border-zinc-700"
                  >
                    Local (localhost:4100)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBackendInput("http://192.99.247.181:4100");
                      setTestResult(null);
                    }}
                    className="flex-1 py-1 px-2.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-[11px] font-medium rounded-lg transition-colors text-center border border-zinc-200 dark:border-zinc-700"
                  >
                    Servidor (192.99.247.181:4100)
                  </button>
                </div>
              </div>

              {/* Resultado de prueba */}
              {testResult && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                    testResult.ok
                      ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                      : "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800"
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold">
                      {testResult.ok ? "¡Conexión exitosa!" : "Error al conectar con el backend:"}
                    </p>
                    {testResult.message && <p className="text-[11px] mt-0.5">{testResult.message}</p>}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingServer}
                  className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingServer ? "animate-spin" : ""}`} />
                  <span>{testingServer ? "Probando..." : "Probar Conexión"}</span>
                </button>

                <div className="flex items-center gap-2">
                  {serverSavedSuccess && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Guardado
                    </span>
                  )}
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    Guardar y Usar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
