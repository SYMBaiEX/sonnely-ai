import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Label } from "./Label.tsx";

export type FieldControlProps = {
  id: string;
  invalid?: boolean;
  "aria-describedby"?: string;
};

export type FieldProps = Omit<ComponentProps<"div">, "children"> & {
  /** The control's visible name. */
  label: string;
  /** Renders one `Input`, `Textarea`, `Select` or compatible control with the generated id and description wiring. */
  control: (props: FieldControlProps) => ReactNode;
  /** Why the current value is refused. */
  error?: string;
  /** A short hint shown before the error. */
  description?: string;
  /** A stable id when the control's value or errors are owned outside the field. */
  controlId?: string;
};

/** A labelled form control with its hint and error wired for assistive technology. */
export function Field({ label, control, error, description, controlId, className, ...props }: FieldProps) {
  const generatedId = useId();
  const id = controlId ?? generatedId;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-2", className)} {...props}>
      <Label htmlFor={id}>{label}</Label>
      {control({ id, invalid: Boolean(error), "aria-describedby": describedBy })}
      {description ? <p id={descriptionId} className="text-meta text-muted-foreground">{description}</p> : null}
      {error ? <p id={errorId} className="text-meta text-destructive">{error}</p> : null}
    </div>
  );
}
