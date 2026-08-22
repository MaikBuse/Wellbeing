'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Bottom sheet on Radix Dialog — focus trap, escape, scroll lock and the
 * labelling all come from the primitive.
 *
 * @radix-ui/react-dialog was already installed and unimported, so this is free.
 * Note that ReactionSheet is deliberately NOT this: it stays inline inside a
 * Disclosure so the common logging path keeps its three taps.
 */

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export function SheetContent({
  title,
  description,
  children,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Dialog.Content>, 'title'> & {
  title: string;
  description?: string;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-fg/25 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
      <Dialog.Content
        className={cn(
          'safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88dvh] w-full max-w-lg overflow-y-auto',
          'rounded-t-sheet border border-line bg-card px-4 pt-4 shadow-overlay',
          'data-[state=open]:animate-rise',
          className
        )}
        {...props}
      >
        {/* Grab handle. Decorative — dragging is not implemented; it is here
         * because a sheet without one reads as a stuck page. */}
        <div
          aria-hidden
          className="mx-auto mb-3 h-1 w-10 rounded-pill bg-line-strong"
        />
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Dialog.Title className="text-section font-semibold text-fg">
              {title}
            </Dialog.Title>
            {description ? (
              <Dialog.Description className="mt-0.5 text-sm text-muted">
                {description}
              </Dialog.Description>
            ) : null}
          </div>
          <Dialog.Close
            aria-label="Schließen"
            className="tap -mr-2 -mt-2 flex items-center justify-center rounded-pill text-muted transition-colors duration-120 hover:bg-soft hover:text-fg"
          >
            <X aria-hidden className="size-5" />
          </Dialog.Close>
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
