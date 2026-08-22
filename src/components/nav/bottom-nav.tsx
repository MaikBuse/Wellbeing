'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Apple, CalendarDays, Home, Pill, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/', label: 'Heute', icon: Home },
  { href: '/day', label: 'Tage', icon: CalendarDays },
  { href: '/medications', label: 'Medis', icon: Pill },
  { href: '/foods', label: 'Essen', icon: Apple },
  { href: '/settings', label: 'Mehr', icon: Settings },
];

/**
 * Primary navigation lives at the bottom, in the thumb zone — a header nav on a
 * phone means reaching across the screen for the most frequent action.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 pt-1 backdrop-blur">
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {ITEMS.map((item) => {
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'tap flex flex-col items-center gap-0.5 rounded-lg py-1 text-[0.7rem] font-medium',
                  active ? 'text-primary-strong' : 'text-muted'
                )}
              >
                <Icon aria-hidden className="size-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
