import * as React from "react";
import { cn } from "@/lib/utils";

// Server-safe display primitives: no hooks, no strings of their own.

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

/** What a list shows when it has nothing yet: say why, and what happens next. */
function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-3 rounded-card border border-dashed border-border-strong px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <div
          aria-hidden
          className="flex size-12 items-center justify-center rounded-full bg-surface-sunken text-fg-muted [&_svg]:size-6"
        >
          {icon}
        </div>
      ) : null}
      <p className="text-lg font-semibold">{title}</p>
      {description ? <p className="max-w-sm text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

type TimelineItem = {
  id: string;
  title: React.ReactNode;
  /** Usually a <TimeRange> or formatted time. */
  time?: React.ReactNode;
  description?: React.ReactNode;
  /** Marker content: an icon or AgentAvatar. Defaults to a dot. */
  marker?: React.ReactNode;
};

/** Ordered list of things that happened, newest wherever the caller puts it. */
function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol data-slot="timeline" className={cn("flex flex-col", className)}>
      {items.map((item, i) => (
        <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
          {i < items.length - 1 ? (
            <span
              aria-hidden
              className="absolute top-8 bottom-0 left-4 w-px -translate-x-1/2 bg-border-strong"
            />
          ) : null}
          <div className="flex size-8 shrink-0 items-center justify-center">
            {item.marker ?? (
              <span aria-hidden className="size-2.5 rounded-full border-2 border-fg-muted bg-surface" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="font-medium">{item.title}</p>
              {item.time ? <p className="text-sm text-fg-muted">{item.time}</p> : null}
            </div>
            {item.description ? <div className="text-sm text-fg-muted">{item.description}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Label and value pairs. Stacks on phones, two columns from sm. */
function KeyValueList({
  items,
  className,
}: {
  items: { label: React.ReactNode; value: React.ReactNode; key?: string }[];
  className?: string;
}) {
  return (
    <dl
      data-slot="key-value"
      className={cn("grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[minmax(8rem,auto)_1fr]", className)}
    >
      {items.map((item, i) => (
        <div key={item.key ?? i} className="contents">
          <dt className="text-sm text-fg-muted sm:pt-0.5">{item.label}</dt>
          <dd className="-mt-2.5 min-w-0 font-medium sm:mt-0">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

type PageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Small line above the title, such as the event name. */
  eyebrow?: React.ReactNode;
  /** A back link or breadcrumb, rendered above everything. */
  back?: React.ReactNode;
  actions?: React.ReactNode;
  /** Use the display face. Public pages only. */
  display?: boolean;
  className?: string;
};

/** The page's one h1, with optional actions that wrap below on phones. */
function PageHeader({ title, description, eyebrow, back, actions, display, className }: PageHeaderProps) {
  return (
    <header data-slot="page-header" className={cn("flex flex-col gap-3 pb-6", className)}>
      {back}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow ? <p className="text-sm font-medium text-curtain-text">{eyebrow}</p> : null}
          <h1
            className={cn(
              "text-2xl font-semibold md:text-3xl",
              display && "font-display font-bold tracking-tight",
            )}
          >
            {title}
          </h1>
          {description ? <p className="text-base text-fg-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

type SectionProps = Omit<React.ComponentProps<"section">, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Heading id; also used to label the section. Required so landmarks stay unique. */
  id: string;
  headingLevel?: "h2" | "h3";
};

/** A titled region of a page, labelled by its heading. */
function Section({
  title,
  description,
  actions,
  id,
  headingLevel: Heading = "h2",
  className,
  children,
  ...props
}: SectionProps) {
  const headingId = `${id}-title`;
  return (
    <section aria-labelledby={headingId} className={cn("flex flex-col gap-4", className)} {...props}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Heading id={headingId} className={cn("font-semibold", Heading === "h2" ? "text-xl" : "text-lg")}>
            {title}
          </Heading>
          {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export { EmptyState, Timeline, KeyValueList, PageHeader, Section, type TimelineItem };
