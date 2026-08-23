import { cn } from '@/lib/utils';

/**
 * The one page heading. Eight routes each built their own <h1>/<header>
 * combination before, in two slightly different shapes.
 *
 * `eyebrow` and `action` are optional; the action sits on the first text
 * baseline rather than centred, so a two-line title does not drag it down.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  action,
  className,
  ...props
}: Omit<React.ComponentProps<'header'>, 'title'> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header
      className={cn('flex items-start justify-between gap-3 pt-2', className)}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-eyebrow font-semibold uppercase text-primary-strong">
            {eyebrow}
          </p>
        ) : null}
        {/* break-words, because the title column is min-w-0: without it a long
         * single word — "Lebensmittel" — paints outside its shrunken box and
         * under the action buttons. */}
        <h1 className="text-title text-balance break-words text-fg">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0 pt-1">{action}</div> : null}
    </header>
  );
}
