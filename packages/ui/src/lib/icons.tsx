import type { ComponentProps } from "react";
import { cn } from "./cn.ts";

type IconProps = Omit<ComponentProps<"svg">, "children">;

export function checkIcon({ className, ...props }: IconProps = {}) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("size-4", className)} {...props}>
      <path d="m3 8.5 3.5 3.5 6.5-8" />
    </svg>
  );
}

export function chevronDownIcon({ className, ...props }: IconProps = {}) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("size-4", className)} {...props}>
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

export function copyIcon({ className, ...props }: IconProps = {}) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={cn("size-4", className)} {...props}>
      <rect x="5" y="5" width="8" height="8" rx="1.5" />
      <path d="M11 5V4.5A1.5 1.5 0 0 0 9.5 3h-5A1.5 1.5 0 0 0 3 4.5v5A1.5 1.5 0 0 0 4.5 11H5" />
    </svg>
  );
}

export function searchIcon({ className, ...props }: IconProps = {}) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={cn("size-4", className)} {...props}>
      <circle cx="7" cy="7" r="4" />
      <path d="m10.5 10.5 2.5 2.5" />
    </svg>
  );
}

export function alertIcon({ className, ...props }: IconProps = {}) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={cn("size-4", className)} {...props}>
      <path d="M8 2 1.8 13.2h12.4L8 2Z" />
      <path d="M8 6v3.5" />
      <path d="M8 12h.01" />
    </svg>
  );
}

export function arrowRightIcon({ className, ...props }: IconProps = {}) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={cn("size-4", className)} {...props}>
      <path d="M2.5 8h11" />
      <path d="m9.5 4 4 4-4 4" />
    </svg>
  );
}

export function xIcon({ className, ...props }: IconProps = {}) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={cn("size-4", className)} {...props}>
      <path d="m3 3 10 10M13 3 3 13" />
    </svg>
  );
}
