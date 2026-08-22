import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-2 rounded-control font-medium',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-120 ease-out-soft',
    // Press feedback. The app is used one-handed on a phone, where a 40ms
    // scale is the only confirmation that a tap landed before the server
    // answers.
    'active:scale-[0.97]',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong',
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0'
  ),
  {
    variants: {
      variant: {
        // Text on the apricot primary must be the dark tone: white would be
        // roughly 2:1 and unreadable. --color-primary-hover keeps that ratio
        // at ~9:1, which opacity-90 did not — it faded the text too.
        primary:
          'bg-primary text-primary-fg shadow-hairline hover:bg-primary-hover active:bg-primary-press',
        soft: 'bg-soft text-fg hover:bg-soft-hover',
        outline:
          'border border-line bg-card text-fg shadow-hairline hover:border-line-strong hover:bg-primary-tint',
        ghost: 'text-fg hover:bg-primary-tint',
        danger: 'bg-danger text-white hover:brightness-110',
      },
      size: {
        // Tap targets are never below 44px.
        default: 'min-h-11 px-4 py-2 text-base',
        // Only for buttons that sit beside another target (a header action next
        // to a title, an inline "OK"). min-h-9 is below the 44px floor, so it
        // must never be the sole target in its row.
        sm: 'min-h-9 px-3 py-1.5 text-sm',
        lg: 'min-h-14 px-5 py-3 text-lg',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  }
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
