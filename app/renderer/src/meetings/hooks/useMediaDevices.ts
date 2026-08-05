import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface MeetingMediaDevicesState {
  audioInputs: MediaDeviceInfo[];
  videoInputs: MediaDeviceInfo[];
  audioOutputs: MediaDeviceInfo[];
  audioInputId?: string;
  videoInputId?: string;
  audioOutputId?: string;
  loading: boolean;
  error: Error | null;
  refresh: (requestPermissions?: boolean) => Promise<void>;
  setAudioInputId: (id: string) => void;
  setVideoInputId: (id: string) => void;
  setAudioOutputId: (id: string) => void;
}

const storageKey = (kind: MediaDeviceKind) => `kasupport_meeting_device:${kind}`;

const readStored = (kind: MediaDeviceKind): string | undefined =>
  localStorage.getItem(storageKey(kind)) || undefined;

const chooseDevice = (
  devices: MediaDeviceInfo[],
  current: string | undefined,
  stored: string | undefined,
): string | undefined => {
  if (current && devices.some((device) => device.deviceId === current)) return current;
  if (stored && devices.some((device) => device.deviceId === stored)) return stored;
  return devices[0]?.deviceId;
};

export function useMeetingMediaDevices(): MeetingMediaDevicesState {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioInputId, setAudioInput] = useState<string | undefined>(() => readStored("audioinput"));
  const [videoInputId, setVideoInput] = useState<string | undefined>(() => readStored("videoinput"));
  const [audioOutputId, setAudioOutput] = useState<string | undefined>(() => readStored("audiooutput"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async (requestPermissions = false) => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      const unsupported = new Error("Este navegador no permite seleccionar dispositivos multimedia.");
      if (mountedRef.current) {
        setError(unsupported);
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    let permissionStream: MediaStream | undefined;
    try {
      if (requestPermissions) {
        try {
          permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        } catch (combinedError) {
          // A machine may legitimately have only a camera or only a microphone.
          // Request each kind independently so one missing/denied device does not
          // prevent labels and choices for the other kind from becoming usable.
          const partialStreams = await Promise.allSettled([
            navigator.mediaDevices.getUserMedia({ audio: true }),
            navigator.mediaDevices.getUserMedia({ video: true }),
          ]);
          const tracks = partialStreams.flatMap((result) =>
            result.status === "fulfilled" ? result.value.getTracks() : [],
          );
          if (tracks.length === 0) throw combinedError;
          permissionStream = new MediaStream(tracks);
        }
      }
      const next = await navigator.mediaDevices.enumerateDevices();
      if (!mountedRef.current) return;
      setDevices(next);
      setAudioInput((current) => chooseDevice(
        next.filter((device) => device.kind === "audioinput"),
        current,
        readStored("audioinput"),
      ));
      setVideoInput((current) => chooseDevice(
        next.filter((device) => device.kind === "videoinput"),
        current,
        readStored("videoinput"),
      ));
      setAudioOutput((current) => chooseDevice(
        next.filter((device) => device.kind === "audiooutput"),
        current,
        readStored("audiooutput"),
      ));
      setError(null);
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause : new Error(String(cause)));
      if (requestPermissions) {
        const next = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
        if (mountedRef.current) setDevices(next);
      }
    } finally {
      permissionStream?.getTracks().forEach((track) => track.stop());
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh(false);
    const onDeviceChange = () => void refresh(false);
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    return () => {
      mountedRef.current = false;
      navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
    };
  }, [refresh]);

  const persist = useCallback((kind: MediaDeviceKind, value: string, setter: (id: string) => void) => {
    localStorage.setItem(storageKey(kind), value);
    setter(value);
  }, []);

  return {
    audioInputs: useMemo(() => devices.filter((device) => device.kind === "audioinput"), [devices]),
    videoInputs: useMemo(() => devices.filter((device) => device.kind === "videoinput"), [devices]),
    audioOutputs: useMemo(() => devices.filter((device) => device.kind === "audiooutput"), [devices]),
    audioInputId,
    videoInputId,
    audioOutputId,
    loading,
    error,
    refresh,
    setAudioInputId: (id) => persist("audioinput", id, setAudioInput),
    setVideoInputId: (id) => persist("videoinput", id, setVideoInput),
    setAudioOutputId: (id) => persist("audiooutput", id, setAudioOutput),
  };
}
