'use client';

import { useCallback, useRef } from 'react';
import { useHasPointer, useReducedMotion } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';

/**
 * A faint warm glow that follows the pointer across a surface.
 *
 * Pointer-only by design, and that is the point: on the phone this app mostly
 * runs on there is no hover, so no listener is attached and nothing renders.
 * Desktop gets a little depth. The alpha is kept very low — this should read as
 * the surface catching light, not as a highlight effect.
 */
export function Spotlight({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  const ref = useRef<HTMLDivElement>(null);
  const hasPointer = useHasPointer();
  const reduced = useReducedMotion();

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    node.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
  }, []);

  const active = hasPointer && !reduced;

  return (
    <div
      ref={ref}
      onPointerMove={active ? onPointerMove : undefined}
      className={cn('group/spot relative isolate', className)}
      {...props}
    >
      {active ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-0 transition-opacity duration-300 ease-out-soft group-hover/spot:opacity-100"
          style={{
            background:
              'radial-gradient(220px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgb(241 168 133 / 0.16), transparent 70%)',
          }}
        />
      ) : null}
      {children}
    </div>
  );
}
