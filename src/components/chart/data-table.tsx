import { cn } from '@/lib/utils';

/**
 * The accessible twin of a chart.
 *
 * Every chart in this app has one, and that is not a nicety: the SVG is
 * `aria-hidden` decoration by house rule (see macro-bar.tsx and
 * progress-ring.tsx), so the table IS how a screen reader, a keyboard user, or
 * anyone who wants the exact number gets at the data. A tooltip may enhance,
 * never gate.
 */
export type Column<Row> = {
  key: string;
  label: string;
  align?: 'left' | 'right';
  render: (row: Row) => React.ReactNode;
};

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  className,
}: {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string;
  className?: string;
}) {
  return (
    // Wide tables scroll inside their own box; the page never scrolls sideways.
    <div className={cn('-mx-1 overflow-x-auto px-1', className)}>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'py-1.5 pr-3 text-eyebrow font-semibold uppercase text-muted',
                  column.align === 'right' ? 'text-right' : 'text-left'
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)} className="border-b border-line-soft">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'py-1.5 pr-3 text-fg',
                    // tabular-nums so columns of figures line up vertically.
                    column.align === 'right' ? 'num text-right' : 'text-left'
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
