import { COMPARISON_COLUMNS, COMPARISON_ROWS } from "@/core/pricing/plans";
import { cn } from "@/lib/utils";

export function ComparisonTable({ className }: { className?: string }) {
  return (
    <section className={className}>
      <h2 className="mb-6 font-serif text-[32px] font-normal">Compare plans</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="text-muted-foreground w-[26%] px-4 py-3 text-left font-medium">
                <span className="sr-only">Capability</span>
              </th>
              {COMPARISON_COLUMNS.map((column) => (
                <th key={column} className="px-4 py-3 text-left font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-foreground/85">
            {COMPARISON_ROWS.map((row, index) => (
              <tr
                key={row.label}
                className={cn(
                  "border-border border-t",
                  index % 2 === 1 && "bg-muted",
                  index === COMPARISON_ROWS.length - 1 && "border-b",
                )}
              >
                <th
                  scope="row"
                  className="text-muted-foreground px-4 py-3.5 text-left font-normal"
                >
                  {row.label}
                </th>
                {row.values.map((value, columnIndex) => (
                  <td
                    key={`${row.label}-${COMPARISON_COLUMNS[columnIndex]}`}
                    className="px-4 py-3.5"
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
