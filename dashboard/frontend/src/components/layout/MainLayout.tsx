import { useState } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { RecordView } from '../recording/RecordView';
import { LibraryView } from '../library/LibraryView';
import { RunnerView } from '../runner/RunnerView';

export function MainLayout() {
  const [activeView, setActiveView] = useState('record');

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
        <main className="flex-1 overflow-hidden p-4">
          {activeView === 'record' && <RecordView />}
          {activeView === 'library' && <LibraryView />}
          {activeView === 'runner' && <RunnerView />}
        </main>
      </div>
    </div>
  );
}
