import { requireUser } from '@/auth.helpers';
import { AppHeader } from '@/components/nav/app-header';
import { BottomNav } from '@/components/nav/bottom-nav';
import { RefreshOnResume } from '@/components/pwa/refresh-on-resume';

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
      {/* Content dissolves into the page colour behind the translucent tab bar.
       * This has to be its own fixed element: a mask on the scroll container
       * would be measured against the full content height and fade a band in
       * the middle of the document instead.
       *
       * Do NOT make this taller than the bar, and do not add an intermediate
       * opacity stop. It used to be h-24 with `via-bg/85`, which washed out
       * everything in the bottom 96px of the *viewport* — chips, save buttons —
       * while leaving them clickable. Controls that look disabled but are not
       * is the worst of both worlds, and it was reported as exactly that. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-14 bg-gradient-to-t from-bg to-transparent"
      />
      <BottomNav />
      <RefreshOnResume />
    </div>
  );
}
