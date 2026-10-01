import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";
import { LoaderCircle } from "lucide-react";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-transparent font-medium whitespace-nowrap select-none",
    "disabled:pointer-events-none disabled:opacity-55 aria-busy:cursor-progress",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        // Filled pill with a lit top edge, a spring press, and a 2px lift on hover (or a magnetic pull).
        // Disabled (not loading) drops to a neutral fill: a faded curtain reads as olive on ink.
        primary:
          "press bg-curtain text-on-curtain shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_1px_2px_rgb(var(--shadow-ink)/0.12)] hover:bg-curtain-hover disabled:not-aria-busy:bg-surface-sunken disabled:not-aria-busy:text-fg-muted disabled:not-aria-busy:opacity-100 disabled:not-aria-busy:shadow-none",
        // Outline pill that fills with ink on hover.
        secondary: "press border-[1.5px] border-fg bg-transparent text-fg hover:bg-fg hover:text-bg",
        ghost:
          "bg-transparent text-fg transition-colors duration-(--duration-fast) ease-out hover:bg-surface-sunken active:bg-border",
        destructive:
          "press border-[1.5px] border-danger bg-transparent text-danger-text hover:bg-danger-soft hover:text-danger-soft-fg",
        link: "rounded-none bg-transparent px-0 text-curtain-text underline decoration-1 underline-offset-4 transition-[text-decoration-thickness] duration-(--duration-fast) hover:decoration-2",
      },
      // Magnetic pull toward the cursor (PointerFx). Replaces the hover lift. One per page.
      magnetic: { true: "", false: "" },
      // Every size meets the 44px touch target on phones; sm tightens only from md up.
      size: {
        sm: "min-h-11 px-4 text-sm md:min-h-9",
        md: "min-h-11 px-5 text-base",
        lg: "min-h-12 px-7 text-lg",
      },
      block: { true: "w-full" },
    },
    compoundVariants: [
      // The link variant reads as text, so it drops the pill padding whatever the size.
      { variant: "link", className: "px-0" },
      // Hover lift. translate, so it composes with the press scale. Off with reduced motion.
      {
        variant: ["primary", "secondary", "destructive"],
        magnetic: false,
        className: "motion-safe:hover:-translate-y-0.5",
      },
    ],
    defaultVariants: { variant: "primary", size: "md", magnetic: false },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shows a spinner, keeps the label, and blocks clicks. */
    loading?: boolean;
  };

function Button({
  className,
  variant,
  size,
  block,
  magnetic,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-magnetic={magnetic ? "" : undefined}
      className={cn(buttonVariants({ variant, size, block, magnetic }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
          {children}
        </>
      )}
    </Comp>
  );
}

type IconButtonProps = Omit<React.ComponentProps<"button">, "aria-label" | "children"> &
  Pick<VariantProps<typeof buttonVariants>, "variant"> & {
    /** Required: read by screen readers since there is no visible text. */
    label: string;
    icon: React.ReactNode;
    loading?: boolean;
  };

/** Round 44px button with only an icon. The label is mandatory. */
function IconButton({
  label,
  icon,
  variant = "ghost",
  loading,
  className,
  disabled,
  ...props
}: IconButtonProps) {
  return (
    <button
      data-slot="icon-button"
      aria-label={label}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        buttonVariants({ variant }),
        "size-11 min-h-11 p-0 motion-safe:hover:translate-y-0",
        className,
      )}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden className="animate-spin" /> : icon}
    </button>
  );
}

export { Button, IconButton, buttonVariants, type ButtonProps };
