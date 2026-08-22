import { cn } from '@/lib/utils';

/**
 * Leerzustand. Says what is missing and offers the way out, instead of the
 * bare muted sentence in a card that three routes used.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: Omit<React.ComponentProps<'div'>, 'title'> & {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-card border border-dashed border-line px-6 py-10 text-center',
        className
      )}
      {...props}
    >
      {icon ? <div className="text-primary-strong">{icon}</div> : null}
      <p className="text-section font-semibold text-fg">{title}</p>
      {description ? (
        <p className="max-w-xs text-sm text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
