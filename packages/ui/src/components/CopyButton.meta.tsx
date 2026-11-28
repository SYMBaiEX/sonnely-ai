import { expect, userEvent, waitFor, within } from "storybook/test";
import type { ComponentMeta } from "vibestack/stories";
import type { CopyButtonProps } from "./CopyButton.tsx";

export const meta: ComponentMeta<CopyButtonProps> = {
  args: { value: "sonnely-key", label: "Copy key" },
  examples: { "Icon only": { text: undefined } },
  play: {
    Default: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
      const button = within(canvasElement).getByRole("button", { name: "Copy key" });
      await userEvent.click(button);
      await waitFor(() => expect(["Copied", "Copy failed"]).toContain(button.getAttribute("aria-label")));
    },
  },
};
