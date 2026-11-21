"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Search, X, type LucideIcon } from "lucide-react";

export function CommandMenu({
  open,
  onClose,
  pages,
}: {
  open: boolean;
  onClose: () => void;
  pages: readonly { title: string; path: string; Icon: LucideIcon }[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const choices = [...pages, { title: "Documentation", path: "/docs", Icon: BookOpen }].filter(({ title }) =>
    title.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) {
      element.showModal();
      input.current?.focus();
    }
    if (!open && element?.open) element.close();
  }, [open]);

  function go(path: string) {
    onClose();
    router.push(path);
  }

  return (
    <dialog
      ref={dialog}
      className="panel command-dialog"
      aria-label="Quick navigation"
      onClose={() => {
        setQuery("");
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
            if (event.key === "Enter" && choices[0]) go(choices[0].path);
          }}
        />
        <button type="button" aria-label="Close" className="icon-button" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <div ref={results} className="command-results">
        {choices.map(({ title, path, Icon }) => (
          <button type="button" className="command-result" key={path} onClick={() => go(path)}>
            <Icon size={17} aria-hidden />
            <span>{title}</span>
            <ArrowRight size={15} aria-hidden />
          </button>
        ))}
        {!choices.length && (
          <p className="command-empty caption" role="status">
            No matching pages.
          </p>
        )}
      </div>
    </dialog>
  );
}
