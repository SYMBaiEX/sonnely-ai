/* eslint-disable better-tailwindcss/no-unknown-classes -- the shared search control uses the search-field class defined in site.css */
// spec/app/models.md, "Story: Filter the catalog"
import { Search } from "lucide-react";
import { Input, type InputProps } from "@repo/ui";

export type SearchFieldProps = Omit<InputProps, "type"> & {
  className?: string;
};

export function SearchField({ className, ...inputProps }: SearchFieldProps) {
  return (
    <label className={className ? `search-field ${className}` : "search-field"}>
      <Search size={16} aria-hidden="true" />
      <Input type="search" {...inputProps} />
    </label>
  );
}
