import { expect, userEvent, within } from "storybook/test";
import type { ComponentMeta } from "vibestack/stories";
import type { FieldProps } from "./Field.tsx";
import { Input } from "./Input.tsx";

export const meta: ComponentMeta<FieldProps> = {
  args: { label: "Email", control: (props) => <Input {...props} />, description: "Used for receipts" },
  examples: { Error: { error: "Enter an email address" } },
  play: {
    Default: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
      const canvas = within(canvasElement);
      const input = canvas.getByRole<HTMLInputElement>("textbox", { name: "Email" });
      await userEvent.click(canvas.getByText("Email"));
      await userEvent.keyboard("sol@example.com");
      await expect(input.value).toBe("sol@example.com");
      await expect(input.getAttribute("aria-describedby")).toContain("-description");
    },
    Error: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
      const input = within(canvasElement).getByRole("textbox", { name: "Email" });
      await expect([input.getAttribute("aria-invalid"), input.getAttribute("aria-describedby")?.includes("-error")]).toEqual(["true", true]);
    },
  },
};
