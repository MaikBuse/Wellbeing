import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The app mark. Derived from `assets/logo-master.png` by
 * `scripts/gen-icons.sh`; the source here keeps its alpha channel so the bowl
 * picks up whatever surface it sits on (--color-bg and --color-card differ).
 *
 * Decorative in every current placement: a heading carrying the app name is
 * always next to it, so an alt text would only make a screen reader announce
 * "Wellbeing" twice.
 */
export function Logo({
  size = 64,
  className,
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/icons/logo-256.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      priority={priority}
      // The runner stage of the Dockerfile never runs `npm ci`, so sharp is not
      // guaranteed to exist in the image and the optimizer route can fail at
      // runtime. This is a small, already correctly sized PNG — the optimizer
      // would only re-encode it. Do not remove.
      unoptimized
      className={cn('block select-none', className)}
    />
  );
}
