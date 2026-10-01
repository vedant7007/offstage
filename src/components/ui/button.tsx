import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";
import { LoaderCircle } from "lucide-react";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-transparent font-medium whitespace-nowrap select-none",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-(--duration-slow) ease-out",
    "disabled:pointer-events-none disabled:opacity-55 aria-busy:cursor-progress",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        // Filled pill: lifts a little on hover and presses back down. No motion with reduced motion.
        // Disabled (not loading) drops to a neutral fill: a faded curtain reads as olive on ink.
        primary:
          "bg-curtain text-on-curtain hover:bg-curtain-hover hover:shadow-card motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 disabled:not-aria-busy:bg-surface-sunken disabled:not-aria-busy:text-fg-muted disabled:not-aria-busy:opacity-100",
        // Outline pill that fills with ink on hover.
        secondary:
          "border-[1.5px] border-fg bg-transparent text-fg hover:bg-fg hover:text-bg motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0",
        ghost: "bg-transparent text-fg hover:bg-surface-sunken active:bg-border",
        destructive:
          "border-[1.5px] border-danger bg-transparent text-danger-text hover:bg-danger-soft hover:text-danger-soft-fg motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0",
        link: "rounded-none bg-transparent px-0 text-curtain-text underline decoration-1 underline-offset-4 hover:decoration-2",
      },
      // Every size meets the 44px touch target on phones; sm tightens only from md up.
      size: {
        sm: "min-h-11 px-4 text-sm md:min-h-9",
        md: "min-h-11 px-5 text-base",
        lg: "min-h-12 px-7 text-lg",
      },
      block: { true: "w-full" },
    },
    // The link variant reads as text, so it drops the pill padding whatever the size.
    compoundVariants: [{ variant: "link", className: "px-0" }],
    defaultVariants: { variant: "primary", size: "md" },
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
      className={cn(buttonVariants({ variant, size, block }), className)}
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
