import type { ActionKind } from "@/contracts";
import type { AnyExecutor, Executor } from "../types";
import { scheduleReminders, sendAnnouncement, sendDirect } from "./comms";
import { assignShift, briefingDraft, createShift, createTask, unassignShift } from "./crew";
import {
  compareQuotes,
  createIncident,
  escalate,
  publishKbUpdate,
  recordExpense,
  recordIncome,
  reply,
  setBudget,
  updateIncident,
} from "./ops";
import { flagDuplicate, mergeRegistrations, promoteWaitlist, setCapacity, setStatus } from "./registration";
import { cancelSession, changeRoom, createSession, moveSession, shiftDownstream } from "./schedule";

type Registry = { [K in ActionKind]?: Executor<K> };

/** One executor per action kind. plan.bundle is handled by the engine itself (children run atomically). */
const EXECUTORS: Registry = {
  "schedule.move_session": moveSession,
  "schedule.change_room": changeRoom,
  "schedule.cancel_session": cancelSession,
  "schedule.create_session": createSession,
  "schedule.shift_downstream": shiftDownstream,
  "crew.assign_shift": assignShift,
  "crew.unassign_shift": unassignShift,
  "crew.create_shift": createShift,
  "crew.create_task": createTask,
  "crew.briefing.draft": briefingDraft,
  "registration.promote_waitlist": promoteWaitlist,
  "registration.set_status": setStatus,
  "registration.flag_duplicate": flagDuplicate,
  "registration.merge": mergeRegistrations,
  "registration.capacity.set": setCapacity,
  "incident.create": createIncident,
  "incident.update": updateIncident,
  "helpdesk.escalate": escalate,
  "helpdesk.reply": reply,
  "kb.publish_update": publishKbUpdate,
  "finance.expense.record": recordExpense,
  "finance.income.record": recordIncome,
  "finance.budget.set": setBudget,
  "finance.quote.compare": compareQuotes,
  "comms.send_announcement": sendAnnouncement,
  "comms.send_direct": sendDirect,
  "comms.reminder.schedule": scheduleReminders,
};

export function executorFor(kind: ActionKind): AnyExecutor | undefined {
  return EXECUTORS[kind] as AnyExecutor | undefined;
}

export function supportedKinds(): ActionKind[] {
  return Object.keys(EXECUTORS) as ActionKind[];
}
