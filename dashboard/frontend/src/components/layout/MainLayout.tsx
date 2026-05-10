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
  const { onboarded, check, setOnboarded } = useSetupStore();

  useEffect(() => {
    check();
    const id = setInterval(check, 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    localStorage.setItem('manualflow.mode', mode);
  }, [mode]);

  // Onboarding is a one-time gate. The wizard appears only until the user has
  // either completed it explicitly or auto-promoted by reaching a ready state
  // (handled in setupStore.check). Mid-session degradation is surfaced via
  // inline status badges, never by replacing the whole UI.
  //
  // Note: we keep the wizard mounted even while `checking` is true. The check()
  // poll flips `checking` true→false every interval; unmounting on checking
  // would reset the wizard's stepIdx on every tick.
  if (!onboarded) {
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
