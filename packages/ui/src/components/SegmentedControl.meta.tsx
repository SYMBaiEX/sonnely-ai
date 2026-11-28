import { expect, userEvent, within } from "storybook/test";
import type { ComponentMeta } from "vibestack/stories";
import { SegmentedControlItem, type SegmentedControlProps } from "./SegmentedControl.tsx";

const children = (
  <>
    <SegmentedControlItem value="chart">Chart</SegmentedControlItem>
    <SegmentedControlItem value="table">Table</SegmentedControlItem>
  </>
);

export const meta: ComponentMeta<SegmentedControlProps> = {
  args: { "aria-label": "Usage view", defaultValue: "chart", children },
  play: {
    Default: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
      const canvas = within(canvasElement);
      const chart = canvas.getByRole("radio", { name: "Chart" });
      const table = canvas.getByRole("radio", { name: "Table" });
      await expect(chart.getAttribute("aria-checked")).toBe("true");
      await userEvent.click(table);
      await expect(table.getAttribute("aria-checked")).toBe("true");
      await userEvent.click(chart);
      await expect(chart.getAttribute("aria-checked")).toBe("true");
    },
  },
};
