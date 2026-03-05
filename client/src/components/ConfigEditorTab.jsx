import { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  AlertCircle,
  Check,
  X,
  Plus,
  Trash2,
  Cog,
  Play,
  Square,
  RotateCcw,
  RefreshCw,
  Save,
} from 'lucide-react';
import api from '../lib/api';

/* ── Shared Config Editor Tab ────────────────────────────────────── */

export default function ConfigEditorTab({ configName }) {
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
