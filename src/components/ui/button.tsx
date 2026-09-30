import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";
import { LoaderCircle } from "lucide-react";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-control border font-medium whitespace-nowrap select-none",
    "transition-colors duration-(--duration-fast) ease-out",
    "disabled:pointer-events-none disabled:opacity-55 aria-busy:cursor-progress",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary: "border-curtain bg-curtain text-on-curtain hover:border-curtain-hover hover:bg-curtain-hover",
        secondary: "border-border-strong bg-surface text-fg hover:bg-surface-sunken",
        ghost: "border-transparent bg-transparent text-fg hover:bg-surface-sunken",
        destructive: "border-danger bg-surface text-danger-text hover:bg-danger-soft",
        link: "border-transparent bg-transparent px-0 text-curtain-text underline underline-offset-4 hover:no-underline",
      },
      // Every size meets the 44px touch target on phones; sm tightens only from md up.
      size: {
        sm: "min-h-11 px-3 text-sm md:min-h-9",
        md: "min-h-11 px-4 text-base",
        lg: "min-h-12 px-6 text-lg",
      },
      block: { true: "w-full" },
    },
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

/** Square 44px button with only an icon. The label is mandatory. */
function IconButton({ label, icon, variant = "ghost", loading, className, disabled, ...props }: IconButtonProps) {
  return (
    <button
      data-slot="icon-button"
      aria-label={label}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant }), "size-11 min-h-11 p-0", className)}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden className="animate-spin" /> : icon}
    </button>
  );
}

export { Button, IconButton, buttonVariants, type ButtonProps };
