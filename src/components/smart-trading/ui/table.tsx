import * as React from "react";
import { cn } from "@/lib/utils";

export function SmartTable({
  className,
  children,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto cyan-scrollbar">
      <table className={cn("w-full text-left border-collapse text-sm", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function SmartTableHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b border-neutral-800 text-[11px] font-bold uppercase tracking-wider text-neutral-400 bg-neutral-900/60 sticky top-0",
        className
      )}
      {...props}
    >
      {children}
    </thead>
  );
}

export function SmartTableBody({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn("divide-y divide-neutral-800/60", className)} {...props}>
      {children}
    </tbody>
  );
}

export function SmartTableRow({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "hover:bg-neutral-800/40 transition-colors select-none group",
        className
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

export function SmartTableHead({
  className,
  children,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn("py-3 px-4 font-semibold text-neutral-400", className)} {...props}>
      {children}
    </th>
  );
}

export function SmartTableCell({
  className,
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("py-3.5 px-4 text-neutral-200", className)} {...props}>
      {children}
    </td>
  );
}
