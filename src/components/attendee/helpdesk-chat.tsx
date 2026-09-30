"use client";

import * as React from "react";
import { Info, LifeBuoy, Send } from "lucide-react";
import type { ChatResult, ChatStreamChunk, Citation } from "@/contracts";
import { AgentAvatar, Alert, Chip, CitationChip, IconButton, LanguageSwitcher } from "@/components/ui";
import { ApiClientError, createApiClient } from "@/lib/api-client";
import { useLocale, useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/** Passage text for citations whose contract has none yet (#66), keyed by citation ref. */
export type KnownPassages = Record<string, { docTitle: string; section: string; snippet: string }>;

type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; result?: ChatResult; failed?: boolean };

type Props = {
  suggestions: string[];
  passages: KnownPassages;
};

const routeMissing = (err: unknown) =>
  err instanceof ApiClientError && err.status === 404 && err.code !== "not_found";

let counter = 0;
const nextId = () => `m${++counter}`;

/**
 * Streaming helpdesk chat. Answers show their sources as citation chips; unsure answers say they
 * were passed to the team; blocked input gets a calm, non-accusing reply. Until the live route
 * exists (#65) it falls back to the contract's demo answers and says so.
 */
export function HelpdeskChat({ suggestions, passages }: Props) {
  const t = useT();
  const locale = useLocale();
  const live = React.useMemo(() => createApiClient(), []);
  const [demo, setDemo] = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const conversationId = React.useRef<string | undefined>(undefined);
  const endRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

  const patch = (id: string, change: Partial<Extract<Message, { role: "assistant" }>>) =>
    setMessages((all) => all.map((m) => (m.id === id && m.role === "assistant" ? { ...m, ...change } : m)));

  const stream = async (client: ReturnType<typeof createApiClient>, message: string, id: string) => {
    let text = "";
    const body = { message, conversationId: conversationId.current, language: locale };
    for await (const chunk of client.chat(body) as AsyncGenerator<ChatStreamChunk>) {
      if (chunk.type === "delta") {
        text += chunk.text;
        patch(id, { text });
      } else if (chunk.type === "done") {
        conversationId.current = chunk.result.conversationId;
        patch(id, { text: chunk.result.answer.answer, result: chunk.result });
      } else {
        patch(id, { failed: true });
      }
    }
  };

  const ask = async (question: string) => {
    const message = question.trim();
    if (!message || busy) return;
    const id = nextId();
    setMessages((all) => [
      ...all,
      { id: nextId(), role: "user", text: message },
      { id, role: "assistant", text: "" },
    ]);
    setInput("");
    setBusy(true);
    try {
      if (demo) {
        await stream(createApiClient({ mock: true }), message, id);
      } else {
        try {
          await stream(live, message, id);
        } catch (err) {
          if (!routeMissing(err)) throw err;
          setDemo(true);
          await stream(createApiClient({ mock: true }), message, id);
        }
      }
    } catch {
      patch(id, { failed: true });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const citationChip = (c: Citation) => {
    const known = passages[c.ref];
    return (
      <CitationChip
        key={c.ref}
        document={known?.docTitle ?? c.label}
        section={known?.section}
        snippet={known?.snippet}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="flex max-w-prose items-start gap-2 text-sm text-fg-muted">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("chat.honest")}
        </p>
        <LanguageSwitcher />
      </div>
      {demo ? <Alert variant="info" title={t("chat.demo")} /> : null}

      <div role="log" aria-live="polite" aria-label={t("chat.title")} className="flex flex-col gap-4">
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-card rounded-br-sm bg-curtain px-4 py-2.5 text-on-curtain">
                <span className="sr-only">{t("chat.you")}: </span>
                {m.text}
              </p>
            </div>
          ) : (
            <div key={m.id} className="flex items-start gap-2">
              <AgentAvatar agent="helpdesk" size="sm" className="mt-1" />
              <div
                className={cn(
                  "flex max-w-[85%] flex-col gap-2 rounded-card rounded-tl-sm border bg-surface px-4 py-3",
                  m.result?.escalationId ? "border-pending" : "border-border",
                )}
              >
                <span className="sr-only">{t("chat.assistant")}: </span>
                {m.failed ? (
                  <p className="text-danger-text">{t("chat.error")}</p>
                ) : m.text ? (
                  <p className="whitespace-pre-line">{m.text}</p>
                ) : (
                  <p className="text-fg-muted">{t("chat.thinking")}</p>
                )}
                {m.result?.blocked ? <p className="text-sm text-fg-muted">{t("chat.blockedHint")}</p> : null}
                {m.result?.escalationId ? (
                  <div className="flex items-start gap-2 rounded-control bg-pending-soft px-3 py-2 text-sm text-pending-soft-fg">
                    <LifeBuoy aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <p>
                      {t("chat.escalated")}{" "}
                      <span className="font-mono">
                        {t("chat.escalationRef", { ref: m.result.escalationId.slice(0, 8).toUpperCase() })}
                      </span>
                    </p>
                  </div>
                ) : null}
                {m.result && m.result.answer.citations.length ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                      {t("chat.sources")}
                    </p>
                    <div className="flex flex-wrap gap-2">{m.result.answer.citations.map(citationChip)}</div>
                  </div>
                ) : null}
                {m.result && !m.result.blocked ? (
                  <p className="text-xs text-fg-muted">{t("chat.answeredBy")}</p>
                ) : null}
              </div>
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      {suggestions.length && messages.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t("chat.suggestions")}</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((q) => (
              <Chip key={q} onClick={() => void ask(q)} disabled={busy}>
                {q}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="sticky bottom-20 flex items-end gap-2 rounded-card border border-border-strong bg-surface p-2 md:bottom-4"
      >
        <label htmlFor="chat-input" className="sr-only">
          {t("chat.label")}
        </label>
        <textarea
          id="chat-input"
          ref={inputRef}
          rows={1}
          maxLength={1000}
          value={input}
          placeholder={t("chat.placeholder")}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(input);
            }
          }}
          className="min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base text-fg placeholder:text-fg-muted focus-visible:outline-none"
        />
        <IconButton
          type="submit"
          variant="primary"
          label={t("chat.send")}
          icon={<Send aria-hidden />}
          loading={busy}
          disabled={!input.trim()}
        />
      </form>
    </div>
  );
}
