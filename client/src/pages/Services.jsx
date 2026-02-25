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
  Server,
  FolderOpen,
  Globe,
  Save,
  Check,
  X,
  Plus,
  Trash2,
} from 'lucide-react';
import api from '../lib/api';

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

function ConfigEditorTab({ configName }) {
  const [data, setData] = useState(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [restartOnSave, setRestartOnSave] = useState(true);

  const [viewMode, setViewMode] = useState('structured'); // 'structured' or 'raw'

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.get(`/api/services/config/${configName}`);
      setData(res.data);
      setContent(res.data.content || '');
      setDirty(false);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [configName]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  // Simple key-value parser for sshd_config, vsftpd.conf, smb.conf
  const parseKV = (text) => {
    const lines = text.split('\n');
    const pairs = [];
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) return;
      // Match Key Value or Key=Value
      const match = trimmed.match(/^([a-zA-Z0-9_ ]+?)[\s=]+(.*)$/);
      if (match) {
        pairs.push({ key: match[1].trim(), value: match[2].trim(), lineIdx: i });
      }
    });
    return pairs;
  };

  const updateKV = (lineIdx, newKey, newValue) => {
    const lines = content.split('\n');
    const separator = configName === 'ssh' ? ' ' : '=';
    lines[lineIdx] = `${newKey}${separator}${newValue}`;
    setContent(lines.join('\n'));
    setDirty(true);
  };

  const addKV = (newKey, newValue) => {
    const lines = content.split('\n');
    const separator = configName === 'ssh' ? ' ' : '=';
    lines.push(`${newKey}${separator}${newValue}`);
    setContent(lines.join('\n'));
    setDirty(true);
  };

  const deleteKV = (lineIdx) => {
    const lines = content.split('\n');
    lines.splice(lineIdx, 1);
    setContent(lines.join('\n'));
    setDirty(true);
  };

  const isKV = ['ssh', 'ftp', 'smb'].includes(configName);
  const kvPairs = isKV ? parseKV(content) : [];
  const [editingIdx, setEditingIdx] = useState(null);
  const [editKey, setEditKey] = useState('');
  const [editVal, setEditVal] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const SCHEMAS = {
    ssh: [
      { key: 'Port', label: 'SSH Port', type: 'number', default: '22' },
      { key: 'PermitRootLogin', label: 'Permit Root Login', type: 'select', options: ['yes', 'no', 'prohibit-password'], default: 'prohibit-password' },
      { key: 'PasswordAuthentication', label: 'Password Authentication', type: 'toggle', on: 'yes', off: 'no', default: 'yes' },
      { key: 'PubkeyAuthentication', label: 'Public Key Authentication', type: 'toggle', on: 'yes', off: 'no', default: 'yes' },
      { key: 'X11Forwarding', label: 'X11 Forwarding', type: 'toggle', on: 'yes', off: 'no', default: 'no' },
    ],
    ftp: [
      { key: 'anonymous_enable', label: 'Allow Anonymous Login', type: 'toggle', on: 'YES', off: 'NO', default: 'NO' },
      { key: 'local_enable', label: 'Allow Local Users', type: 'toggle', on: 'YES', off: 'NO', default: 'YES' },
      { key: 'write_enable', label: 'Enable Write Access', type: 'toggle', on: 'YES', off: 'NO', default: 'YES' },
      { key: 'chroot_local_user', label: 'Chroot Local Users', type: 'toggle', on: 'YES', off: 'NO', default: 'YES' },
    ],
    smb: [
      { key: 'workgroup', label: 'Workgroup', type: 'text', default: 'SAMBA' },
      { key: 'server string', label: 'Server String', type: 'text', default: 'Samba Server' },
      { key: 'security', label: 'Security Mode', type: 'select', options: ['user', 'share', 'domain'], default: 'user' },
      { key: 'map to guest', label: 'Map to Guest', type: 'select', options: ['Never', 'Bad User', 'Bad Password'], default: 'Never' },
    ]
  };

  const getSetting = (key) => {
    const pair = kvPairs.find(p => p.key === key);
    return pair ? pair.value : '';
  };

  const setSetting = (key, value) => {
    const pair = kvPairs.find(p => p.key === key);
    if (pair) {
      updateKV(pair.lineIdx, key, value);
    } else {
      addKV(key, value);
    }
  };

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.put(`/api/services/config/${configName}`, {
        content,
        restart: restartOnSave,
      });
      if (res.data.warning) {
        setSuccess(res.data.warning);
      } else {
        setSuccess(`Config saved${restartOnSave ? ' & service restarted' : ''}`);
      }
      setDirty(false);
      // Refresh to pick up any service status changes
      setTimeout(fetchConfig, 1500);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleServiceAction(action) {
    try {
      await api.post('/api/services/action', { unit: data.service, action });
      setSuccess(`Service ${action} successful`);
      setTimeout(fetchConfig, 1500);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gb-fg4 mt-8">
        <Activity size={18} className="animate-pulse" /> Loading config…
      </div>
    );
  }

  const labels = { ssh: 'SSH', smb: 'Samba (SMB)', nfs: 'NFS', ftp: 'FTP (vsftpd)' };

  return (
    <div>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-black uppercase text-gb-fg1">{labels[configName] || configName} Config</h2>
          {data && (
            <>
              <span className={`flex items-center gap-1.5 text-xs font-bold uppercase ${
                data.serviceActive ? 'text-gb-green' : 'text-gb-red'
              }`}>
                <span className={`w-2 h-2 ${data.serviceActive ? 'bg-gb-green' : 'bg-gb-red'}`} />
                {data.serviceActive ? 'Running' : 'Stopped'}
              </span>
              <span className="text-xs text-gb-fg4 font-mono">{data.path}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {data?.installed && (
            <>
              <button
                onClick={() => handleServiceAction(data.serviceActive ? 'restart' : 'start')}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-bg3 bg-gb-bg1 text-gb-green hover:bg-gb-bg2 transition-colors"
              >
                {data.serviceActive ? <RotateCcw size={14} /> : <Play size={14} />}
                {data.serviceActive ? 'Restart' : 'Start'}
              </button>
              {data.serviceActive && (
                <button
                  onClick={() => handleServiceAction('stop')}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-bg3 bg-gb-bg1 text-gb-red hover:bg-gb-bg2 transition-colors"
                >
                  <Square size={14} /> Stop
                </button>
              )}
            </>
          )}
          <button onClick={fetchConfig}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-gb-red bg-gb-bg1 border-2 border-gb-red-dim p-3 mb-4 text-sm">
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-gb-fg4 hover:text-gb-fg1">✕</button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-gb-green bg-gb-bg1 border-2 border-gb-green-dim p-3 mb-4 text-sm">
          <Check size={16} /> {success}
          <button onClick={() => setSuccess(null)} className="ml-auto text-gb-fg4 hover:text-gb-fg1">✕</button>
        </div>
      )}

      {!data?.installed ? (
        <div className="bg-gb-bg1 border-2 border-gb-bg3 p-6 text-center">
          <AlertCircle size={32} className="mx-auto mb-3 text-gb-fg4" />
          <p className="text-gb-fg3 mb-1">
            {labels[configName]} is not installed on this system.
          </p>
          <p className="text-gb-fg4 text-sm">
            Config file not found at <span className="font-mono">{data?.path}</span>
          </p>
        </div>
      ) : (
        <>
          {/* Editor */}
          <div className="bg-gb-bg0 border-2 border-gb-bg2">
            <div className="flex items-center justify-between px-4 py-2 border-b-2 border-gb-bg2">
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold text-gb-fg3 uppercase">
                  {data.path}
                  {dirty && <span className="text-gb-yellow ml-2">● Modified</span>}
                </span>
                {isKV && (
                  <div className="flex items-center gap-2 bg-gb-bg1 border-2 border-gb-bg3 p-0.5">
                    <button onClick={() => setViewMode('structured')} className={`px-2 py-1 text-xs font-bold uppercase ${viewMode === 'structured' ? 'bg-gb-aqua text-gb-bg0-hard' : 'text-gb-fg4 hover:text-gb-fg1'}`}>Structured</button>
                    <button onClick={() => setViewMode('raw')} className={`px-2 py-1 text-xs font-bold uppercase ${viewMode === 'raw' ? 'bg-gb-aqua text-gb-bg0-hard' : 'text-gb-fg4 hover:text-gb-fg1'}`}>Raw</button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-gb-fg3 cursor-pointer">
                  <input type="checkbox" checked={restartOnSave} onChange={(e) => setRestartOnSave(e.target.checked)}
                    className="accent-gb-aqua" />
                  Restart on save
                </label>
                <button onClick={handleSave} disabled={!dirty || saving}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-aqua-dim bg-gb-aqua text-gb-bg0-hard hover:opacity-90 transition-colors disabled:opacity-30">
                  <Save size={14} /> {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            
            {isKV && viewMode === 'structured' ? (
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gb-fg1 uppercase">Configuration Settings</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  {SCHEMAS[configName]?.map((field) => {
                    const val = getSetting(field.key) || field.default;
                    return (
                      <div key={field.key} className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gb-fg3 uppercase">{field.label}</label>
                        {field.type === 'toggle' ? (
                          <button
                            onClick={() => setSetting(field.key, val === field.on ? field.off : field.on)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              val === field.on ? 'bg-gb-green' : 'bg-gb-bg3'
                            }`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-gb-bg0 transition-transform ${
                              val === field.on ? 'translate-x-6' : 'translate-x-1'
                            }`} />
                          </button>
                        ) : field.type === 'select' ? (
                          <select
                            value={val}
                            onChange={(e) => setSetting(field.key, e.target.value)}
                            className="px-3 py-1.5 bg-gb-bg0 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none"
                          >
                            {field.options.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.type}
                            value={val}
                            onChange={(e) => setSetting(field.key, e.target.value)}
                            className="px-3 py-1.5 bg-gb-bg0 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between mb-4 border-t-2 border-gb-bg2 pt-4">
                  <h3 className="text-sm font-bold text-gb-fg1 uppercase">Advanced Settings</h3>
                  <button onClick={() => { setShowAdd(true); setEditKey(''); setEditVal(''); }} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-green-dim bg-gb-green text-gb-bg0-hard hover:opacity-90 transition-colors">
                    <Plus size={14} /> Add Setting
                  </button>
                </div>
                
                <table className="w-full text-sm border-2 border-gb-bg2">
                  <thead>
                    <tr className="border-b-2 border-gb-bg2 bg-gb-bg1">
                      <th className="text-left px-4 py-2 font-bold text-gb-fg3 uppercase text-xs w-1/3">Key</th>
                      <th className="text-left px-4 py-2 font-bold text-gb-fg3 uppercase text-xs">Value</th>
                      <th className="text-center px-4 py-2 font-bold text-gb-fg3 uppercase text-xs w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {showAdd && (
                      <tr className="border-b border-gb-bg2 bg-gb-bg1">
                        <td className="px-4 py-2">
                          <input value={editKey} onChange={(e) => setEditKey(e.target.value)} className="w-full px-2 py-1 bg-gb-bg0 border-2 border-gb-bg3 text-gb-fg1 text-xs focus:border-gb-aqua outline-none font-mono" placeholder="Key" />
                        </td>
                        <td className="px-4 py-2">
                          <input value={editVal} onChange={(e) => setEditVal(e.target.value)} className="w-full px-2 py-1 bg-gb-bg0 border-2 border-gb-bg3 text-gb-fg1 text-xs focus:border-gb-aqua outline-none font-mono" placeholder="Value" />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => { addKV(editKey, editVal); setShowAdd(false); }} className="p-1 text-gb-green hover:text-gb-green-dim transition-colors" title="Save"><Check size={16} /></button>
                            <button onClick={() => setShowAdd(false)} className="p-1 text-gb-red hover:text-gb-red-dim transition-colors" title="Cancel"><X size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {kvPairs.filter(p => !SCHEMAS[configName]?.find(f => f.key === p.key)).map((pair, i) => (
                      <tr key={i} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                        {editingIdx === pair.lineIdx ? (
                          <>
                            <td className="px-4 py-2">
                              <input value={editKey} onChange={(e) => setEditKey(e.target.value)} className="w-full px-2 py-1 bg-gb-bg0 border-2 border-gb-bg3 text-gb-fg1 text-xs focus:border-gb-aqua outline-none font-mono" />
                            </td>
                            <td className="px-4 py-2">
                              <input value={editVal} onChange={(e) => setEditVal(e.target.value)} className="w-full px-2 py-1 bg-gb-bg0 border-2 border-gb-bg3 text-gb-fg1 text-xs focus:border-gb-aqua outline-none font-mono" />
                            </td>
                            <td className="px-4 py-2 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => { updateKV(pair.lineIdx, editKey, editVal); setEditingIdx(null); }} className="p-1 text-gb-green hover:text-gb-green-dim transition-colors" title="Save"><Check size={16} /></button>
                                <button onClick={() => setEditingIdx(null)} className="p-1 text-gb-red hover:text-gb-red-dim transition-colors" title="Cancel"><X size={16} /></button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-2.5 text-gb-fg1 font-bold font-mono">{pair.key}</td>
                            <td className="px-4 py-2.5 text-gb-fg3 font-mono">{pair.value}</td>
                            <td className="px-4 py-2.5 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => { setEditingIdx(pair.lineIdx); setEditKey(pair.key); setEditVal(pair.value); }} className="p-1 text-gb-fg4 hover:text-gb-aqua transition-colors" title="Edit"><Cog size={14} /></button>
                                <button onClick={() => deleteKV(pair.lineIdx)} className="p-1 text-gb-fg4 hover:text-gb-red transition-colors" title="Delete"><Trash2 size={14} /></button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {kvPairs.filter(p => !SCHEMAS[configName]?.find(f => f.key === p.key)).length === 0 && !showAdd && (
                      <tr><td colSpan={3} className="px-4 py-6 text-center text-gb-fg4">No advanced settings found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <textarea
                value={content}
                onChange={(e) => { setContent(e.target.value); setDirty(true); }}
                spellCheck={false}
                className="w-full min-h-125 p-4 bg-gb-bg0-hard text-gb-fg1 font-mono text-xs leading-relaxed resize-y focus:outline-none"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Main Services Page ──────────────────────────────────────────── */

const VALID_TABS = ['services', 'processes', 'ssh', 'smb', 'nfs', 'ftp'];

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
        <button
          onClick={() => setTab('smb')}
          className={`px-4 py-2 text-sm font-bold uppercase border-2 transition-colors ${
            tab === 'smb'
              ? 'bg-gb-bg1 text-gb-orange border-gb-orange-dim'
              : 'bg-gb-bg0 text-gb-fg4 border-gb-bg3 hover:text-gb-fg1 hover:bg-gb-bg1'
          }`}
        >
          <span className="flex items-center gap-2"><FolderOpen size={16} />SMB</span>
        </button>
        <button
          onClick={() => setTab('nfs')}
          className={`px-4 py-2 text-sm font-bold uppercase border-2 transition-colors ${
            tab === 'nfs'
              ? 'bg-gb-bg1 text-gb-purple border-gb-purple-dim'
              : 'bg-gb-bg0 text-gb-fg4 border-gb-bg3 hover:text-gb-fg1 hover:bg-gb-bg1'
          }`}
        >
          <span className="flex items-center gap-2"><Server size={16} />NFS</span>
        </button>
        <button
          onClick={() => setTab('ftp')}
          className={`px-4 py-2 text-sm font-bold uppercase border-2 transition-colors ${
            tab === 'ftp'
              ? 'bg-gb-bg1 text-gb-blue border-gb-blue-dim'
              : 'bg-gb-bg0 text-gb-fg4 border-gb-bg3 hover:text-gb-fg1 hover:bg-gb-bg1'
          }`}
        >
          <span className="flex items-center gap-2"><Globe size={16} />FTP</span>
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

{/* ── Config tabs (SSH, SMB, NFS, FTP) ──────────────────── */}
      {['ssh', 'smb', 'nfs', 'ftp'].includes(tab) ? (
        <ConfigEditorTab configName={tab} />
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
