"use client";

import * as React from "react";
import Link from "next/link";
import type { EventBrief, IntakeResponse } from "@/contracts";
import { api } from "@/lib/api-client";
import { formatInr } from "@/lib/format";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  KeyValueList,
  PageHeader,
  Textarea,
} from "@/components/ui";

type Turn = { who: "you" | "commander"; text: string };

const LABELS: [keyof EventBrief, string, (v: never) => string][] = [
  ["name", "Name", (v: string) => v],
  ["type", "Type", (v: string) => v.replace("_", " ")],
  ["dates", "Dates", (v: string[]) => v.join(", ")],
  ["venue", "Venue", (v: string) => v],
  ["expectedAttendance", "People", (v: number) => v.toLocaleString("en-IN")],
  ["budgetInr", "Budget", (v: number) => formatInr(v)],
];

/** The Commander's intake interview: describe the event, answer what it asks, review the plan. */
export function IntakeChat() {
  const [turns, setTurns] = React.useState<Turn[]>([
    {
      who: "commander",
      text: "Tell me about your event in a few sentences: what it is, when, where, for how many people, and the budget.",
    },
  ]);
  const [text, setText] = React.useState("");
  const [state, setState] = React.useState<IntakeResponse | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const send = (message: string) => {
    const m = message.trim();
    if (!m || busy) return;
    setTurns((t) => [...t, { who: "you", text: m }]);
    setText("");
    setBusy(true);
    setError(null);
    const body = {
      text: m,
      ...(state?.eventId ? { eventId: state.eventId } : {}),
      ...(state && "conversationId" in state ? { conversationId: state.conversationId } : {}),
    };
    api
      .call("intake", { body })
      .then(
        (r) => {
          setState(r);
          const reply =
            r.status === "questions"
              ? r.questions.map((q) => q.text).join(" ")
              : r.status === "planned"
                ? `Your plan is ready: ${r.agentsWoken.length} agents, with milestones and a budget split. Review and approve it to start.`
                : r.reason;
          setTurns((t) => [...t, { who: "commander", text: reply }]);
        },
        (e: unknown) => setError(e instanceof Error ? e.message : "The Commander could not reply"),
      )
      .finally(() => setBusy(false));
  };

  const brief = state?.brief ?? {};
  const questions = state?.status === "questions" ? state.questions : [];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Commander, intake"
        title="Plan a new event"
        description="The Commander interviews you, then drafts the plan and the agent team for your approval."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section aria-label="Interview" className="flex flex-col gap-4">
          <ol className="flex flex-col gap-3" aria-live="polite">
            {turns.map((t, i) => (
              <li
                key={i}
                className={
                  t.who === "you"
                    ? "max-w-[85%] self-end rounded-card rounded-br-[4px] bg-curtain px-4 py-3 text-on-curtain"
                    : "flex max-w-[85%] flex-col gap-1 self-start rounded-card rounded-tl-[4px] border border-border bg-surface px-4 py-3 depth-2"
                }
              >
                {t.who === "you" ? null : (
                  <span aria-hidden className="kicker text-curtain-text">
                    Commander
                  </span>
                )}
                <span className="sr-only">{t.who === "you" ? "You: " : "Commander: "}</span>
                <span className="leading-relaxed">{t.text}</span>
              </li>
            ))}
          </ol>
          {questions.some((q) => q.choices?.length) ? (
            <div className="flex flex-wrap gap-2">
              {questions
                .flatMap((q) => q.choices ?? [])
                .map((c) => (
                  <Button
                    key={c}
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => send(c)}
                  >
                    {c}
                  </Button>
                ))}
            </div>
          ) : null}
          {state?.status === "planned" ? (
            <Button asChild>
              <Link href={`/console/${state.eventId}/approvals/${state.planId}`}>Review the plan</Link>
            </Button>
          ) : (
            <form
              className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3 depth-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(text);
              }}
            >
              <Field label="Your answer" hideLabel>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  placeholder='A hackathon called "CodeSprint" at MVGR College on 14 to 15 November for 300 students, budget 3 lakh.'
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(text);
                    }
                  }}
                />
              </Field>
              <div className="flex items-center justify-between gap-3">
                <p className="hidden font-mono text-xs text-fg-muted sm:block">
                  Enter to send, Shift and Enter for a new line
                </p>
                <Button type="submit" loading={busy} className="ms-auto">
                  Send
                </Button>
              </div>
            </form>
          )}
          {error ? (
            <Alert variant="danger" title="The Commander could not reply">
              {error}
            </Alert>
          ) : null}
        </section>
        <Card className="self-start lg:sticky lg:top-20">
          <CardHeader>
            <span aria-hidden className="kicker text-curtain-text">
              The brief
            </span>
            <CardTitle as="h2">What I have so far</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValueList
              items={LABELS.map(([k, label, show]) => ({
                key: k,
                label,
                value:
                  brief[k] !== undefined ? (
                    show(brief[k] as never)
                  ) : (
                    <span className="text-fg-muted">Not yet</span>
                  ),
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
