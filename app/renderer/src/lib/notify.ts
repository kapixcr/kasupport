/**
 * Notificaciones de escritorio + sonido de aviso (sin archivos externos).
 * El sonido se sintetiza con WebAudio: dos tonos cortos tipo "ding".
 */

let audioCtx: AudioContext | null = null;

export function playDing() {
  try {
    audioCtx = audioCtx || new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (audioCtx.state === "suspended") void audioCtx.resume();

    const notes = [
      { freq: 880, start: 0, dur: 0.12 },
      { freq: 1318.5, start: 0.1, dur: 0.22 }, // E6, segunda nota del "ding"
    ];
    for (const n of notes) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.freq;
      const t0 = audioCtx.currentTime + n.start;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + n.dur + 0.05);
    }
  } catch {
    // Audio no disponible: silencio
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export function desktopNotify(title: string, body: string, onclick?: () => void) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, {
      body: body.length > 120 ? body.slice(0, 117) + "..." : body,
      tag: `kasupport-${Date.now()}`,
    });
    if (onclick) {
      n.onclick = () => {
        window.focus();
        onclick();
      };
    }
  } catch {
    // Algunos entornos requieren ServiceWorker: se ignora
  }
}
