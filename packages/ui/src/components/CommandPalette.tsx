import type { ReactNode } from "react";
import { Command } from "cmdk";
import { arrowRightIcon, searchIcon } from "../lib/icons.tsx";
import { Dialog, DialogContent, DialogTitle } from "./Dialog.tsx";

export type CommandPaletteCommand = {
  /** A unique stable id for the command. */
  id: string;
  /** The command's visible and searchable name. */
  title: string;
  /** The section it appears under, such as Pages or Actions. */
  group?: string;
  /** Extra searchable words that need not appear visibly. */
  keywords?: string[];
  /** A small decorative icon. */
  icon?: ReactNode;
  /** A shortcut hint shown at the row's end. */
  shortcut?: string;
  /** Prevents selection. */
  disabled?: boolean;
  /** Keeps the palette open after selection, for commands such as copying a link. */
  keepOpen?: boolean;
  /** Runs when the command is chosen. */
  onSelect: () => void;
};

export type CommandPaletteProps = {
  /** Whether the palette is open. */
  open: boolean;
  /** Receives the next open state when Escape, the close button or selection dismisses it. */
  onOpenChange: (open: boolean) => void;
  /** The commands in display order. */
  commands: readonly CommandPaletteCommand[];
  /** The dialog and search field's accessible name. */
  label?: string;
  /** The search field placeholder. */
  placeholder?: string;
  /** What a search with no matching command says. */
  emptyMessage?: string;
};

/** A keyboard-first command menu with dialog, search and listbox behavior owned by the primitive. */
export function CommandPalette({ open, onOpenChange, commands, label = "Command palette", placeholder = "Find a page or action…", emptyMessage = "No matching pages or actions." }: CommandPaletteProps) {
  const groups = new Map<string, CommandPaletteCommand[]>();
  for (const command of commands) {
    const group = command.group ?? "";
    groups.set(group, [...(groups.get(group) ?? []), command]);
  }
  const choose = (command: CommandPaletteCommand) => {
    command.onSelect();
    if (!command.keepOpen) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0" closeLabel="Close command palette">
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <Command label={label}>
          <div className="flex items-center gap-2 border-b border-border px-3">
            {searchIcon({ className: "size-5 text-muted-foreground" })}
            <Command.Input className="h-11 w-full bg-transparent text-ui text-foreground outline-none placeholder:text-muted-foreground" placeholder={placeholder} />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty>
              <div role="option" aria-disabled="true" className="px-3 py-6 text-center text-ui text-muted-foreground">{emptyMessage}</div>
            </Command.Empty>
            {[...groups.entries()].map(([group, items]) => (
              <Command.Group key={group || "ungrouped"} heading={group ? <span className="block px-3 pt-2 pb-1 text-micro font-medium tracking-micro text-muted-foreground uppercase">{group}</span> : undefined}>
                {items.map((command) => (
                  <Command.Item
                    key={command.id}
                    value={command.id}
                    keywords={[command.title, ...(command.keywords ?? [])]}
                    disabled={command.disabled}
                    onSelect={() => choose(command)}
                    className="flex cursor-default items-center gap-2 rounded-sm px-3 py-2 text-ui text-popover-foreground outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                  >
                    {command.icon}
                    <span className="flex-1">{command.title}</span>
                    {command.shortcut ? <kbd className="text-micro text-muted-foreground">{command.shortcut}</kbd> : null}
                    {arrowRightIcon({ className: "size-3.5 text-muted-foreground" })}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
