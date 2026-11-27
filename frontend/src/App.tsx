import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import { ExperimentComparisonPage } from '@/pages/ExperimentComparisonPage';
import { ExperimentHistoryPage } from '@/pages/ExperimentHistoryPage';
import { ExperimentResultsPage } from '@/pages/ExperimentResultsPage';
import { IndividualVerificationPage } from '@/pages/IndividualVerificationPage';
import { NewExperimentPage } from '@/pages/NewExperimentPage';
import { OverviewPage } from '@/pages/OverviewPage';

export function App() {
  return (
    <BrowserRouter>
      <WorkspaceProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/verify" element={<IndividualVerificationPage />} />
            <Route path="/experiments/new" element={<NewExperimentPage />} />
            <Route path="/experiments/results" element={<ExperimentResultsPage />} />
            <Route path="/experiments/history" element={<ExperimentHistoryPage />} />
            <Route path="/experiments/compare" element={<ExperimentComparisonPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </WorkspaceProvider>
    </BrowserRouter>
  );
}

export default App;
