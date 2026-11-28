import { expect, fn, screen, userEvent, waitFor } from "storybook/test";
import type { ComponentMeta } from "vibestack/stories";
import { Button } from "./Button.tsx";
import { DropdownMenuContent, DropdownMenuItem, type DropdownMenuProps, DropdownMenuTrigger } from "./DropdownMenu.tsx";

const selected = fn();
const children = (
  <>
    <DropdownMenuTrigger asChild>
      <Button variant="outline">Workspace</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem onSelect={selected}>Open settings</DropdownMenuItem>
      <DropdownMenuItem destructive>Remove workspace</DropdownMenuItem>
    </DropdownMenuContent>
  </>
);

export const meta: ComponentMeta<DropdownMenuProps> = {
  args: { children },
  play: {
    Default: async () => {
      selected.mockClear();
      const trigger = screen.getByRole("button", { name: "Workspace" });
      trigger.focus();
      await userEvent.keyboard("{Enter}");
      await screen.findByRole("menu");
      await userEvent.keyboard("{Enter}");
      await expect(selected).toHaveBeenCalled();
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect([screen.queryByRole("menu"), document.activeElement]).toEqual([null, trigger]));
    },
  },
};
