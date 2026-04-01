import { useState } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { RecordView } from '../recording/RecordView';

export function MainLayout() {
  const [activeView, setActiveView] = useState('record');

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
        <main className="flex-1 overflow-auto p-4">
          {activeView === 'record' && <RecordView />}
          {activeView === 'library' && (
            <div className="text-slate-400 text-center mt-20">Flow Library — coming soon</div>
          )}
          {activeView === 'runner' && (
            <div className="text-slate-400 text-center mt-20">Test Runner — coming soon</div>
          )}
        </main>
      </div>
    </div>
  );
}
