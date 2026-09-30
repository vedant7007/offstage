"use client";

import * as React from "react";
import { cn } from "cn";
import { Checkbox as CheckboxPrimitive, RadioGroup as RadioPrimitive, Switch as SwitchPrimitive } from "radix-ui";
import { Check } from "lucide-react";

// Checkbox, radio and switch share one row layout: control, label, optional description.
// The whole row is the click target, at least 44px tall.

type RowProps = {
  id: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  control: React.ReactNode;
  disabled?: boolean;
  reverse?: boolean;
};

function ChoiceRow({ id, label, description, control, disabled, reverse }: RowProps) {
  return (
    <div className={cn("flex min-h-11 items-start gap-3 py-2", reverse && "flex-row-reverse justify-between", disabled && "opacity-55")}>
      <div className="flex h-6 items-center">{control}</div>
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-base leading-6 text-fg">
          {label}
        </label>
        {description ? (
          <p id={`${id}-desc`} className="text-sm text-fg-muted">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const boxBase = cn(
  "peer shrink-0 border-2 border-border-strong bg-surface transition-colors duration-(--duration-fast) ease-out",
  "disabled:cursor-not-allowed aria-invalid:border-danger",
);

type CheckboxProps = React.ComponentProps<typeof CheckboxPrimitive.Root> & {
  label: React.ReactNode;
  description?: React.ReactNode;
};

function Checkbox({ label, description, id, className, ...props }: CheckboxProps) {
  const autoId = React.useId();
  const controlId = id ?? autoId;
  return (
    <ChoiceRow
      id={controlId}
      label={label}
      description={description}
      disabled={props.disabled}
      control={
        <CheckboxPrimitive.Root
          id={controlId}
          aria-describedby={description ? `${controlId}-desc` : undefined}
          className={cn(boxBase, "size-5 rounded-sm data-checked:border-curtain data-checked:bg-curtain", className)}
          {...props}
        >
          <CheckboxPrimitive.Indicator className="flex items-center justify-center text-on-curtain">
            <Check aria-hidden className="size-3.5" strokeWidth={3} />
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
      }
    />
  );
}

type RadioGroupProps = React.ComponentProps<typeof RadioPrimitive.Root> & {
  /** Visible group label, announced as the group name. */
  legend: React.ReactNode;
};

function RadioGroup({ legend, className, children, ...props }: RadioGroupProps) {
  const legendId = React.useId();
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <p id={legendId} className="text-sm font-medium text-fg">
        {legend}
      </p>
      <RadioPrimitive.Root aria-labelledby={legendId} className="flex flex-col" {...props}>
        {children}
      </RadioPrimitive.Root>
    </div>
  );
}

type RadioItemProps = React.ComponentProps<typeof RadioPrimitive.Item> & {
  label: React.ReactNode;
  description?: React.ReactNode;
};

function RadioGroupItem({ label, description, id, className, ...props }: RadioItemProps) {
  const autoId = React.useId();
  const controlId = id ?? autoId;
  return (
    <ChoiceRow
      id={controlId}
      label={label}
      description={description}
      disabled={props.disabled}
      control={
        <RadioPrimitive.Item
          id={controlId}
          aria-describedby={description ? `${controlId}-desc` : undefined}
          className={cn(boxBase, "size-5 rounded-full data-checked:border-curtain", className)}
          {...props}
        >
          <RadioPrimitive.Indicator className="flex items-center justify-center">
            <span className="size-2.5 rounded-full bg-curtain" />
          </RadioPrimitive.Indicator>
        </RadioPrimitive.Item>
      }
    />
  );
}

type SwitchProps = React.ComponentProps<typeof SwitchPrimitive.Root> & {
  label: React.ReactNode;
  description?: React.ReactNode;
};

function Switch({ label, description, id, className, ...props }: SwitchProps) {
  const autoId = React.useId();
  const controlId = id ?? autoId;
  return (
    <ChoiceRow
      id={controlId}
      label={label}
      description={description}
      disabled={props.disabled}
      reverse
      control={
        <SwitchPrimitive.Root
          id={controlId}
          aria-describedby={description ? `${controlId}-desc` : undefined}
          className={cn(
            "inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-border-strong bg-surface-sunken",
            "transition-colors duration-(--duration-fast) ease-out disabled:cursor-not-allowed",
            "data-checked:border-curtain data-checked:bg-curtain",
            className,
          )}
          {...props}
        >
          <SwitchPrimitive.Thumb
            className={cn(
              "block size-4 translate-x-0.5 rounded-full bg-fg-muted transition-transform duration-(--duration-fast) ease-out",
              "data-checked:translate-x-5.5 data-checked:bg-on-curtain",
            )}
          />
        </SwitchPrimitive.Root>
      }
    />
  );
}

export { Checkbox, RadioGroup, RadioGroupItem, Switch };
