'use client';

import { useId, useState } from 'react';
import { Table2, ChartColumn } from 'lucide-react';
import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * The container every chart mounts in.
 *
 * It exists so that the accessible twin cannot be forgotten: the toggle and the
 * `sr-only` summary live here, not in each chart, so a new chart gets both by
 * construction. Recharts ships no table view of its own, which is one of the
 * three gaps this layer fills.
 *
 * `chart` and `table` are props rather than children because the chart is a
 * client component and the table is plain markup — keeping them separate lets
 * the table stay server-rendered and keeps it in the DOM-free state until
 * asked for.
 */
export function ChartFrame({
  title,
  caption,
  /** A full sentence for screen readers: what is plotted, and its extremes. */
  summary,
  legend,
  chart,
  table,
  footer,
  className,
}: {
  title: string;
  caption?: string;
  summary: string;
  legend?: React.ReactNode;
  chart: React.ReactNode;
  table?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const regionId = useId();

  return (
    <Card className={className}>
      <CardHeader
        action={
          table ? (
            <button
              type="button"
              onClick={() => setShowTable((value) => !value)}
              aria-pressed={showTable}
              aria-controls={regionId}
              className={cn(
                'tap flex items-center justify-center rounded-control px-2 text-muted',
                'transition-colors duration-120 ease-out-soft',
                'hover:bg-primary-tint hover:text-primary-strong active:scale-[0.97]'
              )}
            >
              {showTable ? (
                <ChartColumn aria-hidden className="size-5" />
              ) : (
                <Table2 aria-hidden className="size-5" />
              )}
              <span className="sr-only">
                {showTable ? 'Diagramm anzeigen' : 'Als Tabelle anzeigen'}
              </span>
            </button>
          ) : undefined
        }
      >
        <CardTitle>{title}</CardTitle>
        {caption ? <CardMeta>{caption}</CardMeta> : null}
      </CardHeader>

      <div id={regionId}>
        {/* The sentence is always present, whichever view is showing. */}
        <p className="sr-only">{summary}</p>
        {showTable && table ? table : chart}
      </div>

      {/*
        Without JavaScript there is no chart at all: Recharts' ResponsiveContainer
        measures its parent, and on the server that width is zero, so it renders
        nothing until hydration. The toggle above is client-side too, which would
        leave the table unreachable exactly when it is the only thing left.

        So the table also renders inside <noscript>. It is server-rendered markup
        either way, so this costs nothing at runtime and it means the numbers are
        never gated behind a script.
      */}
      {table ? (
        <noscript>
          <div className="mt-2">{table}</div>
        </noscript>
      ) : null}

      {legend ? <div className="mt-3">{legend}</div> : null}
      {footer ? <div className="mt-3 text-sm text-muted">{footer}</div> : null}
    </Card>
  );
}

/**
 * Legend for two or more series.
 *
 * Always present above that count, because colour must never be the only way to
 * tell series apart. A single series gets none — the title already names it, and
 * a one-swatch box just restates it.
 *
 * The swatch mirrors the mark: a short line for lines, a rounded rect for bars
 * and areas. Text keeps the text tokens; identity comes from the mark beside it,
 * never from colouring the label.
 */
export function ChartLegend({
  items,
  mark = 'rect',
}: {
  items: { label: string; color: string }[];
  mark?: 'rect' | 'line';
}) {
  if (items.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-sm text-muted">
          <span
            aria-hidden
            className={cn('shrink-0', mark === 'line' ? 'h-0.5 w-4 rounded-pill' : 'size-3 rounded-[3px]')}
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
