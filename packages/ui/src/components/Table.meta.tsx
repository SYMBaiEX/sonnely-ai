import { expect, within } from "storybook/test";
import type { ComponentMeta } from "vibestack/stories";
import { Badge } from "./Badge.tsx";
import { TableBody, TableCell, TableHead, TableHeader, type TableProps, TableRow } from "./Table.tsx";

const children = (
  <>
    <TableHeader>
      <TableRow>
        <TableHead>Request</TableHead>
        <TableHead>Status</TableHead>
        <TableHead>Tokens</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableHead scope="row">req_123</TableHead>
        <TableCell label="Status"><Badge variant="ok">Complete</Badge></TableCell>
        <TableCell label="Tokens">1,204</TableCell>
      </TableRow>
    </TableBody>
  </>
);

export const meta: ComponentMeta<TableProps> = {
  args: { "aria-label": "Request logs", responsive: true, children },
  play: {
    Default: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
      const canvas = within(canvasElement);
      await expect([canvas.getByRole("columnheader", { name: "Request" }).tagName, canvas.getByRole("rowheader", { name: "req_123" }).tagName, canvas.getAllByRole("cell").map((cell) => cell.textContent)]).toEqual(["TH", "TH", ["StatusComplete", "Tokens1,204"]]);
    },
  },
};
