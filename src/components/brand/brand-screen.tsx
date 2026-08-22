import { Logo } from '@/components/brand/logo';
import { cn } from '@/lib/utils';

/**
 * The shared shell for the three screens shown without a session: sign-in,
 * auth error and the offline fallback.
 *
 * Sign-in is the only screen that makes a first impression, so it is worth the
 * gradient — but all three should look like the same app, and the offline page
 * in particular must keep working with no session and no database.
 *
 * Children are staggered by wrapping each top-level block, rather than by
 * splitting text into per-word spans: word spans fragment the accessibility
 * tree for headings a screen reader would read as one phrase.
 */
export function BrandScreen({
  logoSize = 72,
  priority = false,
  dimLogo = false,
  children,
  className,
}: {
  logoSize?: number;
  priority?: boolean;
  dimLogo?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main
      className={cn(
        'mesh-ground mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-7 p-6',
        className
      )}
    >
      <div
        className="rise-in"
        style={{ '--i': 0 } as React.CSSProperties}
      >
        <Logo
          size={logoSize}
          priority={priority}
          className={dimLogo ? 'opacity-60' : undefined}
        />
      </div>
      {children}
    </main>
  );
}

/** One staggered block inside a BrandScreen. `step` drives the entrance delay. */
export function BrandBlock({
  step,
  className,
  ...props
}: React.ComponentProps<'div'> & { step: number }) {
  return (
    <div
      className={cn('rise-in', className)}
      style={{ '--i': step } as React.CSSProperties}
      {...props}
    />
  );
}
