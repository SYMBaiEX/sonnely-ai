import { expect, userEvent, within } from "storybook/test";
import type { ComponentMeta } from "vibestack/stories";
import type { SwitchProps } from "./Switch.tsx";

export const meta: ComponentMeta<SwitchProps> = {
  args: { "aria-label": "Email notifications" },
  play: {
    Default: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
      const control = within(canvasElement).getByRole("switch", { name: "Email notifications" });
      await userEvent.click(control);
      await expect(control.getAttribute("aria-checked")).toBe("true");
      control.focus();
      await userEvent.keyboard(" ");
      await expect(control.getAttribute("aria-checked")).toBe("false");
    },
  },
};
