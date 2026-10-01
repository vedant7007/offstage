import type { Metadata } from "next";
import { fixtures } from "@/contracts/fixtures";
import { PageHeader } from "@/components/ui";
import { HelpdeskChat, type KnownPassages } from "@/components/attendee/helpdesk-chat";
import { getMe } from "@/components/attendee/server";
import { getPublicEvent } from "@/components/public/data";
import { getT } from "@/lib/i18n/server";
import kb from "@/showcase/fixtures/kb.json";
import { isShowcase } from "@/showcase/flag";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("chat.title"), robots: { index: false } };
}

// Passages for demo citations until citations carry their own text (#66). Server side only,
// so the fixtures never reach the browser bundle.
function demoPassages(): KnownPassages {
  if (isShowcase()) {
    // The showcase helpdesk cites the recorded knowledge base by these refs (src/showcase/helpdesk.ts).
    const title = new Map(kb.docs.map((d) => [d.id, d.title]));
    return Object.fromEntries(
      kb.chunks.map((c) => [
        `kb:${c.docId}#${c.heading}`,
        { docTitle: title.get(c.docId) ?? c.docId, section: c.heading, snippet: c.text },
      ]),
    );
  }
  const chunk = fixtures.kbChunkRef();
  const ref = fixtures.api.chatAnswered().answer.citations[0]?.ref;
  return ref ? { [ref]: { docTitle: chunk.docTitle, section: chunk.section, snippet: chunk.snippet } } : {};
}

export default async function ChatPage() {
  const [t, me] = await Promise.all([getT(), getMe()]);
  const slug =
    me?.memberships.find((m) => m.eventId === me.activeEventId)?.eventSlug ?? me?.memberships[0]?.eventSlug;
  const event = slug ? await getPublicEvent(slug) : null;
  const suggestions = (event?.data.faq ?? []).slice(0, 4).map((f) => f.question);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-2">
      <PageHeader title={t("chat.title")} className="pb-0" />
      <HelpdeskChat suggestions={suggestions} passages={demoPassages()} />
    </div>
  );
}
