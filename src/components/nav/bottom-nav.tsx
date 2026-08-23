'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Apple, Home, Pill, Settings, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  alsoMatches?: string[];
};

const ITEMS: NavItem[] = [
  {
    href: '/',
    label: 'Heute',
    icon: Home,
    // /progress is reached from the streak card on "Heute" and has no tab of
    // its own — a sixth target would squeeze all six below comfortable thumb
    // width, which is the same reason "Tage" was folded into "Analyse". Without
    // this the indicator would simply vanish on the way there.
    alsoMatches: ['/progress'],
  },
  // Replaces the old "Tage" tab rather than adding a sixth: /day never had a
  // list, only a redirect to yesterday, and the calendar heatmap inside the
  // analysis IS that list — a better one, because it shows the data and not just
  // the dates. Six targets in a max-w-lg column would also squeeze every one of
  // them below comfortable thumb width.
  {
    href: '/analyse',
    label: 'Analyse',
    icon: TrendingUp,
    // A dated day used to light up the "Tage" tab. The day list lives in the
    // analysis now, so that is where it belongs — without this, /day/2026-08-21
    // would match no tab at all and the indicator would simply vanish.
    alsoMatches: ['/day'],
  },
  { href: '/medications', label: 'Medis', icon: Pill },
  { href: '/foods', label: 'Essen', icon: Apple },
  { href: '/settings', label: 'Mehr', icon: Settings },
];

/**
 * Primary navigation lives at the bottom, in the thumb zone — a header nav on a
 * phone means reaching across the screen for the most frequent action.
 *
 * The active indicator slides. Because the five items are equal-width columns
 * its position is `index * 100%` of its own width, so a plain CSS transform
 * transition covers it — no layout-animation library and no measuring.
 */
export function BottomNav() {
  const pathname = usePathname();

  const activeIndex = ITEMS.findIndex((item) => {
    // '/' must match exactly — startsWith would make it swallow every route.
    // Its extra routes still go through alsoMatches like everyone else's.
    if (item.href !== '/' && pathname.startsWith(item.href)) return true;
    if (item.href === '/' && pathname === '/') return true;
    return (item.alsoMatches ?? []).some((prefix) =>
      pathname.startsWith(prefix)
    );
  });

  return (
    <nav
      style={{ viewTransitionName: 'site-nav' }}
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-veil pt-1 backdrop-blur-md"
    >
      <ul className="relative mx-auto flex max-w-lg items-stretch justify-around">
        {/* Indicator sits behind the labels. Hidden entirely when no item
         * matches, rather than parking at index 0 and lying about it. */}
        {activeIndex >= 0 ? (
          <li
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-1/5 p-1 transition-transform duration-300 ease-out-soft"
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
          >
            <span className="block size-full rounded-control bg-primary-tint" />
          </li>
        ) : null}

        {ITEMS.map((item, index) => {
          const active = index === activeIndex;
          const Icon = item.icon;
          return (
            <li key={item.href} className="z-10 flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'tap flex flex-col items-center gap-0.5 rounded-control py-1 text-[0.7rem] font-medium',
                  'transition-[color,transform] duration-120 ease-out-soft active:scale-95',
                  active ? 'text-primary-strong' : 'text-muted'
                )}
              >
                <Icon
                  aria-hidden
                  className="size-5"
                  // Fill echoes the active state so it is not carried by
                  // colour alone.
                  strokeWidth={active ? 2.4 : 1.8}
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
