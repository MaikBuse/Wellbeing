import { Suspense } from 'react';
import { requireUser } from '@/auth.helpers';
import { getUserSettings } from '@/db/queries/users';
import { HAS_RIVE } from '@/components/mascot/artwork';
import { MascotDock } from '@/components/mascot/mascot-dock';
import { MascotToggle } from '@/components/mascot/mascot-toggle';
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
  /*
   * `requireUser` and NOT `requireUserWithSettings`: this is the authentication
   * boundary and it has to REDIRECT. The helper builds on
   * `requireUserForAction`, which throws — right for a server action, wrong for
   * a page someone opened while signed out.
   */
  const user = await requireUser();

  /*
   * One indexed row, and `getUserSettings` is wrapped in `cache()`, so
   * `MascotDock` below hits the cache rather than the database. The read moves
   * in front of the paint rather than being added: what changes is that the
   * shell now waits on it, which a header button appearing a moment after the
   * header would be a worse trade for.
   */
  const settings = await getUserSettings(user.id);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      {/*
       * The one action in the header, and only when there is something for it
       * to do: no toggle for a companion that is switched off entirely, and
       * none for a drawing that is not in the repository.
       */}
      <AppHeader
        action={
          settings.showMascot && HAS_RIVE ? (
            <MascotToggle enabled={settings.showMascotFigure} />
          ) : null
        }
      />
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
      {/*
       * The companion stands on the bar, so he belongs to the frame rather than
       * to any one screen. Inside a Suspense boundary because he reads the
       * day's nutrients: without it every route in the app — /settings
       * included — would wait on that before painting. He arrives a moment
       * late, which is what walking into a room looks like.
       */}
      <Suspense fallback={null}>
        <MascotDock />
      </Suspense>
      <RefreshOnResume />
    </div>
  );
}
