import Link from "next/link";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { apiOrigin } from "@/lib/api-contract";

export function StartLink({
  href,
  title,
  description,
  icon,
  primary = false,
}: {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  primary?: boolean;
}) {
  return (
    <Link className="docs-start-card" data-primary={primary || undefined} href={href}>
      <span className="docs-start-icon">{icon}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <ArrowUpRight size={17} className="docs-card-arrow" aria-hidden="true" />
    </Link>
  );
}

export function GuideGroup({
  id,
  title,
  icon,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="docs-guide-group" aria-labelledby={id}>
      <h3 id={id}>
        {icon}
        {title}
      </h3>
      <ul role="list">{children}</ul>
    </section>
  );
}

export function GuideLink({ id, href, title }: { id?: string; href: string; title: string }) {
  const external = !href.startsWith("/docs");
  const Icon = external ? ArrowUpRight : ChevronRight;
  return (
    <li>
      <Link id={id} href={external ? apiOrigin + href : href}>
        <span>{title}</span>
        <Icon size={15} aria-hidden="true" />
      </Link>
    </li>
  );
}
