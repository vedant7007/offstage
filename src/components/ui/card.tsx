import * as React from "react";
import { cn } from "@/lib/utils";

type CardProps = React.ComponentProps<"div"> & {
  /** Interactive card: cursor spotlight, lit border near the cursor, 2px hover lift. */
  spotlight?: boolean;
  /** Key card (at most three per page): gradient hairline. Not with spotlight, both use ::before. */
  edge?: boolean;
};

/** Surface with a lit top edge and a soft long shadow (depth-2). */
function Card({ className, spotlight, edge, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-4 rounded-card border border-border bg-surface p-5 text-fg depth-2 md:p-6",
        spotlight && "spot spot-edge lift",
        edge && !spotlight && "edge",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1", className)} {...props} />;
}

function CardTitle({
  className,
  as: Heading = "h3",
  ...props
}: React.ComponentProps<"h3"> & { as?: "h2" | "h3" | "h4" }) {
  return (
    <Heading
      data-slot="card-title"
      className={cn("text-lg font-medium tracking-[-0.015em]", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p data-slot="card-description" className={cn("measure text-sm text-fg-muted", className)} {...props} />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("flex flex-col gap-3", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-4", className)}
      {...props}
    />
  );
}

export { Card, type CardProps, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
