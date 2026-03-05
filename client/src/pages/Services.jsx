import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Cog,
  Play,
  Square,
  RotateCcw,
  Activity,
  Skull,
  Search,
  ChevronDown,
  ChevronUp,
  FileText,
  RefreshCw,
  AlertCircle,
  Cpu,
  Shield,
} from 'lucide-react';
import api from '../lib/api';
import ConfigEditorTab from '../components/ConfigEditorTab';

/* ── Helpers ─────────────────────────────────────────────────────── */

function SectionHeader({ icon: Icon, title, color = 'text-gb-aqua', children }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon size={20} className={color} />
        <h2 className="text-lg font-black uppercase tracking-tight text-gb-fg1">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ active, sub }) {
  const colors = {
    active: 'text-gb-green border-gb-green-dim',
    inactive: 'text-gb-fg4 border-gb-bg3',
    failed: 'text-gb-red border-gb-red-dim',
    activating: 'text-gb-yellow border-gb-yellow-dim',
    deactivating: 'text-gb-orange border-gb-orange-dim',
  };
  const cls = colors[active] || colors.inactive;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold uppercase border-2 ${cls}`}>
      {active}{sub ? ` (${sub})` : ''}
    </span>
  );
}

/* ── Journal Viewer ──────────────────────────────────────────────── */

function JournalViewer({ unit, onClose }) {
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/api/services/journal/${encodeURIComponent(unit)}?lines=100`)
      .then((res) => setLog(res.data.lines))
      .catch(() => setLog('Failed to load journal'))
      .finally(() => setLoading(false));
  }, [unit]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gb-bg0 border-2 border-gb-bg3 w-200 max-h-[80vh] shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-gb-bg2">
          <h3 className="text-sm font-black uppercase text-gb-fg1">
            Journal — <span className="text-gb-aqua">{unit}</span>
          </h3>
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs font-bold border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg3 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-gb-fg4">
              <Activity size={16} className="animate-pulse" />
              Loading…
            </div>
          ) : (
            <pre className="text-xs text-gb-fg2 font-mono whitespace-pre-wrap break-all leading-relaxed">
              {log}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Config Editor Tab ────────────────────────────────────────────── */

// ConfigEditorTab is now imported from ../components/ConfigEditorTab

/* ── Main Services Page ──────────────────────────────────────────── */

const VALID_TABS = ['services', 'processes', 'ssh'];

export default function Services() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, _setTab] = useState(() => searchParams.get('tab') || 'services');
  const setTab = (t) => { _setTab(t); setSearchParams({ tab: t }, { replace: true }); };

  // Sync tab when sidebar navigates with ?tab=
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && VALID_TABS.includes(t)) _setTab(t);
  }, [searchParams]);
  const [units, setUnits] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [journalUnit, setJournalUnit] = useState(null);
  const [sortField, setSortField] = useState('cpu');
  const [sortDir, setSortDir] = useState('desc');
  const [actionLoading, setActionLoading] = useState(null);

  const fetchServices = useCallback(async () => {
    try {
      const res = await api.get('/api/services/units');
      setUnits(res.data.units || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const fetchProcesses = useCallback(async () => {
    try {
      const res = await api.get('/api/services/processes');
      setProcesses(res.data.processes || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const promise = tab === 'services' ? fetchServices() : fetchProcesses();
    promise.finally(() => setLoading(false));
  }, [tab, fetchServices, fetchProcesses]);

  async function handleServiceAction(unit, action) {
    setActionLoading(`${unit}-${action}`);
    try {
      await api.post('/api/services/action', { unit, action });
      // Brief delay for systemd to process
      setTimeout(() => {
        fetchServices();
        setActionLoading(null);
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setActionLoading(null);
    }
  }

  async function handleKill(pid) {
    if (!confirm(`Kill process ${pid}?`)) return;
    try {
      await api.post('/api/services/kill', { pid, signal: 'TERM' });
      setTimeout(fetchProcesses, 500);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  // Filter & sort
  const filteredUnits = units.filter(
    (u) =>
      u.unit.toLowerCase().includes(search.toLowerCase()) ||
      u.description.toLowerCase().includes(search.toLowerCase())
  );

  const filteredProcesses = [...processes]
    .filter(
      (p) =>
        p.command.toLowerCase().includes(search.toLowerCase()) ||
        p.user.toLowerCase().includes(search.toLowerCase()) ||
        String(p.pid).includes(search)
    )
    .sort((a, b) => {
      const m = sortDir === 'asc' ? 1 : -1;
      if (sortField === 'cpu') return (a.cpu - b.cpu) * m;
      if (sortField === 'mem') return (a.mem - b.mem) * m;
      if (sortField === 'pid') return (a.pid - b.pid) * m;
      return 0;
    });

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight mb-6 text-gb-fg1">
        Services & Processes
      </h1>

      {/* ── Tab bar ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setTab('services')}
          className={`px-4 py-2 text-sm font-bold uppercase border-2 transition-colors ${
            tab === 'services'
              ? 'bg-gb-bg1 text-gb-aqua border-gb-aqua-dim'
              : 'bg-gb-bg0 text-gb-fg4 border-gb-bg3 hover:text-gb-fg1 hover:bg-gb-bg1'
          }`}
        >
          <span className="flex items-center gap-2"><Cog size={16} />Systemd Units</span>
        </button>
        <button
          onClick={() => setTab('processes')}
          className={`px-4 py-2 text-sm font-bold uppercase border-2 transition-colors ${
            tab === 'processes'
              ? 'bg-gb-bg1 text-gb-aqua border-gb-aqua-dim'
              : 'bg-gb-bg0 text-gb-fg4 border-gb-bg3 hover:text-gb-fg1 hover:bg-gb-bg1'
          }`}
        >
          <span className="flex items-center gap-2"><Cpu size={16} />Processes</span>
        </button>

        <div className="w-px h-8 bg-gb-bg3 mx-1" />

        <button
          onClick={() => setTab('ssh')}
          className={`px-4 py-2 text-sm font-bold uppercase border-2 transition-colors ${
            tab === 'ssh'
              ? 'bg-gb-bg1 text-gb-green border-gb-green-dim'
              : 'bg-gb-bg0 text-gb-fg4 border-gb-bg3 hover:text-gb-fg1 hover:bg-gb-bg1'
          }`}
        >
          <span className="flex items-center gap-2"><Shield size={16} />SSH</span>
        </button>

        <div className="flex-1" />

        {/* Search — only for services/processes */}
        {(tab === 'services' || tab === 'processes') && (
          <>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gb-fg4" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter…"
                className="pl-9 pr-3 py-2 w-64 text-sm bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 focus:border-gb-aqua outline-none"
              />
            </div>

            <button
              onClick={() => {
                setLoading(true);
                (tab === 'services' ? fetchServices() : fetchProcesses()).finally(() => setLoading(false));
              }}
              className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors"
            >
              <RefreshCw size={14} />
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-gb-red bg-gb-bg1 border-2 border-gb-red-dim p-3 mb-4 text-sm">
          <AlertCircle size={16} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-gb-fg4 hover:text-gb-fg1">✕</button>
        </div>
      )}

{/* ── Config tab (SSH) ────────────────────────────────── */}
      {tab === 'ssh' ? (
        <ConfigEditorTab configName="ssh" />
      ) : loading ? (
        <div className="flex items-center gap-2 text-gb-fg4 mt-8">
          <Activity size={18} className="animate-pulse" />
          Loading…
        </div>
      ) : tab === 'services' ? (
        /* ── Systemd Units Table ─────────────────────────────── */
        <div className="bg-gb-bg0 border-2 border-gb-bg2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gb-bg2">
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Unit</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Status</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Description</th>
                <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-48">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUnits.map((u) => (
                <tr key={u.unit} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                  <td className="px-4 py-2.5 text-gb-fg1 font-mono text-xs">{u.unit}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge active={u.active} sub={u.sub} />
                  </td>
                  <td className="px-4 py-2.5 text-gb-fg3">{u.description}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleServiceAction(u.unit, u.active === 'active' ? 'restart' : 'start')}
                        disabled={actionLoading === `${u.unit}-${u.active === 'active' ? 'restart' : 'start'}`}
                        className="p-1.5 text-gb-green hover:bg-gb-bg2 transition-colors disabled:opacity-50"
                        title={u.active === 'active' ? 'Restart' : 'Start'}
                      >
                        {u.active === 'active' ? <RotateCcw size={14} /> : <Play size={14} />}
                      </button>
                      <button
                        onClick={() => handleServiceAction(u.unit, 'stop')}
                        disabled={u.active !== 'active' || actionLoading === `${u.unit}-stop`}
                        className="p-1.5 text-gb-red hover:bg-gb-bg2 transition-colors disabled:opacity-30"
                        title="Stop"
                      >
                        <Square size={14} />
                      </button>
                      <button
                        onClick={() => setJournalUnit(u.unit)}
                        className="p-1.5 text-gb-blue hover:bg-gb-bg2 transition-colors"
                        title="View logs"
                      >
                        <FileText size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUnits.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gb-fg4">
                    No matching services found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : tab === 'processes' ? (
        /* ── Process Table ───────────────────────────────────── */
        <div className="bg-gb-bg0 border-2 border-gb-bg2 overflow-x-auto">
          <div className="px-4 py-2 border-b-2 border-gb-bg2 text-xs text-gb-fg4">
            {filteredProcesses.length} processes
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gb-bg2">
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">User</th>
                <th
                  className="text-right px-4 py-3 font-bold text-gb-fg3 uppercase text-xs cursor-pointer hover:text-gb-fg1"
                  onClick={() => toggleSort('pid')}
                >
                  <span className="flex items-center justify-end gap-1">PID <SortIcon field="pid" /></span>
                </th>
                <th
                  className="text-right px-4 py-3 font-bold text-gb-fg3 uppercase text-xs cursor-pointer hover:text-gb-fg1"
                  onClick={() => toggleSort('cpu')}
                >
                  <span className="flex items-center justify-end gap-1">%CPU <SortIcon field="cpu" /></span>
                </th>
                <th
                  className="text-right px-4 py-3 font-bold text-gb-fg3 uppercase text-xs cursor-pointer hover:text-gb-fg1"
                  onClick={() => toggleSort('mem')}
                >
                  <span className="flex items-center justify-end gap-1">%MEM <SortIcon field="mem" /></span>
                </th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Command</th>
                <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-16">—</th>
              </tr>
            </thead>
            <tbody>
              {filteredProcesses.slice(0, 200).map((p) => (
                <tr key={p.pid} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                  <td className="px-4 py-2 text-gb-fg3 text-xs">{p.user}</td>
                  <td className="px-4 py-2 text-gb-fg1 text-right font-mono text-xs">{p.pid}</td>
                  <td className={`px-4 py-2 text-right font-mono text-xs ${p.cpu > 50 ? 'text-gb-red' : p.cpu > 10 ? 'text-gb-yellow' : 'text-gb-fg3'}`}>
                    {p.cpu.toFixed(1)}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono text-xs ${p.mem > 50 ? 'text-gb-red' : p.mem > 10 ? 'text-gb-yellow' : 'text-gb-fg3'}`}>
                    {p.mem.toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-gb-fg2 text-xs font-mono truncate max-w-md">{p.command}</td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => handleKill(p.pid)}
                      className="p-1 text-gb-fg4 hover:text-gb-red transition-colors"
                      title="Kill process"
                    >
                      <Skull size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* ── Journal Modal ──────────────────────────────────────── */}
      {journalUnit && (
        <JournalViewer unit={journalUnit} onClose={() => setJournalUnit(null)} />
      )}
    </div>
  );
}
