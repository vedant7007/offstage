import { cn } from "@/lib/utils";

/**
 * Original illustration: a rail holding strings, like a sutradhar holding the puppets' strings,
 * framed by two curtain drapes. The Commander hangs in the centre in curtain crimson; the other
 * agents are teal. Decorative only, so it is hidden from screen readers.
 */
export function HeroArt({ className }: { className?: string }) {
  const strings = [
    { x: 118, y: 150, lead: false },
    { x: 158, y: 196, lead: false },
    { x: 200, y: 128, lead: true },
    { x: 242, y: 188, lead: false },
    { x: 282, y: 158, lead: false },
  ];
  return (
    <svg viewBox="0 0 400 300" aria-hidden focusable="false" className={cn("h-auto w-full", className)}>
      {/* stage floor */}
      <rect x="40" y="262" width="320" height="6" rx="3" className="fill-border-strong" />

      {/* rail */}
      <rect x="70" y="28" width="260" height="8" rx="4" className="fill-fg" />

      {/* strings and agents */}
      {strings.map((s) => (
        <g key={s.x}>
          <line x1={s.x} y1="36" x2={s.x} y2={s.y - 14} strokeWidth="1.5" className="stroke-fg-muted" />
          <circle cx={s.x} cy={s.y} r={s.lead ? 16 : 12} className={s.lead ? "fill-curtain" : "fill-agent"} />
          <circle cx={s.x} cy={s.y} r={s.lead ? 6 : 4} className="fill-bg" />
        </g>
      ))}
      {/* the team is connected: a soft line joins the agents to the Commander */}
      <path
        d="M118 150 Q158 176 200 128 Q242 170 282 158 M158 196 Q180 160 200 128 Q222 160 242 188"
        fill="none"
        strokeWidth="1"
        strokeDasharray="3 4"
        className="stroke-agent"
      />

      {/* left drape */}
      <path d="M8 12 H92 C84 90 66 170 74 268 H8 Z" className="fill-curtain" />
      <path
        d="M30 14 C28 100 22 180 26 266 M54 14 C50 96 44 176 50 266"
        fill="none"
        strokeWidth="3"
        className="stroke-curtain-hover"
      />
      {/* right drape */}
      <path d="M392 12 H308 C316 90 334 170 326 268 H392 Z" className="fill-curtain" />
      <path
        d="M370 14 C372 100 378 180 374 266 M346 14 C350 96 356 176 350 266"
        fill="none"
        strokeWidth="3"
        className="stroke-curtain-hover"
      />
      {/* valance */}
      <path d="M0 0 H400 V16 Q300 26 200 16 Q100 26 0 16 Z" className="fill-curtain-hover" />
    </svg>
  );
}
