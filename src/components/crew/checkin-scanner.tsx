"use client";

import * as React from "react";
import {
  Camera as CameraIcon,
  CameraOff,
  CircleAlert,
  CircleCheck,
  CircleX,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { CheckinResult } from "@/contracts";
import { api } from "@/lib/api-client";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Textarea,
  type Tone,
} from "@/components/ui";
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

type Props = { slug: string; eventName: string; clockOffsetMs: number };

const LOCAL: Record<Exclude<LocalCheck, { ok: true }>["reason"], string> = {
  malformed: "Not a ticket code",
  bad_signature: "Invalid ticket: the signature does not match",
  expired: "This ticket has expired",
  wrong_event: "This ticket is for another event",
  revoked: "This ticket was cancelled",
};
const SERVER: Record<CheckinResult["status"], { label: string; tone: Tone }> = {
  checked_in: { label: "Checked in", tone: "approved" },
  duplicate: { label: "Already checked in", tone: "pending" },
  invalid: { label: "Invalid ticket", tone: "danger" },
  revoked: { label: "Ticket cancelled", tone: "danger" },
  expired: { label: "Ticket expired", tone: "danger" },
  wrong_event: { label: "Another event's ticket", tone: "danger" },
};
const short = (id: string) => id.slice(-6).toUpperCase();

type ResultTone = "approved" | "pending" | "danger";
// Strong fills for the scan result, each a checked token pair, plus an icon so colour is never the only cue.
const RESULT: Record<ResultTone, { box: string; icon: React.ReactNode; label: string }> = {
  approved: { box: "bg-approved-soft text-approved-soft-fg", icon: <CircleCheck aria-hidden />, label: "OK" },
  pending: { box: "bg-pending-soft text-pending-soft-fg", icon: <CircleAlert aria-hidden />, label: "Seen" },
  danger: { box: "bg-emergency text-on-emergency", icon: <CircleX aria-hidden />, label: "Not valid" },
};

/** Corner brackets that frame the scan area. Decorative. */
function Frame({ children }: { children?: React.ReactNode }) {
  // The nested dark scope makes the curtain lime, which reads on the black viewfinder in both themes.
  const corner = "absolute size-8 border-curtain";
  return (
    <div className="dark relative aspect-square w-full overflow-hidden rounded-card bg-black text-fg">
      {children}
      <span aria-hidden className="pointer-events-none absolute inset-4">
        <span className={cn(corner, "top-0 left-0 rounded-tl-lg border-t-4 border-l-4")} />
        <span className={cn(corner, "top-0 right-0 rounded-tr-lg border-t-4 border-r-4")} />
        <span className={cn(corner, "bottom-0 left-0 rounded-bl-lg border-b-4 border-l-4")} />
        <span className={cn(corner, "right-0 bottom-0 rounded-br-lg border-r-4 border-b-4")} />
      </span>
    </div>
  );
}

type BarcodeDetectorLike = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o: { formats: string[] }) => BarcodeDetectorLike;

/** Camera scanning with the browser's own QR reader (Chrome on Android); manual entry everywhere else. */
function Camera({ onCode }: { onCode: (code: string) => void }) {
  const Detector = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  const video = React.useRef<HTMLVideoElement>(null);
  const [on, setOn] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
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
        setError("The camera is not available. Enter the ticket code instead.");
        setOn(false);
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on, Detector, onCode]);

  if (!Detector)
    return (
      <p className="text-sm text-fg-muted">
        This browser cannot read QR codes with the camera. Enter the ticket code below.
      </p>
    );
  return (
    <div className="flex flex-col gap-3">
      {on ? (
        <Frame>
          <video ref={video} muted playsInline className="size-full object-cover" />
          <span
            aria-hidden
            className="absolute inset-x-6 top-1/2 h-0.5 rounded-full bg-curtain motion-safe:animate-pulse"
          />
        </Frame>
      ) : null}
      <Button variant="secondary" size="lg" block onClick={() => setOn((v) => !v)}>
        {on ? <CameraOff aria-hidden /> : <CameraIcon aria-hidden />}
        {on ? "Stop camera" : "Scan with camera"}
      </Button>
      {error ? <p className="text-sm text-danger-text">{error}</p> : null}
    </div>
  );
}

