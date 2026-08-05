export type MediaSessionKind = "call" | "huddle";

export interface MediaSessionLease {
  readonly kind: MediaSessionKind;
  release: () => void;
}

interface ActiveMediaSession {
  kind: MediaSessionKind;
  token: symbol;
}

let activeSession: ActiveMediaSession | null = null;

/**
 * Acquires the renderer's camera/microphone slot without pre-empting an
 * existing call or huddle. The returned release function is idempotent.
 */
export function tryAcquireMediaSession(kind: MediaSessionKind): MediaSessionLease | null {
  if (activeSession) return null;

  const token = Symbol(kind);
  activeSession = { kind, token };
  let released = false;

  return {
    kind,
    release: () => {
      if (released) return;
      released = true;
      if (activeSession?.token === token) activeSession = null;
    },
  };
}
