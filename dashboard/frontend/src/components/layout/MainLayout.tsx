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
        <main className="flex-1 overflow-hidden p-4">
          {activeView === 'record' && <RecordView />}
          {activeView === 'library' && (
            <div className="text-slate-600 text-sm text-center mt-32">Flow Library</div>
          )}
          {activeView === 'runner' && (
            <div className="text-slate-600 text-sm text-center mt-32">Test Runner</div>
          )}
        </main>
      </div>
    </div>
  );
}
