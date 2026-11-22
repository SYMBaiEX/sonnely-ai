import Link from "next/link";
import type { ReactNode } from "react";

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
  return (
    <li>
      <Link id={id} href={href}>
        {title}
      </Link>
    </li>
  );
}
