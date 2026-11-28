import { expect, fn, screen, userEvent, waitFor } from "storybook/test";
import type { ComponentMeta } from "vibestack/stories";
import type { CommandPaletteProps } from "./CommandPalette.tsx";

const chosen = fn();
const openChange = fn();
const commands = [
  { id: "usage", title: "View usage", group: "Pages", keywords: ["spend", "tokens"], onSelect: chosen },
  { id: "usage-admin", title: "View usage", group: "Admin", onSelect: fn() },
  { id: "key", title: "Create API key", group: "Actions", onSelect: fn() },
];

export const meta: ComponentMeta<CommandPaletteProps> = {
  args: { open: true, onOpenChange: openChange, commands },
  play: {
    Default: async () => {
      chosen.mockClear();
      openChange.mockClear();
      await waitFor(() => expect(screen.getAllByRole("option", { name: /View usage/ })).toHaveLength(2));
      const input = await screen.findByRole("combobox", { name: "Command palette" });
      await userEvent.type(input, "tokens");
      await waitFor(() => expect(screen.queryByRole("option", { name: /Create API key/ })).toBeNull());
      await userEvent.keyboard("{Enter}");
      await expect(chosen).toHaveBeenCalled();
      await expect(openChange).toHaveBeenCalledWith(false);
    },
  },
};
