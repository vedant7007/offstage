/**
 * Mock backend for the api client (NEXT_PUBLIC_API_MOCK=1). Answers from the contract fixtures,
 * so the public pages, attendee portal, crew PWA and console run with no database.
 * Loaded lazily by src/lib/api-client.ts only in mock mode.
 */
import type {
  ChatRequest,
  ChatStreamChunk,
  CheckinRequest,
  CheckinResult,
  EndpointName,
} from "@/contracts/api";
import { CHARITY_SLUG, fixtures, type EventWorld } from "@/contracts/fixtures";
import * as responses from "@/contracts/fixtures/responses";
import { ApiClientError } from "./api-client";

type Args = { params?: Record<string, string>; body?: unknown; query?: Record<string, unknown> };

function worldFor(slug: string | undefined): EventWorld {
  if (!slug) return fixtures.eventFull();
  if (slug === CHARITY_SLUG) return fixtures.charityDrive();
  const w = fixtures.eventFull();
  if (slug !== w.event.slug) throw new ApiClientError(404, "not_found", "Event not found");
  return w;
}

/** Scans seen in this browser session, so a second scan of the same ticket shows as a duplicate. */
const scanned = new Map<string, { at: string; scannerName: string }>();

function mockCheckin(w: EventWorld, scan: CheckinRequest): CheckinResult {
  const samples = responses.checkinResults(w);
  if (!scan.ticketPayload || !scan.signature || scan.signature.length < 20) {
    return { ...samples.invalid, clientId: scan.clientId };
  }
  const prior = scanned.get(scan.ticketPayload);
  if (prior) return { ...samples.duplicate, clientId: scan.clientId, original: prior };
  scanned.set(scan.ticketPayload, {
    at: scan.deviceTime,
    scannerName: w.personas.volunteer?.name ?? "a volunteer",
  });
  return { ...samples.checkedIn, clientId: scan.clientId };
}

