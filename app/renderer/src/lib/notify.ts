/**
 * Notificaciones de escritorio + sonidos sintetizados con WebAudio.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioCtxClass();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

// Desbloquear audio automáticamente al hacer clic en cualquier parte de la ventana
if (typeof window !== "undefined") {
  const unlockAudio = () => {
    if (audioCtx && audioCtx.state === "suspended") {
      void audioCtx.resume();
    } else {
      getAudioContext();
    }
    window.removeEventListener("click", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
  };
  window.addEventListener("click", unlockAudio, { once: false });
  window.addEventListener("keydown", unlockAudio, { once: false });
}

/** Sonido de notificación "ding" para mensajes entrantes */
export function playDing() {
  try {
    const ctx = getAudioContext();
    const notes = [
      { freq: 880, start: 0, dur: 0.12 },    // A5
      { freq: 1318.5, start: 0.08, dur: 0.25 }, // E6
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.freq;
      const t0 = ctx.currentTime + n.start;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + n.dur + 0.05);
    }
  } catch (e) {
    console.error("Audio error:", e);
  }
}

/** Sonido de timbre de llamada entrante */
export function playRing() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "sine";
    osc1.frequency.value = 440; // A4
    osc2.frequency.value = 480;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.85);
    osc2.stop(now + 0.85);
  } catch (e) {
    console.error("Ring audio error:", e);
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
    // ignorar si no hay soporte
  }
}
