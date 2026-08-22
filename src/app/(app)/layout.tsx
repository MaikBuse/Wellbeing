import { requireUser } from '@/auth.helpers';
import { AppHeader } from '@/components/nav/app-header';
import { BottomNav } from '@/components/nav/bottom-nav';

/**
 * THE authentication boundary for every page in this group. Putting it in the
 * layout means it cannot be forgotten on a new page.
 *
 * Note that this does NOT protect server actions — those are addressable POST
 * endpoints and each one calls requireUserForAction() itself.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <AppHeader />
      {/* pb-24 clears the fixed tab bar. */}
      <div className="flex-1 pb-24">{children}</div>
      {/* Content dissolves into the page colour just above the tab bar. This
       * has to be its own fixed element: a mask on the scroll container would
       * be measured against the full content height and fade a band in the
       * middle of the document instead. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-24 bg-gradient-to-t from-bg via-bg/85 to-transparent"
      />
      <BottomNav />
    </div>
  );
}
