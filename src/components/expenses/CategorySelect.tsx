import { useCategoryBook, useTaxSchedule } from "@/contexts/ExpenseCategoriesContext";
import { cn } from "@/lib/utils";

interface CategorySelectProps {
  value: string;
  onChange: (category: string) => void;
  includeBlank?: boolean;
  blankLabel?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

/**
 * Expense category picker, grouped under the org's active tax schedule line
 * (Schedule F by default, C when swapped) via the shared mapping. Emits the
 * chosen category string (""/blank = uncategorized); callers derive the
 * schedule_*_category snapshots from the CategoryBook.
 */
export function CategorySelect({
  value,
  onChange,
  includeBlank = true,
  blankLabel = "Uncategorized",
  className,
  id,
  ...rest
}: CategorySelectProps) {
  const book = useCategoryBook();
  const { taxSchedule } = useTaxSchedule();
  const groups = book.groupsFor(taxSchedule);
  return (
    <select
      id={id}
      {...rest}
      className={cn(
        "w-full bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-border-strong",
        className,
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {includeBlank && <option value="">{blankLabel}</option>}
      {groups.map((g) => (
        <optgroup key={g.line} label={g.line}>
          {g.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
