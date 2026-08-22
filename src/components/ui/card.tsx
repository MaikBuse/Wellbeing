import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      className={cn(
        'rounded-card border border-line bg-card p-4 shadow-[0_1px_2px_rgba(42,34,36,0.04)]',
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.ComponentProps<'header'>) {
  return (
    <header
      className={cn('mb-3 flex items-center justify-between gap-2', className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <h2
      className={cn('text-base font-semibold text-fg', className)}
      {...props}
    />
  );
}

export function CardMeta({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-sm text-muted', className)} {...props} />;
}
