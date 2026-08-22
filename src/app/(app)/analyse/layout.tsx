import { SectionNav } from '@/components/analysis/section-nav';
import { AnalysisDisclaimer } from '@/components/analysis/disclaimer';
import { PageHeader } from '@/components/ui/page-header';

/**
 * The analysis shell.
 *
 * The section nav and the standing disclaimer live here so that no screen can
 * be reached without them — the correlation notice is not decoration on one page
 * and absent on another.
 *
 * The auth boundary is still `(app)/layout.tsx`; this adds nothing to it.
 */
export default function AnalyseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="space-y-4 p-4">
      <PageHeader
        eyebrow="Auswertung"
        title="Analyse"
        description="Welche Faktoren wirken sich wie aus."
      />
      <SectionNav />
      {children}
      <AnalysisDisclaimer />
    </main>
  );
}
