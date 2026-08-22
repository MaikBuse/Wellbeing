import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Text on the apricot primary must be the dark tone: white would be
        // roughly 2:1 and unreadable.
        primary: 'bg-primary text-primary-fg hover:opacity-90',
        soft: 'bg-soft text-fg hover:opacity-90',
        outline: 'border border-line bg-card text-fg hover:bg-soft',
        ghost: 'text-fg hover:bg-soft',
        danger: 'bg-danger text-white hover:opacity-90',
      },
      size: {
        // Tap targets are never below 44px.
        default: 'min-h-11 px-4 py-2 text-base',
        sm: 'min-h-11 px-3 py-1.5 text-sm',
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
