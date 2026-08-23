import { MilestoneMedal } from '@/components/progress/milestone-medal';
import { isAchieved, type Milestone } from '@/services/progress/milestones';

/**
 * Achieved milestones first, then the two nearest open ones.
 *
 * Only two, and that is the design: a long column of everything still locked
 * reads as a list of failures. The nearest ones are the only ones that can
 * influence what someone does this week; the rest appear as they come into
 * reach.
 */
export const OPEN_MILESTONES_SHOWN = 2;

export function MilestoneGrid({ milestones }: { milestones: Milestone[] }) {
  const applicable = milestones.filter((milestone) => milestone.applicable);
  const achieved = applicable.filter(isAchieved);
  const open = applicable
    .filter((milestone) => !isAchieved(milestone))
    .sort((a, b) => remaining(a) - remaining(b))
    .slice(0, OPEN_MILESTONES_SHOWN);

  const shown = [...achieved, ...open];

  return (
    <ul className="space-y-2">
      {shown.map((milestone, index) => (
        <MilestoneMedal
          key={milestone.key}
          milestone={milestone}
          index={index}
        />
      ))}
    </ul>
  );
}

function remaining(milestone: Milestone): number {
  return Math.max(0, milestone.need - milestone.have);
}
