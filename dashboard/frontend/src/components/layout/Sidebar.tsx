const navItems = [
  { id: 'record', label: 'Record', icon: 'R' },
  { id: 'library', label: 'Library', icon: 'L' },
  { id: 'runner', label: 'Validator', icon: 'V' },
  { id: 'agent', label: 'Agent', icon: 'A' },
  { id: 'debug', label: 'Debug', icon: 'D' },
];

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  return (
    <aside className="w-12 bg-slate-900/80 border-r border-slate-800 flex flex-col items-center py-3 gap-2">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onViewChange(item.id)}
          title={item.label}
          className={`w-9 h-9 rounded-lg text-xs font-bold flex items-center justify-center transition-all ${
            activeView === item.id
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'text-slate-500 hover:text-white hover:bg-slate-800'
          }`}
        >
          {item.icon}
        </button>
      ))}
    </aside>
  );
}
