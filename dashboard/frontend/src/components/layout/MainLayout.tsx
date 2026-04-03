import { useState } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { RecordView } from '../recording/RecordView';
import { AgentView } from '../agent/AgentView';
import { DebugView } from '../debug/DebugView';

export function MainLayout() {
  const [activeView, setActiveView] = useState('record');

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
        <main className="flex-1 overflow-hidden p-4">
          {activeView === 'record' && <RecordView />}
          {activeView === 'agent' && <AgentView />}
          {activeView === 'debug' && <DebugView />}
        </main>
      </div>
    </div>
  );
}
