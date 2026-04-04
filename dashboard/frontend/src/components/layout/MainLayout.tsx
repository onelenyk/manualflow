import { useState } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { RecordView } from '../recording/RecordView';
import { AgentView } from '../agent/AgentView';

export function MainLayout() {
  const [activeView, setActiveView] = useState('stream');

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
        <main className="flex-1 overflow-hidden p-4">
          {activeView === 'stream' && <RecordView />}
          {activeView === 'agent' && <AgentView />}
        </main>
      </div>
    </div>
  );
}