export async function mockCall(name: EndpointName, args: Args): Promise<unknown> {
  const p = args.params ?? {};
  const w = worldFor(p.slug);
  switch (name) {
    case "health":
      return { ok: true };
    case "overview":
      return responses.overview(w);
    case "listProposals":
      return responses.listProposals(w);
    case "getProposal":
      return responses.proposalDetail(w, p.proposalId ?? w.proposals[0]!.id);
    case "approveProposal":
    case "rejectProposal":
    case "editProposal":
    case "undoProposal":
      return { proposal: responses.proposalDetail(w, p.proposalId ?? w.proposals[0]!.id).proposal };
    case "listAgentRuns":
      return { items: w.agentRuns, nextCursor: null };
    case "getAgentRun":
      return responses.agentRun(w, p.runId);
    case "personaFeed":
      return { personas: [] };
    case "deliveryStats":
      return {
        channels: [
          { channel: "email", real: 0, mock: 666, pending: 0, failed: 0, skipped: 0 },
          { channel: "telegram", real: 2, mock: 0, pending: 0, failed: 0, skipped: 664 },
          { channel: "whatsapp", real: 3, mock: 663, pending: 0, failed: 0, skipped: 0 },
        ],
      };
    case "killSwitch":
      return { globalAgentsEnabled: true, agents: w.agents };
    case "listRegistrations":
      return {
        items: w.registrations.slice(0, 50).map((r) => responses.registrationSummary(w, r.id)),
        nextCursor: null,
      };
    case "getRegistration":
      return { registration: w.registrations.find((r) => r.id === p.registrationId) ?? w.registrations[0] };
    case "finance":
      return responses.finance(w);
    case "sponsors":
      return responses.sponsors(w);
    case "marketing":
      return responses.marketing(w);
    case "milestones":
      return responses.milestones(w);
    case "incidents":
      return responses.incidents(w);
    case "getBriefing":
    case "generateBriefing":
      return { briefing: w.briefings[0] ?? null };
    case "whatIf":
      return w.whatIfRuns[0];
    case "command":
      return {
        status: "questions",
        conversationId: "mock-command",
        questions: [{ id: "q1", text: "Mock mode: agents do not run. Which session do you mean?" }],
      };

    case "me":
    case "setActiveEvent":
      return responses.me(w, "attendee");
    case "intake":
      return {
        status: "questions",
        conversationId: "mock-intake",
        questions: [{ id: "name", text: "Mock mode: the Commander does not run. What is the event called?" }],
        eventId: w.event.id,
        brief: {},
      };
    case "demoTrigger":
      return { message: "Mock mode: scenarios do not run." };
    case "switchPersona":
      return responses.me(w, (args.body as { persona?: never } | undefined)?.persona ?? "attendee");
    case "myRegistration":
      return responses.myRegistration(w);
    case "myTicket":
      return responses.myTicket(w);
    case "mySchedule":
      return responses.mySchedule(w);
    case "dataRequest":
      return { requestId: "mock-data-request", status: "received" };

    case "publicEvent":
      return responses.publicEvent(w);
    case "publicStatus":
      return responses.publicStatus(w);
    case "otpRequest":
      return { sent: true, resendAfterSeconds: 30 };
    case "otpVerify":
      return { verified: true, verificationToken: "mock-verification-token" };
    case "register":
      return {
        registrationId: w.registrations[0]!.id,
        status: "confirmed",
        ticket: responses.myTicket(w),
        duplicateSuspected: false,
      };
    case "verifyKey":
      return responses.verifyKey(w);
    case "revocations":
      return { eventId: w.event.id, revokedTicketIds: [], updatedAt: w.now };
    case "speakerForm":
    case "volunteerSignup":
    case "crewShiftCheckin":
      return { ok: true };
    case "verifyCertificate":
      return responses.certificateVerify(w, /revoked/i.test(p.certId ?? ""));

    case "crewShifts":
      return responses.crewShifts(w);
    case "crewCheckin":
      return mockCheckin(w, args.body as CheckinRequest);
    case "crewCheckinSync":
      return { results: (args.body as { scans: CheckinRequest[] }).scans.map((s) => mockCheckin(w, s)) };
    case "crewSearch":
      return responses.crewSearch(w, String(args.query?.q ?? ""));
    case "crewIncident": {
      const b = args.body as { category: string; severity: string; description: string; roomId?: string };
      const emergency = ["safety", "medical", "fire", "harassment"].includes(b.category);
      return {
        incident: fixtures.incident({
          ...b,
          category: b.category as never,
          severity: b.severity as never,
          status: "open",
          source: "crew_report",
          emergency,
          createdAt: w.now,
        }),
        emergencyContacts: emergency
          ? [{ label: "First aid room G-12, Block A", phone: "+910000000000" }]
          : [],
      };
    }
    case "crewTasks":
      return { tasks: w.tasks };
    case "crewTaskUpdate": {
      const task = w.tasks.find((t) => t.id === p.taskId) ?? w.tasks[0]!;
      return { task: { ...task, status: (args.body as { status: string }).status } };
    }
    case "stream":
    case "publicStatusStream":
    case "chat":
      throw new ApiClientError(501, "bad_request", `${name} is a stream; use api.chat() or api.streamUrl()`);
  }
}

export async function* mockChat(body: ChatRequest): AsyncGenerator<ChatStreamChunk> {
  const w = fixtures.eventFull();
  const q = body.message.toLowerCase();
  const result = /od|lunch|khana|food|wifi|check.?in/.test(q)
    ? responses.chatAnswered(w)
    : /ignore (all|previous)|system prompt|you are now/.test(q)
      ? responses.chatBlocked()
      : responses.chatEscalated(w);
  for (const word of result.answer.answer.split(/(\s+)/)) {
    if (word) yield { type: "delta", text: word };
  }
  yield { type: "done", result };
}
