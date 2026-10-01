"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  Camera as CameraIcon,
  CameraOff,
  CircleAlert,
  CircleCheck,
  CircleX,
  Info,
  RefreshCw,
  ScanLine,
} from "lucide-react";
import type { CheckinResult } from "@/contracts";
import { api } from "@/lib/api-client";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Alert, Badge, Button, Field, Textarea, type Tone } from "@/components/ui";
import { ConfirmBurst, Kicker, useReducedMotion } from "@/components/ui/motion";
import {
  allScans,
  loadKey,
  putScan,
  saveKey,
  verifyOffline,
  type EventKey,
  type LocalCheck,
  type QueuedScan,
} from "./offline";
import { SyncPill, useOnline } from "./sync-status";
import fx from "./crew.module.css";

type Props = { slug: string; eventName: string; clockOffsetMs: number };

type ResultTone = "approved" | "pending" | "danger";
type Result = { tone: ResultTone; title: string; detail: string };

// What the volunteer sees when the device itself rejects a code. Short title, then what to do.
const LOCAL: Record<Exclude<LocalCheck, { ok: true }>["reason"], Omit<Result, "tone">> = {
  malformed: {
    title: "Not a ticket",
    detail: "This code is not an event ticket. Ask them to open their ticket again.",
  },
  bad_signature: {
    title: "Not genuine",
    detail: "The ticket signature does not match. Do not admit, call the event head.",
  },
  expired: { title: "Ticket expired", detail: "This ticket is past its valid dates." },
  wrong_event: { title: "Wrong event", detail: "This ticket is for a different event." },
  revoked: { title: "Ticket cancelled", detail: "This registration was cancelled. Do not admit." },
};
const SERVER: Record<CheckinResult["status"], { label: string; tone: ResultTone }> = {
  checked_in: { label: "Checked in", tone: "approved" },
  duplicate: { label: "Already checked in", tone: "pending" },
  invalid: { label: "Invalid ticket", tone: "danger" },
  revoked: { label: "Ticket cancelled", tone: "danger" },
  expired: { label: "Ticket expired", tone: "danger" },
  wrong_event: { label: "Wrong event", tone: "danger" },
};
const short = (id: string) => id.slice(-6).toUpperCase();
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

// Strong fills so the answer reads from arm's length. The nested .light scope keeps lime and gold
// fills with black text in both themes; danger is the solid red. Each has its own icon too.
const RESULT: Record<ResultTone, { box: string; icon: React.ReactNode }> = {
  approved: { box: "light bg-approved-soft text-approved-soft-fg", icon: <CircleCheck aria-hidden /> },
  pending: { box: "light bg-pending-soft text-pending-soft-fg", icon: <CircleAlert aria-hidden /> },
  danger: { box: "bg-emergency text-on-emergency", icon: <CircleX aria-hidden /> },
};
// A buzz people can feel in a loud hall: one short pulse for yes, three for no.
const BUZZ: Record<ResultTone, number[]> = {
  approved: [60],
  pending: [60, 80, 60],
  danger: [120, 80, 120, 80, 120],
};

/** Corner brackets that frame the scan area. Decorative. */
function Frame({ children }: { children?: React.ReactNode }) {
  // The nested dark scope makes the curtain lime, which reads on the black viewfinder in both themes.
  const corner = "absolute size-10 border-curtain";
  return (
    <div className="dark relative aspect-square w-full overflow-hidden rounded-card bg-black text-fg">
      {children}
      <span aria-hidden className="pointer-events-none absolute inset-5">
        <span className={cn(corner, "top-0 left-0 rounded-tl-xl border-t-4 border-l-4")} />
        <span className={cn(corner, "top-0 right-0 rounded-tr-xl border-t-4 border-r-4")} />
        <span className={cn(corner, "bottom-0 left-0 rounded-bl-xl border-b-4 border-l-4")} />
        <span className={cn(corner, "right-0 bottom-0 rounded-br-xl border-r-4 border-b-4")} />
      </span>
    </div>
  );
}

type BarcodeDetectorLike = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o: { formats: string[] }) => BarcodeDetectorLike;

