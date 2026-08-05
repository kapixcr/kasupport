import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Video } from "lucide-react";
import { MeetingPreJoin } from "./MeetingPreJoin";
import { MeetingRoom } from "./MeetingRoom";
import { meetingErrorCopy } from "../lib/errors";
import { meetingsApi } from "../meetingsApi";
import type {
  MeetingDetail,
  MeetingJoinCredentials,
  MeetingPreJoinChoices,
} from "../types";

export interface StaffMeetingRouteProps {
  publicId: string;
  displayName?: string;
  initialMeeting?: MeetingDetail;
  initialCredentials?: MeetingJoinCredentials;
  onLeave?: () => void;
  onEnded?: () => void;
}

function initialChoices(displayName?: string): MeetingPreJoinChoices {
  return {
    name: displayName ?? "",
    audioEnabled: true,
    videoEnabled: true,
    recordingConsent: false,
  };
}

export function StaffMeetingRoute({
  publicId,
  displayName,
  initialMeeting,
  initialCredentials,
  onLeave,
  onEnded,
}: StaffMeetingRouteProps) {
  const createdCredentials =
    initialCredentials ??
    (initialMeeting?.livekitUrl && initialMeeting.livekitToken
      ? {
          meeting: initialMeeting,
          livekitUrl: initialMeeting.livekitUrl,
          livekitToken: initialMeeting.livekitToken,
          participantId: initialMeeting.participantId,
          role: initialMeeting.role ?? "host",
        }
      : undefined);
  const [meeting, setMeeting] = useState<MeetingDetail | null>(
    createdCredentials?.meeting ?? initialMeeting ?? null,
  );
  const [credentials, setCredentials] = useState<MeetingJoinCredentials | undefined>(createdCredentials);
  const [choices, setChoices] = useState<MeetingPreJoinChoices>(() => initialChoices(displayName));
  const [loading, setLoading] = useState(!initialCredentials && !initialMeeting);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<unknown>();

  const load = useCallback(async () => {
    if (initialCredentials) return;
    setLoading(true);
    setError(undefined);
    try {
      setMeeting(await meetingsApi.getMeeting(publicId));
    } catch (cause) {
      setError(cause);
    } finally {
      setLoading(false);
    }
  }, [initialCredentials, publicId]);

  useEffect(() => {
    if (!meeting && !initialCredentials) void load();
  }, [initialCredentials, load, meeting]);

  const join = async () => {
    setJoining(true);
    setError(undefined);
    try {
      const next = await meetingsApi.joinMeeting(publicId, {
        audioEnabled: choices.audioEnabled,
        videoEnabled: choices.videoEnabled,
      });
      setMeeting(next.meeting);
      setCredentials(next);
    } catch (cause) {
      setError(cause);
    } finally {
      setJoining(false);
    }
  };

  if (credentials) {
    return (
      <MeetingRoom
        credentials={credentials}
        choices={choices}
        onLeave={onLeave}
        onEnded={onEnded}
        className="h-full"
      />
    );
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center bg-zinc-950 text-white" role="status">
        <Loader2 className="size-8 animate-spin text-indigo-400" />
        <span className="ml-3">Preparando la reunión…</span>
      </div>
    );
  }

  if (!meeting) {
    const copy = meetingErrorCopy(error);
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center bg-zinc-950 p-6 text-white">
        <div className="max-w-md text-center">
          <Video className="mx-auto size-12 text-zinc-500" />
          <h1 className="mt-5 text-2xl font-bold">{copy.title}</h1>
          <p className="mt-2 text-zinc-400">{copy.description}</p>
          <div className="mt-6 flex justify-center gap-3">
            <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 font-semibold text-zinc-950 hover:bg-zinc-200"><RefreshCw className="size-4" /> Reintentar</button>
            {onLeave && <button type="button" onClick={onLeave} className="rounded-xl border border-white/15 px-5 py-2.5 font-semibold hover:bg-white/10">Cerrar</button>}
          </div>
        </div>
      </div>
    );
  }

  const copy = error ? meetingErrorCopy(error) : undefined;
  return (
    <div className="h-full min-h-[520px] overflow-y-auto bg-gradient-to-br from-zinc-950 via-zinc-900 to-indigo-950 p-4 text-white sm:p-8">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col justify-center">
        <MeetingPreJoin
          meeting={{ ...meeting, recordingEnabled: meeting.recordingEnabled }}
          choices={choices}
          onChange={setChoices}
          onSubmit={() => void join()}
          submitting={joining}
          error={copy?.description}
          submitLabel="Entrar a la reunión"
          nameRequired={false}
        />
      </div>
    </div>
  );
}
