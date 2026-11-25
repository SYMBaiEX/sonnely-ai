// spec/app/nav.md, "Story: Move around"
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Check,
  CreditCard,
  History,
  KeyRound,
  Link2,
  MessageSquare,
  Search,
  SunMoon,
  X,
  type LucideIcon,
} from "lucide-react";

const recentKey = "sonnely.palette.recent";
type Recent = { title: string; path: string };
type CommandAction = { title: string; Icon: LucideIcon; done?: boolean; run: () => void };

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
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [recents, setRecents] = useState<Recent[]>([]);
  const destinations = [...pages, { title: "Documentation", path: "/docs", Icon: BookOpen }];
  const trimmed = query.trim().toLowerCase();
  const match = (title: string) => title.toLowerCase().includes(trimmed);
  const pageItems = pages.filter(({ title }) => match(title));
  const recentItems = trimmed ? [] : recents;
  const titleFor = (path: string) =>
    destinations.find((item) => item.path === path)?.title ?? path;

  function go(path: string) {
    try {
      const next = [
        { title: titleFor(path), path },
        ...recents.filter((item) => item.path !== path),
      ].slice(0, 5);
      setRecents(next);
      localStorage.setItem(recentKey, JSON.stringify(next));
    } catch {
      /* Navigation still works when browser storage is unavailable. */
    }
    onClose();
    window.location.assign(path);
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => {
        setCopied(false);
        onClose();
      }, 900);
    } catch {
      setCopied(false);
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
    ...(inviteUrl ? [{ title: "Copy invite link", Icon: Link2, done: copied, run: copyInvite }] : []),
  ];
  const actionItems = actions.filter(({ title }) => match(title));
  const choices = [
    ...recentItems.map((item) => () => go(item.path)),
    ...pageItems.map((item) => () => go(item.path)),
    ...actionItems.map((item) => item.run),
  ];

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  useEffect(() => {
    if (!open) return;
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(recentKey) ?? "[]");
      if (Array.isArray(saved))
        setRecents(
          (saved as Recent[])
            .filter(
              (item) => item && typeof item.title === "string" && typeof item.path === "string",
            )
            .slice(0, 5),
        );
    } catch {
      /* Recent pages are optional when browser storage is unavailable. */
    }
  }, [open]);

  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) {
      element.showModal();
      input.current?.focus();
    }
    if (!open && element?.open) element.close();
  }, [open]);

  const group = (
    label: string,
    items: { title: string; path?: string; Icon: LucideIcon; done?: boolean; run: () => void }[],
  ) => (
    <div className="command-group" role="group" aria-label={label} key={label}>
      <p className="command-heading">{label}</p>
      {items.map(({ title, path, Icon, done, run }) => (
        <button type="button" className="command-result" key={path ?? title} onClick={run}>
          {done ? <Check size={17} aria-hidden /> : <Icon size={17} aria-hidden />}
          <span>{done ? "Copied" : title}</span>
          <ArrowRight size={15} aria-hidden />
        </button>
      ))}
    </div>
  );

  return (
    <dialog
      ref={dialog}
      className="panel command-dialog"
      aria-label="Quick navigation"
      onClose={() => {
        setQuery("");
        setCopied(false);
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
          if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom)
            onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        const buttons = Array.from(results.current?.querySelectorAll("button") ?? []);
        if (buttons.length === 0) return;
        event.preventDefault();
        const index = buttons.findIndex((button) => button === document.activeElement);
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        if (next < 0 || next >= buttons.length) input.current?.focus();
        else buttons[next]?.focus();
      }}
    >
      <div className="command-search">
        <Search size={20} aria-hidden />
        <input
          ref={input}
          type="search"
          aria-label="Find a workspace page"
          placeholder="Go to page…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") choices[0]?.();
          }}
        />
        <button type="button" aria-label="Close" className="icon-button" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <div ref={results} className="command-results">
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
        {!!pageItems.length &&
          group(
            "Pages",
            pageItems.map(({ title, path, Icon }) => ({ title, path, Icon, run: () => go(path) })),
          )}
        {!!actionItems.length && group("Actions", actionItems)}
        {!choices.length && (
          <p className="command-empty caption" role="status">
            No matching pages or actions.
          </p>
        )}
      </div>
    </dialog>
  );
}
