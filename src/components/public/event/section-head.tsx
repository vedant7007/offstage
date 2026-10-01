import { Kicker } from "@/components/public/kicker";

/**
 * The head of an event page section: the cue kicker, then the heading. One rhythm for every section
 * (kicker, 12px, heading), so the page reads as one cue sheet.
 */
export function SectionHead({ cue, id, children }: { cue: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <Kicker>{cue}</Kicker>
      <h2 id={id} className="text-3xl text-balance md:text-4xl">
        {children}
      </h2>
    </div>
  );
}
