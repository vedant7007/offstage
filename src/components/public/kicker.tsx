import { cn } from "@/lib/utils";

/**
 * Mono cue label that sits above a section heading, with a short hairline after it, like a
 * stage cue sheet. Decorative numbering only, so screen readers skip it.
 */
export function Kicker({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p aria-hidden className={cn("kicker flex items-center gap-3 text-curtain-text", className)}>
      <span>{children}</span>
      <span className="h-px w-10 bg-current" />
    </p>
  );
}
