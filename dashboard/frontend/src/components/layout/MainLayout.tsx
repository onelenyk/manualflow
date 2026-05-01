import { useEffect, useState } from 'react';
import type { Mode } from '../qa/ModeToggle';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { RecordView } from '../recording/RecordView';
import { FlowGallery } from '../flows/FlowGallery';
import { SettingsView } from '../settings/SettingsView';
import { SetupWizard } from '../setup/SetupWizard';
import { MaestroProjectView } from '../maestro/MaestroProjectView';
import { QAModeRouter } from '../qa/QAModeRouter';
import { useSetupStore } from '../../stores/setupStore';

export function MainLayout() {
  const [activeView, setActiveView] = useState('create-flow');
  const [mode, setMode] = useState<Mode>(() => {
    return (localStorage.getItem('manualflow.mode') as Mode) || 'qa';
  });
  const { checking, onboarded, check, setOnboarded } = useSetupStore();

  useEffect(() => {
    check();
    const id = setInterval(check, 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    localStorage.setItem('manualflow.mode', mode);
  }, [mode]);

  useEffect(() => {
    check();
    const id = setInterval(check, 4000);
    return () => clearInterval(id);
  }, []);

  // Onboarding is a one-time gate. The wizard appears only until the user has
  // either completed it explicitly or auto-promoted by reaching a ready state
  // (handled in setupStore.check). Mid-session degradation is surfaced via
  // inline status badges, never by replacing the whole UI.
  if (!onboarded) {
    if (checking) {
      return (
        <div className="h-screen flex items-center justify-center bg-slate-950">
          <div className="flex items-center gap-2 text-slate-500 text-xs">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Checking setup...
          </div>
        </div>
      );
    }
    return (
      <div className="h-screen bg-slate-950">
        <SetupWizard
          onComplete={() => setOnboarded(true)}
          onSkip={() => setOnboarded(true)}
        />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      <Header mode={mode} onModeChange={setMode} />
      <div className="flex flex-1 overflow-hidden">
        {mode !== 'qa' && <Sidebar activeView={activeView} onViewChange={setActiveView} />}
        <main className="flex-1 overflow-hidden p-4">
          {mode === 'qa' ? (
            <QAModeRouter />
          ) : (
            <>
              {activeView === 'create-flow' && <RecordView />}
              {activeView === 'flow-gallery' && <FlowGallery />}
              {activeView === 'flow-finder' && <MaestroProjectView />}
              {activeView === 'settings' && <SettingsView />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
