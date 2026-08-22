'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Section navigation. `Chip`-shaped links rather than a tabs primitive: there
 * is no Radix tabs in this project, and a row of chips already gives the 44 px
 * targets and the pressed state.
 */
const SECTIONS = [
  { href: '/analyse', label: 'Überblick' },
  { href: '/analyse/faktoren', label: 'Faktoren' },
  { href: '/analyse/muster', label: 'Muster' },
  { href: '/analyse/bericht', label: 'Bericht' },
] as const;

export function SectionNav() {
  const pathname = usePathname();
  // A tiny client island rather than threading the path through every page: the
  // alternative is four call sites that can each get it wrong.
  const current =
    [...SECTIONS]
      .sort((a, b) => b.href.length - a.href.length)
      .find((section) =>
        section.href === '/analyse'
          ? pathname === '/analyse'
          : pathname.startsWith(section.href)
      )?.href ?? '/analyse';

  return (
    <nav aria-label="Analyse-Bereiche" className="-mx-1 overflow-x-auto px-1">
      <ul className="flex gap-2">
        {SECTIONS.map((section) => {
          const active = section.href === current;
          return (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 shrink-0 items-center rounded-pill border px-3.5 text-sm font-medium',
                  'transition-[background-color,border-color,color,transform] duration-120 ease-out-soft',
                  'active:scale-[0.96]',
                  active
                    ? 'border-primary-strong bg-primary text-primary-fg'
                    : 'border-line-strong bg-card text-fg hover:border-primary-strong hover:bg-primary-tint'
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
