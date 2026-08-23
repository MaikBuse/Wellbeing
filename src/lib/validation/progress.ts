import { z } from 'zod';
import { MILESTONE_KEYS } from '@/services/progress/milestones';

/**
 * Dismissing a milestone's celebration.
 *
 * Note what the client is NOT trusted with: the key alone. It may not send the
 * date the milestone was reached — that comes from the server's own
 * re-evaluation, for the same reason a client never sends a `log_date`. A
 * posted date would let a badge claim any day it liked.
 */
export const acknowledgeAchievementSchema = z.object({
  key: z.enum(MILESTONE_KEYS),
});
