import { useState } from "react";
import { api, setToken, type Agent } from "@/lib/api";

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

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#19171d]">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8">
        <h1 className="text-2xl font-bold text-zinc-900">Kasupport</h1>
        <p className="text-sm text-zinc-500 mb-6">
          {mode === "login" ? "Inicia sesión con tu cuenta de staff" : "Crea tu cuenta de staff"}
        </p>

        <div className="flex mb-6 bg-zinc-100 rounded-lg p-1">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(""); }}
              className={`flex-1 text-sm py-1.5 rounded-md font-medium ${
                mode === m ? "bg-white shadow text-zinc-900" : "text-zinc-500"
              }`}
            >
              {m === "login" ? "Entrar" : "Registrarse"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-1">Nombre</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="María López"
                className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="tu@empresa.com"
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="mínimo 6 caracteres"
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#4f46e5] hover:bg-[#4338ca] disabled:bg-zinc-300 text-white font-semibold rounded-lg py-2.5 text-sm"
          >
            {loading ? "Cargando..." : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>

        {mode === "register" && (
          <p className="text-xs text-zinc-400 mt-4">
            El primer usuario registrado se convierte en administrador.
          </p>
        )}
      </div>
    </div>
  );
}
