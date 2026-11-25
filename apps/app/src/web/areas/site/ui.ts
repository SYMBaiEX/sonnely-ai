// spec/app/site/index.md, "Story: Check the service status"
import type { CSSProperties } from "react";

export const wrap = "mx-auto w-[min(1120px,calc(100%-32px))]";
export const caption = "text-[13px] text-muted-foreground";
export const textLink =
  "inline-flex items-center gap-1.5 font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-current";
export const button =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm px-4.5 py-2.5 text-sm font-medium transition-colors duration-base";
export const buttonAccent = button + " bg-primary text-primary-foreground hover:bg-primary/90";
export const buttonQuiet =
  button +
  " border border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground";
export const buttonSmall =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border border-border bg-secondary px-3 py-1.5 text-[13px] font-medium text-secondary-foreground transition-colors duration-base hover:bg-accent hover:text-accent-foreground aria-pressed:bg-accent aria-pressed:border-ring";
export const pill =
  "inline-flex items-center rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground";
export const panel = "rounded-lg border border-border bg-card p-6 shadow-sm";
export const sectionHead = "mb-6 flex flex-wrap items-end justify-between gap-6";
export const sectionIntro = "max-w-85 text-sm text-muted-foreground";
export const eyebrow = "mb-1.5 text-xs uppercase tracking-widest text-muted-foreground";
export const featureIcon = "grid size-10.5 shrink-0 place-items-center rounded-sm bg-secondary";
export const serif: CSSProperties = { fontFamily: "var(--font-serif)" };
export const searchBox =
  "flex items-center gap-2 rounded-sm border border-input bg-background px-3 text-muted-foreground";
export const selectClass =
  "h-9 rounded-sm border border-input bg-background px-2.5 text-[13.5px] text-foreground";
export const modelMark = "grid size-9.5 shrink-0 place-items-center rounded-sm text-base font-bold";
export const markColors: Record<string, string> = {
  pearl: "bg-accent text-primary",
  "signal-mark": "bg-primary text-primary-foreground",
  smoke: "bg-secondary text-secondary-foreground",
};
export const monoSm = "font-mono text-xs";
export const codeLine = "grid grid-cols-[28px_minmax(0,1fr)]";
export const h1Display = "text-[clamp(34px,5vw,56px)] leading-[1.05] font-normal";
export const h2Display = "text-[clamp(23px,3.5vw,32px)] font-normal leading-tight";
export const h3Display = "text-[22px] font-normal";
export const factsRow = "flex justify-between gap-4 text-[13.5px]";
export const factsLabel = "text-muted-foreground";
export const cardLink =
  "flex items-center gap-3.5 rounded-md border border-border bg-card p-4.5 hover:border-ring";
export const cardLinkArrow = "ms-auto text-muted-foreground";
export const readerGrid =
  "grid items-start gap-8 min-[800px]:grid-cols-[220px_minmax(0,1fr)]";
export const faqCard = "rounded-md border border-border bg-card px-5 py-4";
export const faqSummary =
  "flex cursor-pointer items-center justify-between gap-3 font-medium [&::-webkit-details-marker]:hidden";
export const faqBody = "mt-3 text-sm leading-relaxed text-muted-foreground";
export const readerBody =
  "grid gap-4 text-[15px] leading-relaxed text-muted-foreground [&_h2]:mt-4 [&_h2]:text-2xl [&_h2]:font-normal [&_h2]:text-foreground [&_h2]:first:mt-0 [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-3 [&_strong]:text-foreground [&_code]:font-mono [&_code]:text-[0.9em]";
