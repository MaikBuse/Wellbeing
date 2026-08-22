import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { cn } from '@/lib/utils';

/**
 * The app chrome. Until now the authenticated area had no header at all — the
 * layout was a div, the content and the tab bar, and the app mark appeared only
 * on the signed-out screens and as a footer in settings.
 *
 * `viewTransitionName` anchors it during directional route slides: the header is
 * the fixed reference point that tells the user the *content* moved, not the
 * whole viewport. The matching ::view-transition rules live in globals.css.
 */
export function AppHeader({
  action,
  className,
  ...props
}: React.ComponentProps<'header'> & { action?: React.ReactNode }) {
  return (
    <header
      style={{ viewTransitionName: 'site-header' }}
      className={cn(
        'sticky top-0 z-30 flex items-center justify-between gap-3',
        'border-b border-line/70 bg-veil px-4 py-2 backdrop-blur-md',
        className
      )}
      {...props}
    >
      <Link
        href="/"
        className="-mx-1 flex items-center gap-2 rounded-control px-1 py-1 transition-colors duration-120 hover:bg-primary-tint"
      >
        <Logo size={26} priority />
        <span className="font-display text-lg font-semibold tracking-tight text-fg">
          Wellbeing
        </span>
      </Link>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