/** The volunteer's check-in screen: verify offline, queue, and sync when the network is back. */
export function CheckinScanner({ slug, eventName, clockOffsetMs }: Props) {
  const [key, setKey] = React.useState<EventKey | null>(null);
  const online = React.useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
  const [scans, setScans] = React.useState<QueuedScan[]>([]);
  const [last, setLast] = React.useState<{ text: string; tone: ResultTone } | null>(null);
  const [code, setCode] = React.useState("");
  const syncing = React.useRef(false);

  const newestFirst = (all: QueuedScan[]) =>
    [...all].sort((a, b) => b.deviceTime.localeCompare(a.deviceTime));
  const refresh = React.useCallback(async () => {
    const all = await allScans().catch(() => [] as QueuedScan[]);
    setScans(newestFirst(all));
    return all;
  }, []);

  // The key: from the network when there is one, else the copy kept on the device.
  React.useEffect(() => {
    allScans().then(
      (all) => setScans(newestFirst(all)),
      () => undefined,
    );
    Promise.all([
      api.call("verifyKey", { params: { slug } }),
      api.call("revocations", { params: { slug } }).catch(() => ({ revokedTicketIds: [] as string[] })),
    ]).then(
      ([k, r]) => {
        const fresh: EventKey = {
          eventId: k.eventId,
          publicKey: k.publicKey,
          keyId: k.keyId,
          revoked: r.revokedTicketIds,
          at: new Date().toISOString(),
        };
        saveKey(slug, fresh);
        setKey(fresh);
      },
      () => setKey(loadKey(slug)),
    );
  }, [slug]);

  const sync = React.useCallback(async () => {
    if (syncing.current || !navigator.onLine) return;
    const queued = (await refresh()).filter((s) => s.state === "queued");
    if (!queued.length) return;
    syncing.current = true;
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
      const ok = results.filter((r) => r.status === "checked_in").length;
      const dup = results.filter((r) => r.status === "duplicate").length;
      setLast({
        text: `Synced ${results.length}: ${ok} checked in${dup ? `, ${dup} already checked in` : ""}`,
        tone: "approved",
      });
    } catch {
      // Still offline in practice; the queue stays and the next "online" event retries.
    } finally {
      syncing.current = false;
      await refresh();
    }
  }, [refresh]);

  // Back online: send the queue.
  React.useEffect(() => {
    const up = () => void sync();
    window.addEventListener("online", up);
    return () => window.removeEventListener("online", up);
  }, [sync]);

  const check = React.useCallback(
    async (token: string) => {
      if (!key) {
        setLast({
          text: "The event key is not on this device yet. Connect once to download it.",
          tone: "danger",
        });
        return;
      }
      const res = await verifyOffline(token, key, Date.now() + clockOffsetMs);
      if (!res.ok) {
        setLast({ text: LOCAL[res.reason], tone: "danger" });
        return;
      }
      const seen = (await refresh()).find((s) => s.ticketId === res.claims.ticketId);
      if (seen) {
        setLast({
          text: `Already checked in on this device at ${formatTime(seen.deviceTime)}`,
          tone: "pending",
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
      setLast({
        text: `Valid ticket ${short(res.claims.ticketId)}. ${navigator.onLine ? "Checking in" : "Queued until the network is back"}.`,
        tone: "approved",
      });
      await refresh();
      void sync();
    },
    [key, clockOffsetMs, refresh, sync],
  );

  const queued = scans.filter((s) => s.state === "queued").length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="kicker text-curtain-text">Crew</p>
          <h1 className="text-2xl">Check-in, {eventName}</h1>
        </div>
        <Badge tone={online ? "approved" : "pending"} className="px-2.5 py-1">
          {online ? <Wifi aria-hidden /> : <WifiOff aria-hidden />}
          {`${online ? "Online" : "Offline"}${queued ? `, ${queued} queued` : ""}`}
        </Badge>
      </div>
      {!online ? (
        <Alert variant="warning" title={`Offline: ${queued} check-in${queued === 1 ? "" : "s"} queued`}>
          Tickets are verified on this device. The queue syncs when the network is back.
        </Alert>
      ) : queued ? (
        <Alert
          variant="info"
          title={`${queued} check-in${queued === 1 ? "" : "s"} waiting to sync`}
          action={
            <Button size="sm" onClick={() => void sync()}>
              Sync now
            </Button>
          }
        />
      ) : null}
      {!key ? (
        <Alert variant="danger" title="No event key on this device">
          Connect to the network once so the device can download the key it uses to verify tickets.
        </Alert>
      ) : null}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Scan a ticket</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Camera onCode={(c) => void check(c)} />
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) void check(code.trim()).then(() => setCode(""));
            }}
          >
            <Field label="Ticket code" hint="The text inside the attendee's QR code">
              <Textarea value={code} onChange={(e) => setCode(e.target.value)} rows={3} spellCheck={false} />
            </Field>
            <Button type="submit" size="lg" block disabled={!code.trim()}>
              Check in
            </Button>
          </form>
          {last ? (
            <p
              role="status"
              aria-live="polite"
              className={cn(
                "flex items-start gap-3 rounded-card p-4 text-base font-medium [&_svg]:mt-0.5 [&_svg]:size-6 [&_svg]:shrink-0",
                "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200",
                RESULT[last.tone].box,
              )}
            >
              {RESULT[last.tone].icon}
              <span className="flex flex-col gap-0.5">
                <span className="kicker">{RESULT[last.tone].label}</span>
                {last.text}
              </span>
            </p>
          ) : null}
        </CardContent>
      </Card>
      <section aria-labelledby="recent" className="flex flex-col gap-2">
        <h2 id="recent" className="kicker text-fg-muted">
          This device
        </h2>
        {scans.length ? (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-surface text-sm">
            {scans.slice(0, 50).map((s) => {
              const r = s.result && SERVER[s.result.status];
              return (
                <li key={s.clientId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="font-mono text-fg-muted tabular-nums">{formatTime(s.deviceTime)}</span>
                  <span className="min-w-0 flex-1 font-medium">
                    {s.result?.registration?.name ?? `Ticket ${short(s.ticketId)}`}
                  </span>
                  {r ? <Badge tone={r.tone}>{r.label}</Badge> : <Badge tone="pending">Queued</Badge>}
                  {s.result?.status === "duplicate" && s.result.original ? (
                    <span className="basis-full text-fg-muted">
                      at {formatTime(s.result.original.at)} by {s.result.original.scannerName}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">No scans yet.</p>
        )}
      </section>
    </div>
  );
}
