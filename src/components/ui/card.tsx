import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva('rounded-card', {
  variants: {
    variant: {
      /** Default surface. */
      raised: 'border border-line bg-card shadow-raised',
      /** Flat, for cards sitting inside another surface. */
      plain: 'border border-line bg-card',
      /** Recessed well — grouped lists, secondary content. */
      sunken: 'border border-line-soft bg-bg-sunken',
      /** Translucent, for content over a gradient. */
      glass: 'border border-card/60 bg-veil shadow-raised backdrop-blur',
    },
    padded: {
      true: 'p-4',
      false: '',
    },
  },
  defaultVariants: { variant: 'raised', padded: true },
});

export function Card({
  className,
  variant,
  padded,
  ...props
}: React.ComponentProps<'section'> & VariantProps<typeof cardVariants>) {
  return (
    <section
      className={cn(cardVariants({ variant, padded }), className)}
      {...props}
    />
  );
}

/**
 * `action` renders on the trailing side. Before it existed, every call site
 * wrapped title+meta in a bare <div> by hand to get the same layout.
 */
export function CardHeader({
  className,
  action,
  children,
  ...props
}: React.ComponentProps<'header'> & { action?: React.ReactNode }) {
  return (
    <header
      className={cn('mb-3 flex items-start justify-between gap-2', className)}
      {...props}
    >
      <div className="min-w-0">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <h2
      className={cn('text-section font-semibold text-fg', className)}
      {...props}
    />
  );
}

export function CardMeta({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-sm text-muted', className)} {...props} />;
}
