import { createContext, use, type ComponentProps } from "react";
import { cn } from "../lib/cn.ts";

const ResponsiveContext = createContext(false);

export type TableProps = ComponentProps<"table"> & {
  /** Turns rows into labelled cards below the medium breakpoint. Give each value cell a `label`. */
  responsive?: boolean;
};
export type TableContainerProps = ComponentProps<"div"> & {
  /** The accessible name of the scrollable table region when no heading uses `aria-labelledby`. */
  label?: string;
};
export type TableHeaderProps = ComponentProps<"thead">;
export type TableBodyProps = ComponentProps<"tbody">;
export type TableRowProps = ComponentProps<"tr">;
export type TableHeadProps = ComponentProps<"th">;
export type TableCellProps = ComponentProps<"td"> & {
  /** The column name repeated above this value when a responsive row becomes a card. */
  label?: string;
  /** Lets the value use the full width of a responsive card. */
  wide?: boolean;
};

/** A dense data table. Set `responsive` for operational rows that must stay readable on narrow screens. */
export function Table({ responsive = false, className, children, ...props }: TableProps) {
  return (
    <ResponsiveContext value={responsive}>
      <table className={cn("w-full border-collapse text-ui", responsive && "max-md:block", className)} {...props}>
        {children}
      </table>
    </ResponsiveContext>
  );
}

/** The labelled scroll region around a `Table`; it is keyboard-focusable when wide data scrolls horizontally. */
export function TableContainer({ label, className, ...props }: TableContainerProps) {
  return <div role="region" aria-label={label} tabIndex={0} className={cn("overflow-x-auto rounded-md border border-border bg-card", className)} {...props} />;
}

/** The column headings of a `Table`; they collapse accessibly when the table is responsive. */
export function TableHeader({ className, ...props }: TableHeaderProps) {
  const responsive = use(ResponsiveContext);
  return <thead className={cn(responsive && "max-md:sr-only", className)} {...props} />;
}

/** The rows of a `Table`. */
export function TableBody({ className, ...props }: TableBodyProps) {
  const responsive = use(ResponsiveContext);
  return <tbody className={cn(responsive && "max-md:block max-md:w-full", className)} {...props} />;
}

/** One row of a `Table`. */
export function TableRow({ className, ...props }: TableRowProps) {
  const responsive = use(ResponsiveContext);
  return (
    <tr
      className={cn(
        "border-b border-border",
        responsive && "max-md:mb-3 max-md:grid max-md:grid-cols-2 max-md:gap-x-4 max-md:gap-y-3 max-md:rounded-md max-md:border max-md:border-border max-md:bg-card max-md:p-4",
        className,
      )}
      {...props}
    />
  );
}

/** A column or row heading in a `Table`; use `scope="row"` for the row's primary value. */
export function TableHead({ scope = "col", className, ...props }: TableHeadProps) {
  const responsive = use(ResponsiveContext);
  return (
    <th
      scope={scope}
      className={cn(
        "p-3 text-left font-medium text-muted-foreground",
        scope === "row" && "text-foreground",
        responsive && scope === "row" && "max-md:col-span-full max-md:p-0",
        className,
      )}
      {...props}
    />
  );
}

/** One value in a `Table`; `label` keeps the value self-describing in a responsive card. */
export function TableCell({ label, wide = false, className, children, ...props }: TableCellProps) {
  const responsive = use(ResponsiveContext);
  return (
    <td className={cn("p-3 align-top", responsive && "max-md:grid max-md:content-start max-md:justify-items-start max-md:gap-1 max-md:break-words max-md:p-0", wide && "max-md:col-span-full", className)} {...props}>
      {responsive && label ? <span className="text-micro font-medium tracking-micro text-muted-foreground uppercase md:hidden">{label}</span> : null}
      {children}
    </td>
  );
}
