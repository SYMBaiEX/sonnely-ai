import { expect, userEvent, within } from "storybook/test";
import type { ComponentMeta } from "vibestack/stories";
import type { SelectProps } from "./Select.tsx";

export const meta: ComponentMeta<SelectProps> = {
  args: {
    "aria-label": "Provider",
    children: (
      <>
        <option value="phala">Phala</option>
        <option value="tinfoil">Tinfoil</option>
      </>
    ),
  },
  play: {
    Default: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
      const select = within(canvasElement).getByRole<HTMLSelectElement>("combobox", { name: "Provider" });
      await userEvent.selectOptions(select, "tinfoil");
      await expect(select.value).toBe("tinfoil");
    },
    Error: ({ canvasElement }: { canvasElement: HTMLElement }) => expect(within(canvasElement).getByRole("combobox", { name: "Provider" }).getAttribute("aria-invalid")).toBe("true"),
  },
};
