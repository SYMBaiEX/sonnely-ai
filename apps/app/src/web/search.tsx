// spec/app/models.md, "Story: Filter the catalog"
import { Search } from "lucide-react";
import { cn, Input, type InputProps } from "@repo/ui";

export type SearchFieldProps = Omit<InputProps, "type"> & {
  className?: string;
};

export function SearchField({ className, ...inputProps }: SearchFieldProps) {
  return (
    <label
      className={cn(
        "flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-muted-foreground transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
        className,
      )}
    >
      <Search size={16} aria-hidden="true" />
      <Input type="search" className="min-w-0 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0" {...inputProps} />
    </label>
  );
}