/** Camera scanning with the browser's own QR reader (Chrome on Android); manual entry everywhere else. */
const detectorCtor = () => (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
/** Read after hydration only, so the server and first client render agree. */
const useHasDetector = () =>
  React.useSyncExternalStore(
    () => () => undefined,
    () => !!detectorCtor(),
    () => false,
  );

function Camera({ onCode }: { onCode: (code: string) => void }) {
  const hasDetector = useHasDetector();
  const video = React.useRef<HTMLVideoElement>(null);
  const [on, setOn] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    const Detector = detectorCtor();
    if (!on || !Detector) return;
    let stream: MediaStream | undefined;
    let stop = false;
    let last = "";
    const detector = new Detector({ formats: ["qr_code"] });
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        while (!stop) {
          const [hit] = await detector.detect(video.current).catch(() => []);
          if (hit && hit.rawValue !== last) {
            last = hit.rawValue;
            onCode(hit.rawValue);
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setError("The camera is not available. Paste the ticket code below instead.");
        setOn(false);
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on, onCode]);

  if (!hasDetector)
    return (
      <p className="flex items-start gap-2 text-sm text-fg-muted [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0">
        <Info aria-hidden />
        Camera scanning works in Chrome on Android. On this device, scan with any QR app and paste the code
        below.
      </p>
    );
  return (
    <div className="flex flex-col gap-3">
      {on ? (
        <Frame>
          <video ref={video} muted playsInline className="size-full object-cover" />
          <span aria-hidden className="pointer-events-none absolute inset-8 overflow-hidden">
            <span className={fx.sweep} />
          </span>
        </Frame>
      ) : null}
      <Button
        variant={on ? "secondary" : "primary"}
        size="lg"
        block
        className="min-h-14"
        aria-pressed={on}
        onClick={() => {
          setError(null);
          setOn((v) => !v);
        }}
      >
        {on ? <CameraOff aria-hidden className="size-5" /> : <CameraIcon aria-hidden className="size-5" />}
        {on ? "Stop camera" : "Scan with camera"}
      </Button>
      {error ? <p className="text-sm text-danger-text">{error}</p> : null}
    </div>
  );
}

/**
 * A full-screen flash in the answer's colour for a third of a second, readable from across a loud hall.
 * Portalled to <body> so no transformed ancestor can box it in. Not rendered under reduced motion.
 */
function Flash({ tone, seq }: { tone: ResultTone; seq: number }) {
  const still = useReducedMotion();
  if (still) return null;
  return createPortal(
    <div key={seq} aria-hidden className={cn(fx.flash, RESULT[tone].box)}>
      {RESULT[tone].icon}
    </div>,
    document.body,
  );
}

/** The answer to the last scan. Always mounted, so screen readers announce each new answer. */
function ResultPanel({ result, seq }: { result: Result | null; seq: number }) {
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (seq) box.current?.scrollIntoView({ block: "nearest" });
  }, [seq]);
  return (
    <div ref={box} role="status" aria-live="polite" className="scroll-my-4">
      {result ? (
        <div
          key={seq}
          data-tone={result.tone}
          className={cn(
            "flex min-h-28 items-start gap-4 rounded-card p-5 depth-2",
            fx.result,
            RESULT[result.tone].box,
          )}
        >
          <span className="relative flex size-14 shrink-0 items-center justify-center rounded-full bg-current/12 [&_svg]:size-9">
            <span className={cn("inline-flex", fx.pop)}>{RESULT[result.tone].icon}</span>
            {result.tone === "approved" ? (
              <ConfirmBurst key={seq} className="scale-150 text-current" />
            ) : null}
          </span>
          <div className="flex min-w-0 flex-col gap-1 pt-1">
            <p className="text-3xl leading-none font-medium tracking-[-0.025em]">{result.title}</p>
            <p className="mt-1 text-base">{result.detail}</p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-28 items-center gap-4 rounded-card border-[1.5px] border-dashed border-border-strong px-5 py-4 text-fg-muted">
          <span
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-curtain-soft text-curtain-soft-fg depth-1 [&_svg]:size-7"
          >
            <ScanLine />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-lg font-medium text-fg">Ready to scan</p>
            <p className="text-sm">Scan or paste a ticket. The answer shows here.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** The volunteer's check-in screen: verify offline, queue, and sync when the network is back. */
export function CheckinScanner({ slug, eventName, clockOffsetMs }: Props) {
  // undefined while the first copy loads, null when the device has none at all.
  const [key, setKey] = React.useState<EventKey | null | undefined>(undefined);
  const keyReady = React.useRef<Promise<EventKey | null>>(Promise.resolve(null));
  const online = useOnline();
  const hasCamera = useHasDetector();
  const [scans, setScans] = React.useState<QueuedScan[]>([]);
  const [result, setResult] = React.useState<{ value: Result; seq: number } | null>(null);
  const [code, setCode] = React.useState("");
  const [syncBusy, setSyncBusy] = React.useState(false);
  const syncing = React.useRef(false);

  const show = React.useCallback((value: Result) => {
    setResult((prev) => ({ value, seq: (prev?.seq ?? 0) + 1 }));
    try {
      navigator.vibrate?.(BUZZ[value.tone]);
    } catch {
      // Vibration is a bonus; some browsers block it.
    }
  }, []);

  const newestFirst = (all: QueuedScan[]) =>
    [...all].sort((a, b) => b.deviceTime.localeCompare(a.deviceTime));
  const refresh = React.useCallback(async () => {
    const all = await allScans().catch(() => [] as QueuedScan[]);
    setScans(newestFirst(all));
    return all;
  }, []);

  // The key: a fresh one from the network when there is one, else the copy kept on the device.
  React.useEffect(() => {
    allScans().then(
      (all) => setScans(newestFirst(all)),
      () => undefined,
    );
    // Offline, the fetch fails fast and the copy kept on the device takes over.
    const cached = loadKey(slug);
    const fresh = Promise.all([
      api.call("verifyKey", { params: { slug } }),
      api.call("revocations", { params: { slug } }).catch(() => ({ revokedTicketIds: [] as string[] })),
    ]).then(
      ([k, r]) => {
        const next: EventKey = {
          eventId: k.eventId,
          publicKey: k.publicKey,
          keyId: k.keyId,
          revoked: r.revokedTicketIds,
          at: new Date().toISOString(),
        };
        saveKey(slug, next);
        return next;
      },
      () => cached,
    );
    keyReady.current = fresh;
    void fresh.then(setKey);
  }, [slug]);

  const sync = React.useCallback(async () => {
    if (syncing.current || !navigator.onLine) return;
    const queued = (await refresh()).filter((s) => s.state === "queued");
    if (!queued.length) return;
    syncing.current = true;
    setSyncBusy(true);
    try {
      const { results } = await api.call("crewCheckinSync", {
        body: {
          scans: queued.map(({ ticketPayload, signature, deviceTime, clientId }) => ({
            ticketPayload,
            signature,
            deviceTime,
            clientId,
          })),
        },
      });
      for (const r of results) {
        const s = queued.find((q) => q.clientId === r.clientId);
        if (s) await putScan({ ...s, state: "synced", result: r });
      }
      const [only] = results;
      if (results.length === 1 && only) {
        // One scan, one answer: say who it was, or when they were first let in.
        const s = SERVER[only.status];
        const who = only.registration ? `${only.registration.name}, ${only.registration.college}` : null;
        const first = only.original
          ? `First checked in at ${formatTime(only.original.at)} by ${only.original.scannerName}.`
          : null;
        show({ tone: s.tone, title: s.label, detail: first ?? who ?? "The server confirmed this scan." });
      } else if (results.length) {
        const ok = results.filter((r) => r.status === "checked_in").length;
        const dup = results.filter((r) => r.status === "duplicate").length;
        const bad = results.length - ok - dup;
        show({
          tone: bad ? "danger" : dup ? "pending" : "approved",
          title: `Synced ${plural(results.length, "scan")}`,
          detail: [`${ok} checked in`, dup ? `${dup} already in` : "", bad ? `${bad} not valid` : ""]
            .filter(Boolean)
            .join(", "),
        });
      }
    } catch {
      // Still offline in practice; the queue stays and the next "online" event retries.
    } finally {
      syncing.current = false;
      setSyncBusy(false);
      await refresh();
    }
  }, [refresh, show]);

  // Back online: send the queue.
  React.useEffect(() => {
    const up = () => void sync();
    window.addEventListener("online", up);
    return () => window.removeEventListener("online", up);
  }, [sync]);

  const check = React.useCallback(
    async (token: string) => {
      const k = key ?? (await keyReady.current);
      if (!k) {
        show({
          tone: "danger",
          title: "Cannot verify yet",
          detail: "This device does not have the event key. Connect to the internet once to download it.",
        });
        return;
      }
      const res = await verifyOffline(token, k, Date.now() + clockOffsetMs);
      if (!res.ok) {
        show({ tone: "danger", ...LOCAL[res.reason] });
        return;
      }
      const seen = (await refresh()).find((s) => s.ticketId === res.claims.ticketId);
      if (seen) {
        show({
          tone: "pending",
          title: "Already checked in",
          detail: `Scanned on this device at ${formatTime(seen.deviceTime)}.`,
        });
        return;
      }
      await putScan({
        ticketPayload: res.payload,
        signature: res.signature,
        deviceTime: new Date(Date.now() + clockOffsetMs).toISOString(),
        clientId: crypto.randomUUID(),
        ticketId: res.claims.ticketId,
        state: "queued",
      });
      show({
        tone: "approved",
        title: "Valid ticket",
        detail: navigator.onLine
          ? `Ticket ${short(res.claims.ticketId)}. Checking in now.`
          : `Let them in. Ticket ${short(res.claims.ticketId)} is saved here and syncs when you are back online.`,
      });
      await refresh();
      void sync();
    },
    [key, clockOffsetMs, refresh, sync, show],
  );

  const queued = scans.filter((s) => s.state === "queued").length;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-3">
          <Kicker>{eventName}</Kicker>
          <h1 className="text-3xl">Check-in</h1>
        </div>
        <SyncPill online={online} queued={queued} total={scans.length} />
      </header>

      {!online ? (
        <Alert variant="warning" title="You are offline. Keep scanning." className={fx.drop}>
          This device checks tickets on its own.{" "}
          {queued ? `${plural(queued, "scan")} will sync` : "Scans sync"} when the network is back.
        </Alert>
      ) : queued ? (
        <Alert
          variant="info"
          className={fx.drop}
          title={`${plural(queued, "scan")} waiting to sync`}
          action={
            <Button size="sm" variant="secondary" loading={syncBusy} onClick={() => void sync()}>
              <RefreshCw aria-hidden />
              Sync now
            </Button>
          }
        />
      ) : null}
      {key === null ? (
        <Alert variant="danger" title="This device cannot verify tickets yet" className={fx.drop}>
          Connect to the internet once so it can download the event key. After that, check-in works offline.
        </Alert>
      ) : null}

      <ResultPanel result={result?.value ?? null} seq={result?.seq ?? 0} />
      {result ? <Flash tone={result.value.tone} seq={result.seq} /> : null}

      <section
        aria-labelledby="scan-title"
        className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 depth-2 md:p-6"
      >
        <h2 id="scan-title" className="sr-only">
          Scan a ticket
        </h2>
        <Camera onCode={(c) => void check(c)} />
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void check(code.trim()).then(() => setCode(""));
          }}
        >
          <Field label="Ticket code" hint="Paste the text your QR app reads from the ticket">
            <Textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              rows={2}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="font-mono text-sm"
            />
          </Field>
          <Button
            type="submit"
            variant={hasCamera ? "secondary" : "primary"}
            size="lg"
            block
            className="min-h-14"
            disabled={!code.trim()}
          >
            Check in
          </Button>
        </form>
      </section>

      <section aria-labelledby="recent" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="recent" className="kicker text-fg-muted">
            Scans on this device
          </h2>
          {scans.length ? (
            <span className="font-mono text-xs text-fg-muted tabular-nums">{scans.length}</span>
          ) : null}
        </div>
        {scans.length ? (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-surface depth-2">
            {scans.slice(0, 50).map((s) => {
              const r = s.result && SERVER[s.result.status];
              const tone: Tone = r ? r.tone : "pending";
              return (
                <li
                  key={s.clientId}
                  className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
                >
                  <span className="font-mono text-sm text-fg-muted tabular-nums">
                    {formatTime(s.deviceTime)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {s.result?.registration?.name ?? `Ticket ${short(s.ticketId)}`}
                  </span>
                  <Badge tone={tone}>{r ? r.label : "Waiting to sync"}</Badge>
                  {s.result?.status === "duplicate" && s.result.original ? (
                    <span className="basis-full text-sm text-fg-muted">
                      First in at {formatTime(s.result.original.at)} by {s.result.original.scannerName}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-card border-[1.5px] border-dashed border-border px-5 py-5 text-sm text-fg-muted">
            No scans yet. Each ticket you scan lands here, newest first, and stays on this device until it
            syncs.
          </p>
        )}
      </section>
    </div>
  );
}
