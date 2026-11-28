import { expect, userEvent, within } from "storybook/test";
import type { ComponentMeta } from "vibestack/stories";
import { TabsContent, TabsList, type TabsProps, TabsTrigger } from "./Tabs.tsx";

const children = (
  <>
    <TabsList>
      <TabsTrigger value="requests">Requests</TabsTrigger>
      <TabsTrigger value="billing">Billing</TabsTrigger>
    </TabsList>
    <TabsContent value="requests">Request rows</TabsContent>
    <TabsContent value="billing">Billing rows</TabsContent>
  </>
);

export const meta: ComponentMeta<TabsProps> = {
  args: { defaultValue: "requests", children },
  play: {
    Default: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
      const canvas = within(canvasElement);
      canvas.getByRole("tab", { name: "Requests" }).focus();
      await userEvent.keyboard("{ArrowRight}");
      await expect(canvas.getByRole("tab", { name: "Billing" }).getAttribute("aria-selected")).toBe("true");
      await expect(canvas.getByRole("tabpanel").textContent).toBe("Billing rows");
      await userEvent.keyboard("{ArrowLeft}");
      await expect(canvas.getByRole("tab", { name: "Requests" }).getAttribute("aria-selected")).toBe("true");
    },
  },
};
