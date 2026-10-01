import * as React from "react";
import { cn } from "@/lib/utils";

// Server-safe motion pieces: markup and CSS only. PointerFx (mounted in Providers) drives the pointer
// ones through data attributes, so none of these need "use client".

type MagneticProps = {
  children: React.ReactNode;
  /** Share of the cursor offset the child follows. Default 0.3. */
  strength?: number;
  /** Largest pull in px. Default 8. */
  max?: number;
  className?: string;
};

/**
 * Pulls its child a few px toward the cursor, with a 16px attraction zone around it, and springs back on
 * leave. Mouse only, off under reduced motion. One per page, on the primary action. For a Button, prefer
 * <Button magnetic>, which skips the wrapper.
 */
function Magnetic({ children, strength, max, className }: MagneticProps) {
  return (
    <span
      data-magnetic=""
      data-strength={strength}
      data-max={max}
      className={cn("-m-4 inline-block p-4", className)}
    >
      {children}
    </span>
  );
}

type TiltProps = React.ComponentProps<"div"> & {
  /** Largest lean in degrees. Default 6, the most a QR code can take and still scan. */
  max?: number;
};

/**
 * A card that leans toward the cursor with a soft glare (the attendee pass). On touch it plays one sheen
 * sweep instead. The glare is z-index 1: give anything that must stay crisp (a QR code) relative z-2.
 * Flat under reduced motion.
 */
function Tilt({ max, className, ...props }: TiltProps) {
  return <div data-tilt="" data-max={max} className={cn("rounded-card", className)} {...props} />;
}

/** Card with a cursor spotlight and a border that lights up near the cursor. Keyboard focus shows it too. */
function SpotlightCard({
  edge = true,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  /** Light the border near the cursor too. Default true. */
  edge?: boolean;
}) {
  return (
    <div
      data-slot="spotlight-card"
      className={cn(
        "spot lift rounded-card border border-border bg-surface p-5 text-fg depth-2 md:p-6",
        edge && "spot-edge",
        className,
      )}
      {...props}
    />
  );
}

/** Pulsing dot. Always pair it with a visible word such as "Live": colour and motion are never the only signal. */
function LivePulse({ className }: { className?: string }) {
  return <span aria-hidden className={cn("live-pulse text-approved", className)} />;
}

/**
 * Rays that burst once from the centre of the nearest positioned parent, for approve and successful
 * check-in only. Change its `key` to play it again. Hidden under reduced motion.
 */
function ConfirmBurst({ rays = 8, className }: { rays?: 4 | 8; className?: string }) {
  return (
    <span aria-hidden className={cn("burst", className)}>
      {Array.from({ length: rays }, (_, i) => (
        <span key={i} className="burst-ray" style={{ "--r": (360 / rays) * i } as React.CSSProperties} />
      ))}
    </span>
  );
}

/**
 * Ambient light behind a whole area: two soft spotlights, a faint grid and static grain. `stage` adds a
 * third light behind the focal area (Live Stage, a hero). Fixed by default; `contained` for a preview frame.
 */
function Backdrop({
  stage,
  contained,
  className,
}: {
  stage?: boolean;
  contained?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      data-stage={stage ? "" : undefined}
      className={cn("shell-backdrop", contained ? "absolute" : "fixed", className)}
    />
  );
}

/**
 * Keeps a piece of chrome perfectly still during route transitions: spread it on the sidebar, top bar,
 * site header, phone bottom bar or voice orb. Names must be unique among rendered elements, so never put
 * the same name on two visible elements at once.
 */
function vtAnchor(name: string): { style: React.CSSProperties } {
  return { style: { viewTransitionName: name, viewTransitionClass: "anchor" } as React.CSSProperties };
}

/** Mono, uppercase label above a heading, with a short rule after it. */
function Kicker({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "kicker inline-flex items-center gap-2 text-curtain-text after:h-px after:w-8 after:bg-current",
        className,
      )}
    >
      {children}
    </span>
  );
}

export { Magnetic, Tilt, SpotlightCard, LivePulse, ConfirmBurst, Backdrop, Kicker, vtAnchor };
export type { MagneticProps, TiltProps };
