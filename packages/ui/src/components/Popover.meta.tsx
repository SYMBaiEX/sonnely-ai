import { expect, screen, userEvent, waitFor } from "storybook/test";
import type { ComponentMeta } from "vibestack/stories";
import { Button } from "./Button.tsx";
import { PopoverClose, PopoverContent, type PopoverProps, PopoverTrigger } from "./Popover.tsx";

const children = (
  <>
    <PopoverTrigger asChild>
      <Button variant="outline">Usage</Button>
    </PopoverTrigger>
    <PopoverContent>
      <p>Cached input reduces spend.</p>
      <PopoverClose asChild>
        <Button variant="ghost" size="sm">Close</Button>
      </PopoverClose>
    </PopoverContent>
  </>
);

export const meta: ComponentMeta<PopoverProps> = {
  args: { children },
  play: {
    Default: async () => {
      const trigger = screen.getByRole("button", { name: "Usage" });
      trigger.focus();
      await userEvent.keyboard("{Enter}");
      await screen.findByText("Cached input reduces spend.");
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect([screen.queryByText("Cached input reduces spend."), document.activeElement]).toEqual([null, trigger]));
    },
  },
};
