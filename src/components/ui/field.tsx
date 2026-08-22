import { cn } from '@/lib/utils';

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <label
        htmlFor={htmlFor}
        id={htmlFor ? `${htmlFor}-label` : undefined}
        className="block text-sm font-medium text-fg"
      >
        {label}
      </label>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      {children}
    </div>
  );
}

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        // Font size must stay at 16px or iOS zooms on focus and never zooms back.
        'min-h-11 w-full rounded-xl border border-line bg-card px-3 text-base text-fg placeholder:text-muted',
        className
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'min-h-11 w-full rounded-xl border border-line bg-card px-3 text-base text-fg',
        className
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-20 w-full rounded-xl border border-line bg-card p-3 text-base text-fg placeholder:text-muted',
        className
      )}
      {...props}
    />
  );
}
