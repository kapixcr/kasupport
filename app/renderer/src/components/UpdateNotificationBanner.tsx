import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, X, Download } from "lucide-react";

interface UpdateInfo {
  version: string;
  files?: Array<{ url: string }>;
  releaseNotes?: string | Array<{ version: string; note: string }>;
}

interface UpdateStatusData {
  status: "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
  info?: UpdateInfo | null;
  progress?: { percent: number; bytesPerSecond: number; transferred: number; total: number } | null;
  error?: string | null;
}

export function UpdateNotificationBanner() {
  const [updateData, setUpdateData] = useState<UpdateStatusData>({ status: "idle" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const desktop = (window as unknown as {
      kasupportDesktop?: {
        getUpdateStatus?: () => Promise<UpdateStatusData>;
        onUpdateStatus?: (callback: (data: UpdateStatusData) => void) => () => void;
      };
    }).kasupportDesktop;

    if (!desktop?.onUpdateStatus) return;

    if (desktop.getUpdateStatus) {
      desktop.getUpdateStatus().then((status) => {
        if (status) setUpdateData(status);
      }).catch(() => {});
    }

    const cleanup = desktop.onUpdateStatus((data) => {
      setUpdateData(data);
      if (data.status === "downloaded" || data.status === "downloading") {
        setDismissed(false);
      }
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

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

  if (dismissed) return null;

  if (updateData.status === "downloading" && updateData.progress) {
    const percent = Math.round(updateData.progress.percent || 0);
    return (
      <aside
        aria-label="Descargando actualización"
        className="fixed bottom-4 right-4 z-50 bg-zinc-900/95 text-white border border-indigo-500/40 shadow-2xl rounded-2xl p-4 max-w-sm flex items-center gap-3 backdrop-blur-md animate-in slide-in-from-bottom-4"
      >
        <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center shrink-0">
          <Download className="w-5 h-5 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-zinc-100">Descargando actualización...</p>
          <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[10px] text-zinc-400 mt-1 block">{percent}% completado</span>
        </div>
      </aside>
    );
  }

  if (updateData.status === "downloaded") {
    const version = updateData.info?.version ? `v${updateData.info.version}` : "nueva versión";
    return (
      <aside
        aria-label="Actualización lista"
        className="fixed bottom-4 right-4 z-50 bg-indigo-950/90 text-white border border-indigo-500/50 shadow-2xl rounded-2xl p-4 max-w-sm flex items-start gap-3 backdrop-blur-md animate-in slide-in-from-bottom-4"
      >
        <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
            ¡Actualización lista!
            <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-md bg-indigo-800 text-indigo-200">
              {version}
            </span>
          </h4>
          <p className="text-[11px] text-indigo-200/80 mt-1 leading-snug">
            Kasupport se ha descargado y está listo para aplicarse.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleRestart}
              className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reiniciar ahora
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="px-2.5 py-1.5 text-xs text-indigo-300 hover:text-white rounded-xl transition-colors cursor-pointer"
            >
              Más tarde
            </button>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-indigo-400 hover:text-white p-1 rounded-lg transition-colors"
          title="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return null;
}
