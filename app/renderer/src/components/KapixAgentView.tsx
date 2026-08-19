import type { Agent, Theme } from "@/lib/api";

interface Props {
  agent?: Agent;
  theme?: Theme;
  serverUrl?: string;
}

export function KapixAgentView({ serverUrl = "http://127.0.0.1:3080" }: Props) {
  return (
    <div className="flex-1 flex flex-col w-full h-full bg-[#111113] overflow-hidden relative select-none">
      <iframe
        src={serverUrl}
        title="Kapix Harness"
        className="w-full h-full border-none flex-1 bg-[#111113]"
      />
    </div>
  );
}
