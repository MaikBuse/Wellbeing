import { cn } from '@/lib/utils';

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  /** German message from a server action; rendered inline instead of as a toast. */
  error?: string | null;
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
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}

/**
 * Inline field error. Server actions return German strings and every one of
 * them used to surface only as a sonner toast, which disappears before the user
 * has found the field it belongs to.
 */
export function FieldError({
  className,
  ...props
}: React.ComponentProps<'p'>) {
  return (
    <p
      role="alert"
      className={cn('text-xs font-medium text-danger', className)}
      {...props}
    />
  );
}

// Shared shell for every text-entry control. 16px is a hard floor: below it iOS
// zooms on focus and never zooms back out.
const control = cn(
  'w-full rounded-control border border-line bg-card text-base text-fg placeholder:text-muted',
  'transition-[border-color,box-shadow] duration-120 ease-out-soft',
  'hover:border-line-strong',
  'focus-visible:border-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
  'disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-muted',
  'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger/25'
);

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input className={cn(control, 'min-h-11 px-3', className)} {...props} />
  );
}

export function Select({
  className,
  ...props
}: React.ComponentProps<'select'>) {
  return (
    <select className={cn(control, 'min-h-11 px-3', className)} {...props} />
  );
}

export function Textarea({
  className,
  ...props
}: React.ComponentProps<'textarea'>) {
  return (
    <textarea className={cn(control, 'min-h-20 p-3', className)} {...props} />
  );
}
