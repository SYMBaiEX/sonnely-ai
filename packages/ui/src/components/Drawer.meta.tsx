import { expect, screen, userEvent, waitFor } from "storybook/test";
import type { ComponentMeta } from "vibestack/stories";
import { Button } from "./Button.tsx";
import { DrawerClose, DrawerContent, type DrawerProps, DrawerTitle, DrawerTrigger } from "./Drawer.tsx";

const children = (
  <>
    <DrawerTrigger asChild>
      <Button>Open details</Button>
    </DrawerTrigger>
    <DrawerContent>
      <DrawerTitle>Request details</DrawerTitle>
      <DrawerClose asChild>
        <Button variant="outline">Done</Button>
      </DrawerClose>
    </DrawerContent>
  </>
);

export const meta: ComponentMeta<DrawerProps> = {
  args: { children },
  examples: { Open: { defaultOpen: true } },
  play: {
    Default: async () => {
      const trigger = screen.getByRole("button", { name: "Open details" });
      trigger.focus();
      await userEvent.keyboard("{Enter}");
      await expect((await screen.findByRole("dialog", { name: "Request details" })).contains(document.activeElement)).toBe(true);
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect([screen.queryByRole("dialog"), document.activeElement]).toEqual([null, trigger]));
    },
  },
};
