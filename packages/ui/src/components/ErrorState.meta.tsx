import type { ComponentMeta } from "vibestack/stories";
import { Button } from "./Button.tsx";
import type { ErrorStateProps } from "./ErrorState.tsx";

export const meta: ComponentMeta<ErrorStateProps> = {
  args: { title: "Requests unavailable", message: "Try loading them again.", children: <Button variant="outline">Retry</Button> },
};
