// spec/app/nav.md, "Story: Move around"
import { useState } from "react";
import { Activity, BookOpen, CreditCard, History, KeyRound, Link2, MessageSquare, SunMoon, type LucideIcon } from "lucide-react";
import { CommandPalette, type CommandPaletteCommand } from "@repo/ui";

const recentKey = "sonnely.palette.recent";
type Recent = { title: string; path: string };

function isRecent(item: unknown): item is Recent {
  if (typeof item !== "object" || item === null) return false;
  const candidate = item as Record<"title" | "path", unknown>;
  return typeof candidate.title === "string" && typeof candidate.path === "string";
}

function readRecents(): Recent[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(recentKey) ?? "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter(isRecent).slice(0, 5);
  } catch {
    return [];
  }
}

export function CommandMenu({
  open,
  onClose,
  pages,
  onToggleTheme,
  inviteUrl,
  returnFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  pages: readonly { title: string; path: string; Icon: LucideIcon }[];
  onToggleTheme?: () => void;
  inviteUrl?: string;
  returnFocusRef?: { readonly current: HTMLElement | null };
}) {
  const [recents, setRecents] = useState<Recent[]>(readRecents);
  const destinations = [...pages, { title: "Documentation", path: "/docs", Icon: BookOpen }];
  const titleFor = (path: string) => destinations.find((item) => item.path === path)?.title ?? path;

  function go(path: string) {
    try {
      const next = [{ title: titleFor(path), path }, ...recents.filter((item) => item.path !== path)].slice(0, 5);
      setRecents(next);
      localStorage.setItem(recentKey, JSON.stringify(next));
    } catch {
      return;
    } finally {
      onClose();
      window.location.assign(path);
    }
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
    } catch {
      return;
    }
  }

  const actionCommands = [
    ...[
      { title: "New conversation", path: "/console", Icon: MessageSquare },
      { title: "Create API key", path: "/console/keys", Icon: KeyRound },
      { title: "Buy credits", path: "/console/billing", Icon: CreditCard },
      { title: "View usage", path: "/console/usage", Icon: Activity },
      { title: "Documentation", path: "/docs", Icon: BookOpen },
    ].map((action) => ({ ...action, run: () => go(action.path) })),
    ...(onToggleTheme
      ? [
          {
            title: "Toggle theme",
            Icon: SunMoon,
            run: () => {
              onToggleTheme();
              onClose();
            },
          },
        ]
      : []),
    ...(inviteUrl ? [{ title: "Copy invite link", Icon: Link2, run: () => void copyInvite() }] : []),
  ];

  const commands: CommandPaletteCommand[] = [
    ...recents.map(({ title, path }) => ({
      id: `recent:${path}`,
      title,
      group: "Recent",
      icon: (() => {
        const RecentIcon = destinations.find((item) => item.path === path)?.Icon ?? History;
        return <RecentIcon size={17} aria-hidden />;
      })(),
      onSelect: () => go(path),
    })),
    ...destinations.map(({ title, path, Icon }) => ({
      id: `page:${path}`,
      title,
      group: "Pages",
      icon: <Icon size={17} aria-hidden />,
      onSelect: () => go(path),
    })),
    ...actionCommands.map(({ title, Icon, run }) => ({
      id: `action:${title}`,
      title,
      group: "Actions",
      icon: <Icon size={17} aria-hidden />,
      onSelect: run,
    })),
  ];

  return (
    <CommandPalette
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      commands={commands}
      label="Quick navigation"
      placeholder="Go to page…"
      emptyMessage="No matching pages or actions."
      returnFocusRef={returnFocusRef}
    />
  );
}
