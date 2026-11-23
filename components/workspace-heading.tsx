import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function WorkspaceHeading({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="console-title">
      <div className="console-title-identity">
        <span className="console-title-icon">
          <Icon size={21} aria-hidden="true" />
        </span>
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {children && <div className="console-title-actions">{children}</div>}
    </header>
  );
}
