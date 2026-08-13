import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";

export type DataTableColumnMeta = {
  className?: string;
  headerClassName?: string;
};

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  emptyMessage?: string;
  className?: string;
  /** Ancho mínimo del table (para scroll horizontal). */
  minWidthClassName?: string;
  tableFixed?: boolean;
}

export function DataTable<TData>({
  columns,
  data,
  emptyMessage = "Sin resultados.",
  className,
  minWidthClassName = "min-w-[840px]",
  tableFixed = false,
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table
          className={cn(
            "w-full border-collapse text-sm",
            minWidthClassName,
            tableFixed && "table-fixed",
          )}
        >
          <thead className="border-b border-border bg-muted/40">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as
                    | DataTableColumnMeta
                    | undefined;
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                        meta?.className,
                        meta?.headerClassName,
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/70 last:border-0 hover:bg-muted/20"
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as
                      | DataTableColumnMeta
                      | undefined;
                    return (
                      <td
                        key={cell.id}
                        className={cn("px-3 py-2.5 align-middle", meta?.className)}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
