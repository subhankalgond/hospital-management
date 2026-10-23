"use client";

import * as React from "react";
import { Volume2, VolumeX, Sun, Moon } from "lucide-react";
import { useStore } from "@/lib/store";

/**
 * Public waiting-room display — display-only build.
 *
 * Shows ONLY token numbers, doctor/department labels and a timestamp.
 * No patient names, symptoms, diagnoses or any clinical data ever reach this
 * screen (the /api/queue?display=1 payload is anonymous by construction).
 *
 * Audio: browsers block autoplay, so staff must click "Enable voice" once on
 * the display device (one-time activation). If speech synthesis is not
 * supported or audio fails, the visual highlight stays fully functional and
 * the page shows an audio status line.
 */
export default function WaitingDisplay() {
  const board = useStore((s) => s.publicDisplay);
  const refreshPublicDisplay = useStore((s) => s.refreshPublicDisplay);
  const [audioOn, setAudioOn] = React.useState(false);
  const [audioError, setAudioError] = React.useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = React.useState(true);
  const [dark, setDark] = React.useState(true);
  const lastSpoken = React.useRef<string>("");

  React.useEffect(() => {
    setVoiceSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    void refreshPublicDisplay();
    const iv = setInterval(() => void refreshPublicDisplay(), 5_000); // 5s sync
    return () => clearInterval(iv);
  }, [refreshPublicDisplay]);

  // Announce newly-called tokens.
  React.useEffect(() => {
    if (!audioOn || !board) return;
    for (const b of board.boards) {
      if (b.currentCalled == null) continue;
      const stamp = `${b.doctorId}:${b.currentCalled}`;
      if (lastSpoken.current === stamp) continue;
      lastSpoken.current = stamp;
      speak(`Now calling token number ${b.currentCalled}`, board?.boards.length ?? 1);
      return; // one announcement per tick
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, audioOn]);

  function speak(text: string, _voices: number) {
    try {
      if (!("speechSynthesis" in window)) {
        setAudioError("Speech is not supported on this device — the visual display still works.");
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.9;
      u.lang = "en-IN";
      window.speechSynthesis.speak(u);
      setAudioError(null);
    } catch {
      setAudioError("Audio failed — the visual notification remains active.");
    }
  }

  async function enableAudio() {
    try {
      if ("speechSynthesis" in window) {
        // unlock sample — also gives the staff member confirmation
        const u = new SpeechSynthesisUtterance("Voice announcements enabled");
        u.volume = 0.5;
        window.speechSynthesis.speak(u);
      }
      setAudioOn(true);
      setAudioError(null);
    } catch {
      setAudioError("Audio could not be enabled on this device.");
    }
  }

  const stamp = board?.updatedAt ? new Date(board.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

  return (
    <div
      className={
        "min-h-screen w-full p-8 transition-colors " +
        (dark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900")
      }
      style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
    >
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">OPD — Now Calling</h1>
            <p className="text-sm opacity-60">
              Live token board · updated {stamp} · refreshes every 5 s · patient details are never shown on this screen
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!audioOn ? (
              <button
                onClick={enableAudio}
                className="flex items-center gap-2 rounded-lg border border-slate-400/40 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
              >
                <VolumeX className="size-4" /> Enable voice announcements
              </button>
            ) : (
              <span className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-300">
                <Volume2 className="size-4" /> Voice on
              </span>
            )}
            <button
              onClick={() => setDark((d) => !d)}
              className="rounded-lg border border-slate-400/40 p-2 hover:bg-black/5 dark:hover:bg-white/10"
              aria-label="Toggle display theme"
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
        </header>

        {audioError && (
          <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
            {audioError}
          </p>
        )}

        {(!board || board.boards.length === 0) && (
          <div className="rounded-2xl border border-slate-300/40 bg-white/40 p-16 text-center dark:bg-slate-900/40">
            <p className="text-lg font-medium">No tokens called yet today</p>
            <p className="mt-1 text-sm opacity-60">The board fills in automatically as doctors call their next patients.</p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {(board?.boards ?? []).map((b) => {
            const isHighlighted = b.currentCalled != null;
            return (
              <div
                key={b.doctorId}
                className={
                  "rounded-2xl border p-6 transition-all " +
                  (isHighlighted
                    ? "border-emerald-500/60 bg-emerald-500/10 shadow-[0_0_40px_rgba(16,185,129,0.15)]"
                    : "border-slate-300/40 bg-white/40 dark:bg-slate-900/40")
                }
              >
                <p className="text-sm font-semibold uppercase tracking-widest opacity-60">{b.department || "OPD"}</p>
                <p className="mt-0.5 text-lg font-semibold">{b.doctorName}</p>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider opacity-60">Current token</p>
                    <p
                      className={
                        "mt-1 font-black tabular-nums leading-none " +
                        (isHighlighted ? "text-7xl text-emerald-500 animate-pulse" : "text-6xl opacity-40")
                      }
                    >
                      {b.currentCalled ?? "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wider opacity-60">Previously called</p>
                    <div className="mt-1 flex flex-row-reverse gap-2">
                      {b.lastCalled.filter((t) => t !== b.currentCalled).slice(0, 4).map((t) => (
                        <span key={t} className="rounded bg-black/5 px-2 py-1 text-lg font-bold tabular-nums dark:bg-white/10">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
