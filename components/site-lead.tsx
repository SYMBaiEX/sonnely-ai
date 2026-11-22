import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Scene } from "./scene";

export type SiteBrief = {
  title: string;
  rows: readonly (readonly [label: string, value: string])[];
};

export function ReaderNavigation({
  sections,
}: {
  sections: readonly (readonly [id: string, label: string])[];
}) {
  return (
    <nav className="reader-toc" aria-label="On this page">
      <strong>On this page</strong>
      {sections.map(([id, label]) => (
        <a key={id} href={"#" + id}>
          {label}
        </a>
      ))}
    </nav>
  );
}

export function SiteLead({
  title,
  description,
  status,
  brief,
  back = ["/", "Sonnely"],
  children,
}: {
  title: string;
  description: string;
  status?: string;
  brief?: SiteBrief;
  back?: readonly [href: string, label: string];
  children?: ReactNode;
}) {
  return (
    <header className="page-lead market-lead" data-brief={brief ? "" : undefined}>
      <Scene />
      <div className="market-lead-copy">
        <div className="market-lead-nav">
          <Link href={back[0]} className="market-back">
            <ArrowLeft size={14} aria-hidden="true" /> {back[1]}
          </Link>
          {status && <span className="market-status">{status}</span>}
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
        {children}
      </div>
      {brief && (
        <figure className="market-brief">
          <figcaption>{brief.title}</figcaption>
          <dl>
            {brief.rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </figure>
      )}
    </header>
  );
}
