// spec/app/nav.md, "Story: Move around"
import { useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  CreditCard,
  History,
  KeyRound,
  Link2,
  MessageSquare,
  Search,
  SunMoon,
  type LucideIcon,
} from "lucide-react";
import { Button, Dialog, DialogContent, DialogTitle, Input } from "@repo/ui";

const recentKey = "sonnely.palette.recent";
type Recent = { title: string; path: string };
type CommandAction = { title: string; Icon: LucideIcon; run: () => void };

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
}: {
  open: boolean;
  onClose: () => void;
  pages: readonly { title: string; path: string; Icon: LucideIcon }[];
  onToggleTheme?: () => void;
  inviteUrl?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<Recent[]>(readRecents);
  const destinations = [...pages, { title: "Documentation", path: "/docs", Icon: BookOpen }];
  const trimmed = query.trim().toLowerCase();
  const match = (title: string) => title.toLowerCase().includes(trimmed);
  const pageItems = pages.filter(({ title }) => match(title));
  const recentItems = trimmed ? [] : recents;
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
      onClose();
    } catch {
      return;
    }
  }

  const actions: CommandAction[] = [
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
    ...(inviteUrl ? [{ title: "Copy invite link", Icon: Link2, run: copyInvite }] : []),
  ];
  const actionItems = actions.filter(({ title }) => match(title));
  const choices = [...recentItems.map((item) => () => go(item.path)), ...pageItems.map((item) => () => go(item.path)), ...actionItems.map((item) => item.run)];

  const group = (label: string, items: { title: string; path?: string; Icon: LucideIcon; run: () => void }[]) => (
    <div className="border-t border-border pt-2 first:border-t-0 first:pt-0" role="group" aria-label={label} key={label}>
      <p className="px-3 pt-1 pb-1.5 text-micro font-medium tracking-micro text-muted-foreground uppercase">{label}</p>
      {items.map(({ title, path, Icon, run }) => (
        <Button type="button" variant="ghost" key={path ?? title} onClick={run} className="h-11 w-full justify-start rounded-md px-3">
          <Icon size={17} aria-hidden />
          <span className="flex-1 text-left">{title}</span>
          <ArrowRight size={15} aria-hidden className="text-muted-foreground" />
        </Button>
      ))}
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setQuery("");
          onClose();
        }
      }}
    >
      <DialogContent
        className="max-w-lg gap-0 overflow-hidden p-2"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          const buttons = Array.from(resultsRef.current?.querySelectorAll("button") ?? []);
          if (buttons.length === 0) return;
          event.preventDefault();
          const index = buttons.findIndex((button) => button === document.activeElement);
          const next = event.key === "ArrowDown" ? index + 1 : index - 1;
          if (next < 0 || next >= buttons.length) inputRef.current?.focus();
          else buttons[next]?.focus();
        }}
      >
        <DialogTitle className="sr-only">Quick navigation</DialogTitle>
        <div className="flex items-center gap-3 border-b border-border px-3 pb-2 text-muted-foreground">
          <Search size={20} aria-hidden />
          <Input
            ref={inputRef}
            type="search"
            aria-label="Find a workspace page"
            placeholder="Go to page…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") choices[0]?.();
            }}
            className="border-0 bg-transparent px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0"
          />
        </div>
        <div ref={resultsRef} className="max-h-96 overflow-y-auto pt-2">
          {!!recentItems.length &&
            group(
              "Recent",
              recentItems.map(({ title, path }) => ({
                title,
                path,
                Icon: destinations.find((item) => item.path === path)?.Icon ?? History,
                run: () => go(path),
              })),
            )}
          {!!pageItems.length && group("Pages", pageItems.map(({ title, path, Icon }) => ({ title, path, Icon, run: () => go(path) })))}
          {!!actionItems.length && group("Actions", actionItems)}
          {!choices.length && (
            <p className="px-3 py-4 text-meta text-muted-foreground" role="status">
              No matching pages or actions.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
