import { useState } from 'react';
import { QAHome } from './QAHome';
import { RecordWizard } from './wizards/record/RecordWizard';
import { RunWizard } from './wizards/run/RunWizard';
import { EditWizard } from './wizards/edit/EditWizard';

type QARoute = 'home' | 'record' | 'run' | 'edit';

export function QAModeRouter() {
  const [route, setRoute] = useState<QARoute>('home');

  return (
    <>
      {route === 'home' && <QAHome onNavigate={setRoute} />}
      {route === 'record' && <RecordWizard onBack={() => setRoute('home')} />}
      {route === 'run' && <RunWizard onBack={() => setRoute('home')} />}
      {route === 'edit' && <EditWizard onBack={() => setRoute('home')} />}
    </>
  );
}
