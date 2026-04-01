const navItems = [
  { id: 'record', label: 'Record', icon: '⏺' },
  { id: 'library', label: 'Library', icon: '📁' },
  { id: 'runner', label: 'Runner', icon: '▶' },
];

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  return (
    <aside className="w-48 bg-slate-900 border-r border-slate-700 flex flex-col p-3 gap-1">
      <div className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 px-2">
        Navigation
      </div>
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onViewChange(item.id)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeView === item.id
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <span>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </aside>
  );
}
