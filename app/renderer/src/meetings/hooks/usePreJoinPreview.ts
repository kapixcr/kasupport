import { useCallback, useEffect, useRef, useState } from "react";

export type MediaPermissionState = "prompt" | "granted" | "denied" | "unavailable";

export interface PreJoinPreviewOptions {
  audioEnabled: boolean;
  videoEnabled: boolean;
  audioInputId?: string;
  videoInputId?: string;
}

export interface PreJoinPreviewState {
  stream: MediaStream | null;
  audioPermission: MediaPermissionState;
  videoPermission: MediaPermissionState;
  error: Error | null;
  loading: boolean;
  retry: () => Promise<void>;
  stop: () => void;
}

function permissionFromError(error: unknown): MediaPermissionState {
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
    return "denied";
  }
  return "unavailable";
}

export function usePreJoinPreview(options: PreJoinPreviewOptions): PreJoinPreviewState {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioPermission, setAudioPermission] = useState<MediaPermissionState>("prompt");
  const [videoPermission, setVideoPermission] = useState<MediaPermissionState>("prompt");
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef(0);

  const stop = useCallback(() => {
    requestRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const acquire = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    setError(null);

    if (!options.audioEnabled && !options.videoEnabled) {
      setAudioPermission("prompt");
      setVideoPermission("prompt");
      setLoading(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      const unsupported = new Error("Este navegador no permite usar cámara o micrófono.");
      setError(unsupported);
      if (options.audioEnabled) setAudioPermission("unavailable");
      if (options.videoEnabled) setVideoPermission("unavailable");
      return;
    }

    setLoading(true);
    try {
      const requestTrack = async (kind: "audio" | "video") => {
        const constraints: MediaStreamConstraints = {
          audio:
            kind === "audio"
              ? { deviceId: options.audioInputId ? { exact: options.audioInputId } : undefined }
              : false,
          video:
            kind === "video"
              ? { deviceId: options.videoInputId ? { exact: options.videoInputId } : undefined }
              : false,
        };
        return navigator.mediaDevices.getUserMedia(constraints);
      };
      const [audioResult, videoResult] = await Promise.allSettled([
        options.audioEnabled ? requestTrack("audio") : Promise.resolve(null),
        options.videoEnabled ? requestTrack("video") : Promise.resolve(null),
      ]);
      const tracks: MediaStreamTrack[] = [];
      let firstFailure: unknown;
      let nextAudioPermission: MediaPermissionState | undefined;
      let nextVideoPermission: MediaPermissionState | undefined;
      if (audioResult.status === "fulfilled") {
        if (audioResult.value) tracks.push(...audioResult.value.getAudioTracks());
        if (options.audioEnabled) nextAudioPermission = "granted";
      } else {
        firstFailure = audioResult.reason;
        nextAudioPermission = permissionFromError(audioResult.reason);
      }
      if (videoResult.status === "fulfilled") {
        if (videoResult.value) tracks.push(...videoResult.value.getVideoTracks());
        if (options.videoEnabled) nextVideoPermission = "granted";
      } else {
        firstFailure ??= videoResult.reason;
        nextVideoPermission = permissionFromError(videoResult.reason);
      }
      const nextStream = new MediaStream(tracks);
      if (requestRef.current !== requestId) {
        tracks.forEach((track) => track.stop());
        return;
      }
      if (nextAudioPermission) setAudioPermission(nextAudioPermission);
      if (nextVideoPermission) setVideoPermission(nextVideoPermission);
      streamRef.current = nextStream;
      setStream(nextStream);
      if (firstFailure) {
        setError(firstFailure instanceof Error ? firstFailure : new Error(String(firstFailure)));
      }
    } catch (cause) {
      if (requestRef.current !== requestId) return;
      const nextError = cause instanceof Error ? cause : new Error(String(cause));
      const permission = permissionFromError(cause);
      setError(nextError);
      if (options.audioEnabled) setAudioPermission(permission);
      if (options.videoEnabled) setVideoPermission(permission);
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [options.audioEnabled, options.audioInputId, options.videoEnabled, options.videoInputId]);

  useEffect(() => {
    void acquire();
    return () => {
      requestRef.current += 1;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [acquire]);

  return {
    stream,
    audioPermission,
    videoPermission,
    error,
    loading,
    retry: acquire,
    stop,
  };
}
