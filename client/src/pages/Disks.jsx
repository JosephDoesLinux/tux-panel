import { useEffect, useState, useCallback } from 'react';
import {
  HardDrive, Layers, Camera, Database, Share2,
  RefreshCw, Activity, AlertCircle, Search,
  ChevronDown, ChevronUp, Trash2, Plus, Check, X,
  FolderOpen, Server, Globe, Disc, CircuitBoard,
  Network, Thermometer,
} from 'lucide-react';
import api from '../lib/api';
import { formatBytes } from '../lib/utils';
import useTabSync from '../hooks/useTabSync';
import SemanticConfigForm from '../components/SemanticConfigForm';
import SectionHeader from '../components/shared/SectionHeader';
import UsageBar from '../components/shared/UsageBar';
import ConfirmModal from '../components/shared/ConfirmModal';

/* ── Modals ──────────────────────────────────────────────────────── */

function CreateSubvolumeModal({ onClose, onCreated, mount }) {
  const [path, setPath] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const fullPath = mount === '/' ? `/${path}` : `${mount}/${path}`.replace(/\/\//g, '/');
      await api.post('/api/disks/subvolumes', { path: fullPath });
      onCreated();
    } catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form onSubmit={handleSubmit} className="bg-gb-bg0 border-2 border-gb-bg3 p-6 w-110 shadow-xl">
        <h2 className="text-lg font-black text-gb-fg0 uppercase mb-4">Create Subvolume</h2>
        {error && <ErrorBox msg={error} />}
        <div className="mb-4">
          <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Path (relative to {mount})</label>
          <input required value={path} onChange={(e) => setPath(e.target.value)}
            className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono"
            placeholder="new_subvol" />
        </div>
        <div className="flex items-center justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg3 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-bold border-2 border-gb-green-dim bg-gb-green text-gb-bg0-hard hover:opacity-90 transition-colors disabled:opacity-50">
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CreateSnapshotModal({ onClose, onCreated, mount }) {
  const [source, setSource] = useState('');
  const [dest, setDest] = useState('');
  const [readonly, setReadonly] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await api.post('/api/disks/snapshots', { source, destination: dest, readonly });
      onCreated();
    } catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form onSubmit={handleSubmit} className="bg-gb-bg0 border-2 border-gb-bg3 p-6 w-110 shadow-xl">
        <h2 className="text-lg font-black text-gb-fg0 uppercase mb-4">Create Snapshot</h2>
        {error && <ErrorBox msg={error} />}
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Source Subvolume Path</label>
            <input required value={source} onChange={(e) => setSource(e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono"
              placeholder="/path/to/subvol" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Destination Snapshot Path</label>
            <input required value={dest} onChange={(e) => setDest(e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono"
              placeholder="/path/to/snapshot" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gb-fg2 cursor-pointer">
            <input type="checkbox" checked={readonly} onChange={(e) => setReadonly(e.target.checked)} className="accent-gb-aqua" />
            Read-only snapshot
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg3 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-bold border-2 border-gb-orange-dim bg-gb-orange text-gb-bg0-hard hover:opacity-90 transition-colors disabled:opacity-50">
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

function MountModal({ onClose, onCreated }) {
  const [device, setDevice] = useState('');
  const [mountpoint, setMountpoint] = useState('');
  const [fstype, setFstype] = useState('');
  const [options, setOptions] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await api.post('/api/disks/mounts', { device, mountpoint, fstype: fstype || undefined, options: options || undefined });
      onCreated();
    } catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form onSubmit={handleSubmit} className="bg-gb-bg0 border-2 border-gb-bg3 p-6 w-110 shadow-xl">
        <h2 className="text-lg font-black text-gb-fg0 uppercase mb-4">Mount Filesystem</h2>
        {error && <ErrorBox msg={error} />}
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Device</label>
            <input required value={device} onChange={(e) => setDevice(e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono"
              placeholder="/dev/sda1" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Mount Point</label>
            <input required value={mountpoint} onChange={(e) => setMountpoint(e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono"
              placeholder="/mnt/data" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">FS Type</label>
              <input value={fstype} onChange={(e) => setFstype(e.target.value)}
                className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono"
                placeholder="auto" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Options</label>
              <input value={options} onChange={(e) => setOptions(e.target.value)}
                className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono"
                placeholder="defaults" />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg3 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-bold border-2 border-gb-purple-dim bg-gb-purple text-gb-bg0-hard hover:opacity-90 transition-colors disabled:opacity-50">
            {saving ? 'Mounting…' : 'Mount'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CreateSmbShareModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', path: '', comment: '', browseable: true, readOnly: false, guestOk: false, validUsers: '' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  function update(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await api.post('/api/disks/shares/smb', form);
      onCreated();
    } catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form onSubmit={handleSubmit} className="bg-gb-bg0 border-2 border-gb-bg3 p-6 w-120 shadow-xl max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-black text-gb-fg0 uppercase mb-4">Create SMB Share</h2>
        {error && <ErrorBox msg={error} />}
        <div className="space-y-3 mb-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Share Name</label>
              <input required value={form.name} onChange={(e) => update('name', e.target.value)}
                className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none" placeholder="myshare" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Path</label>
              <input required value={form.path} onChange={(e) => update('path', e.target.value)}
                className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono" placeholder="/srv/samba/share" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Comment</label>
            <input value={form.comment} onChange={(e) => update('comment', e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none" placeholder="Optional description" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Valid Users</label>
            <input value={form.validUsers} onChange={(e) => update('validUsers', e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none" placeholder="@group or user1 user2 (blank = all)" />
          </div>
          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2 text-sm text-gb-fg2 cursor-pointer">
              <input type="checkbox" checked={form.browseable} onChange={(e) => update('browseable', e.target.checked)} className="accent-gb-aqua" />
              Browseable
            </label>
            <label className="flex items-center gap-2 text-sm text-gb-fg2 cursor-pointer">
              <input type="checkbox" checked={form.readOnly} onChange={(e) => update('readOnly', e.target.checked)} className="accent-gb-aqua" />
              Read Only
            </label>
            <label className="flex items-center gap-2 text-sm text-gb-fg2 cursor-pointer">
              <input type="checkbox" checked={form.guestOk} onChange={(e) => update('guestOk', e.target.checked)} className="accent-gb-aqua" />
              Guest Access
            </label>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg3 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-bold border-2 border-gb-orange-dim bg-gb-orange text-gb-bg0-hard hover:opacity-90 transition-colors disabled:opacity-50">
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CreateNfsExportModal({ onClose, onCreated }) {
  const [path, setPath] = useState('');
  const [clients, setClients] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await api.post('/api/disks/shares/nfs', { path, clients });
      onCreated();
    } catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form onSubmit={handleSubmit} className="bg-gb-bg0 border-2 border-gb-bg3 p-6 w-110 shadow-xl">
        <h2 className="text-lg font-black text-gb-fg0 uppercase mb-4">Create NFS Export</h2>
        {error && <ErrorBox msg={error} />}
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Export Path</label>
            <input required value={path} onChange={(e) => setPath(e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono" placeholder="/srv/nfs/data" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Clients & Options</label>
            <input required value={clients} onChange={(e) => setClients(e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono" placeholder="192.168.1.0/24(rw,sync,no_root_squash)" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg3 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-bold border-2 border-gb-green-dim bg-gb-green text-gb-bg0-hard hover:opacity-90 transition-colors disabled:opacity-50">
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Tab Definitions (8→4 consolidation) ─────────────────────────── */

const TABS = [
  { key: 'drives',    label: 'Drives',    icon: HardDrive },
  { key: 'structure', label: 'Structure', icon: Layers },
  { key: 'mounts',    label: 'Mounts',    icon: Database },
  { key: 'sharing',   label: 'Sharing',   icon: Share2 },
];

/* ── Device type icon helper ─────────────────────────────────────── */

function DeviceIcon({ type }) {
  if (type === 'disk') return <HardDrive size={14} className="text-gb-blue" />;
  if (type === 'part') return <Disc size={14} className="text-gb-fg4" />;
  if (type === 'lvm' || type === 'dm') return <CircuitBoard size={14} className="text-gb-purple" />;
  if (type === 'loop') return <Disc size={14} className="text-gb-bg4" />;
  return <HardDrive size={14} className="text-gb-fg4" />;
}

function BtrfsBadge({ fstype }) {
  if (fstype !== 'btrfs') return null;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase border border-gb-green-dim text-gb-green bg-gb-bg1 ml-2">
      BTRFS
    </span>
  );
}

/* ── DrivesTab ───────────────────────────────────────────────────── */

function DrivesTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedDisk, setExpandedDisk] = useState(null);
  const [smartOutput, setSmartOutput] = useState(null);
  const [smartLoading, setSmartLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/disks/block');
      setData(res.data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  async function fetchSmart(device) {
    setSmartLoading(true);
    setSmartOutput(null);
    try {
      const res = await api.get(`/api/diagnostics/smart/${encodeURIComponent(device)}`);
      setSmartOutput(res.data.output || res.data.error || 'No SMART data');
    } catch (err) {
      setSmartOutput(err.response?.data?.error || err.message);
    } finally {
      setSmartLoading(false);
    }
  }

  function toggleDiskExpand(name) {
    if (expandedDisk === name) {
      setExpandedDisk(null);
      setSmartOutput(null);
    } else {
      setExpandedDisk(name);
      setSmartOutput(null);
      fetchSmart(name);
    }
  }

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox msg={error} />;

  const { blockDevices = [], filesystems = [] } = data || {};

  // Flatten block devices into rows with depth info
  const flatDevices = [];
  for (const dev of blockDevices) {
    flatDevices.push({ ...dev, _level: 0 });
    if (dev.children) {
      for (const child of dev.children) {
        flatDevices.push({ ...child, _level: 1, _parent: dev.name });
        if (child.children) {
          for (const gc of child.children) {
            flatDevices.push({ ...gc, _level: 2, _parent: dev.name });
          }
        }
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Block Devices */}
      <div>
        <SectionHeader icon={HardDrive} title="Block Devices" color="text-gb-blue">
          <button onClick={fetch_} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors">
            <RefreshCw size={14} /> Refresh
          </button>
        </SectionHeader>

        <div className="bg-gb-bg0 border-2 border-gb-bg2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gb-bg2">
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-8" />
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Device</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Type</th>
                <th className="text-right px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Size</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">FS Type</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Mount</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Label</th>
                <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-20">Health</th>
              </tr>
            </thead>
            <tbody>
              {flatDevices.map((dev, i) => {
                const mount = dev.mountpoint || dev.mountpoints?.filter(Boolean).join(', ') || '';
                const isDisk = dev.type === 'disk' && dev._level === 0;
                const isExpanded = expandedDisk === dev.name;

                return [
                  <tr key={`${dev.name}-${i}`} className={`border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors ${isDisk ? 'cursor-pointer' : ''}`}
                    onClick={isDisk ? () => toggleDiskExpand(dev.name) : undefined}>
                    <td className="px-4 py-2.5">
                      <DeviceIcon type={dev.type} />
                    </td>
                    <td className="px-4 py-2.5 text-gb-fg1 font-mono">
                      <span style={{ paddingLeft: dev._level * 20 }}>
                        {dev._level > 0 ? '└ ' : ''}{dev.name}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-bold uppercase text-gb-fg3">{dev.type}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gb-fg1 text-right font-mono">{formatBytes(dev.size)}</td>
                    <td className="px-4 py-2.5 text-gb-fg3">
                      {dev.fstype || '—'}
                      <BtrfsBadge fstype={dev.fstype} />
                    </td>
                    <td className="px-4 py-2.5 text-gb-fg3 font-mono text-xs">{mount || '—'}</td>
                    <td className="px-4 py-2.5 text-gb-fg3">{dev.label || '—'}</td>
                    <td className="px-4 py-2.5 text-center">
                      {isDisk && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleDiskExpand(dev.name); }}
                          className="p-1 text-gb-fg4 hover:text-gb-aqua transition-colors" title="SMART Health"
                        >
                          <Thermometer size={14} />
                        </button>
                      )}
                    </td>
                  </tr>,
                  isDisk && isExpanded && (
                    <tr key={`${dev.name}-smart`} className="border-b border-gb-bg2 bg-gb-bg1/50">
                      <td colSpan={8} className="px-6 py-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Thermometer size={16} className="text-gb-aqua" />
                          <span className="text-xs font-black uppercase text-gb-fg1">SMART Health — {dev.name}</span>
                        </div>
                        {smartLoading ? (
                          <div className="flex items-center gap-2 text-gb-fg4 text-sm">
                            <Activity size={14} className="animate-pulse" /> Checking…
                          </div>
                        ) : (
                          <pre className="text-xs text-gb-fg2 font-mono whitespace-pre-wrap max-h-48 overflow-auto bg-gb-bg0 border border-gb-bg2 p-3">
                            {smartOutput || 'No data'}
                          </pre>
                        )}
                      </td>
                    </tr>
                  ),
                ];
              })}
              {flatDevices.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-gb-fg4">No block devices found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filesystems with usage bars */}
      <div>
        <SectionHeader icon={Database} title="Filesystems" color="text-gb-purple" />
        <div className="bg-gb-bg0 border-2 border-gb-bg2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gb-bg2">
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Source</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Type</th>
                <th className="text-right px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Size</th>
                <th className="text-right px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Used</th>
                <th className="text-right px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Avail</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-36">Usage</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Mount</th>
              </tr>
            </thead>
            <tbody>
              {filesystems.map((fs, i) => (
                <tr key={i} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                  <td className="px-4 py-2.5 text-gb-fg1 font-mono text-xs">{fs.source}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-bold uppercase ${
                      fs.fstype === 'btrfs' ? 'text-gb-green' : fs.fstype === 'ext4' ? 'text-gb-blue' : 'text-gb-fg3'
                    }`}>{fs.fstype}</span>
                    <BtrfsBadge fstype={fs.fstype} />
                  </td>
                  <td className="px-4 py-2.5 text-gb-fg1 text-right font-mono text-xs">{fs.size}</td>
                  <td className="px-4 py-2.5 text-gb-fg1 text-right font-mono text-xs">{fs.used}</td>
                  <td className="px-4 py-2.5 text-gb-fg1 text-right font-mono text-xs">{fs.avail}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <UsageBar percent={fs.usePercent} />
                      <span className="text-xs text-gb-fg3 font-mono w-10 text-right">{fs.usePercent}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gb-fg3 font-mono text-xs">{fs.mountpoint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── StructureTab (Subvolumes + Snapshots) ───────────────────────── */

function StructureTab() {
  const [subData, setSubData] = useState(null);
  const [subLoading, setSubLoading] = useState(true);
  const [subError, setSubError] = useState(null);
  const [mount, setMount] = useState('/');
  const [subSearch, setSubSearch] = useState('');
  const [showCreateSub, setShowCreateSub] = useState(false);
  const [deleteSubConfirm, setDeleteSubConfirm] = useState(null);

  const [snapData, setSnapData] = useState(null);
  const [snapLoading, setSnapLoading] = useState(true);
  const [snapError, setSnapError] = useState(null);
  const [showCreateSnap, setShowCreateSnap] = useState(false);
  const [deleteSnapConfirm, setDeleteSnapConfirm] = useState(null);

  const fetchSub = useCallback(async () => {
    setSubLoading(true); setSubError(null);
    try {
      const res = await api.get(`/api/disks/subvolumes?mount=${encodeURIComponent(mount)}`);
      setSubData(res.data);
      if (res.data.error) setSubError(res.data.error);
    } catch (err) { setSubError(err.message); }
    finally { setSubLoading(false); }
  }, [mount]);

  const fetchSnap = useCallback(async () => {
    setSnapLoading(true); setSnapError(null);
    try {
      const res = await api.get(`/api/disks/snapshots?mount=${encodeURIComponent(mount)}`);
      setSnapData(res.data);
      if (res.data.error) setSnapError(res.data.error);
    } catch (err) { setSnapError(err.message); }
    finally { setSnapLoading(false); }
  }, [mount]);

  useEffect(() => { fetchSub(); fetchSnap(); }, [fetchSub, fetchSnap]);

  async function handleDeleteSub(path) {
    try {
      await api.delete('/api/disks/subvolumes', { data: { path } });
      setDeleteSubConfirm(null); fetchSub();
    } catch (err) { setSubError(err.response?.data?.error || err.message); }
  }

  async function handleDeleteSnap(path) {
    try {
      await api.delete('/api/disks/snapshots', { data: { path } });
      setDeleteSnapConfirm(null); fetchSnap();
    } catch (err) { setSnapError(err.response?.data?.error || err.message); }
  }

  const subvolumes = (subData?.subvolumes || []).filter(sv => sv.path.toLowerCase().includes(subSearch.toLowerCase()));
  const snapshots = snapData?.snapshots || [];

  return (
    <div className="space-y-6">
      {/* Mount selector */}
      <div className="flex items-center gap-3 bg-gb-bg0 border-2 border-gb-bg2 px-4 py-3">
        <label className="text-xs font-bold text-gb-fg3 uppercase">BTRFS Mount:</label>
        <input value={mount} onChange={(e) => setMount(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (fetchSub(), fetchSnap())}
          className="w-40 px-2 py-1.5 text-sm bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 focus:border-gb-aqua outline-none font-mono" />
        <button onClick={() => { fetchSub(); fetchSnap(); }} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors">
          <RefreshCw size={14} /> Load
        </button>
      </div>

      {/* Subvolumes */}
      <div>
        <SectionHeader icon={Layers} title="Subvolumes" color="text-gb-green">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gb-fg4" />
              <input value={subSearch} onChange={(e) => setSubSearch(e.target.value)} placeholder="Filter…"
                className="pl-8 pr-3 py-1.5 w-48 text-xs bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 focus:border-gb-aqua outline-none" />
            </div>
            <button onClick={() => setShowCreateSub(true)} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-green-dim bg-gb-green text-gb-bg0-hard hover:opacity-90 transition-colors">
              <Plus size={14} /> Create
            </button>
          </div>
        </SectionHeader>

        {subError && <div className="flex items-center gap-2 text-gb-yellow bg-gb-bg1 border-2 border-gb-yellow-dim p-3 mb-3 text-sm"><AlertCircle size={16} />{subError}</div>}

        {subLoading ? <Spinner /> : (
          <div className="bg-gb-bg0 border-2 border-gb-bg2 overflow-x-auto">
            <div className="px-4 py-2 border-b-2 border-gb-bg2 text-xs text-gb-fg4">{subvolumes.length} subvolumes</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gb-bg2">
                  <th className="text-right px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-16">ID</th>
                  <th className="text-right px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-16">Gen</th>
                  <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Path</th>
                  <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-12" />
                </tr>
              </thead>
              <tbody>
                {subvolumes.map(sv => (
                  <tr key={sv.id} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                    <td className="px-4 py-2 text-gb-fg1 text-right font-mono text-xs">{sv.id}</td>
                    <td className="px-4 py-2 text-gb-fg3 text-right font-mono text-xs">{sv.gen}</td>
                    <td className="px-4 py-2 text-gb-fg1 font-mono text-xs">{sv.path}</td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => setDeleteSubConfirm(mount === '/' ? `/${sv.path}` : `${mount}/${sv.path}`.replace(/\/\//g, '/'))}
                        className="p-1 text-gb-fg4 hover:text-gb-red transition-colors"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
                {subvolumes.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-4 text-center text-gb-fg4 text-xs">
                    {subError ? 'Not a btrfs filesystem' : 'No subvolumes found'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Snapshots */}
      <div>
        <SectionHeader icon={Camera} title="Snapshots" color="text-gb-orange">
          <button onClick={() => setShowCreateSnap(true)} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-orange-dim bg-gb-orange text-gb-bg0-hard hover:opacity-90 transition-colors">
            <Plus size={14} /> Create
          </button>
        </SectionHeader>

        {snapError && <div className="flex items-center gap-2 text-gb-yellow bg-gb-bg1 border-2 border-gb-yellow-dim p-3 mb-3 text-sm"><AlertCircle size={16} />{snapError}</div>}

        {snapLoading ? <Spinner /> : (
          <div className="bg-gb-bg0 border-2 border-gb-bg2 overflow-x-auto">
            <div className="px-4 py-2 border-b-2 border-gb-bg2 text-xs text-gb-fg4">{snapshots.length} snapshots</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gb-bg2">
                  <th className="text-right px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-16">ID</th>
                  <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Path</th>
                  <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-40">Created</th>
                  <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-12" />
                </tr>
              </thead>
              <tbody>
                {snapshots.map(snap => (
                  <tr key={snap.id} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                    <td className="px-4 py-2 text-gb-fg1 text-right font-mono text-xs">{snap.id}</td>
                    <td className="px-4 py-2 text-gb-fg1 font-mono text-xs">{snap.path}</td>
                    <td className="px-4 py-2 text-gb-fg3 font-mono text-xs">{snap.otime}</td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => setDeleteSnapConfirm(mount === '/' ? `/${snap.path}` : `${mount}/${snap.path}`.replace(/\/\//g, '/'))}
                        className="p-1 text-gb-fg4 hover:text-gb-red transition-colors"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
                {snapshots.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-4 text-center text-gb-fg4 text-xs">
                    {snapError ? 'Not a btrfs filesystem' : 'No snapshots found'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreateSub && <CreateSubvolumeModal mount={mount} onClose={() => setShowCreateSub(false)} onCreated={() => { setShowCreateSub(false); fetchSub(); }} />}
      {showCreateSnap && <CreateSnapshotModal mount={mount} onClose={() => setShowCreateSnap(false)} onCreated={() => { setShowCreateSnap(false); fetchSnap(); }} />}
      <ConfirmModal open={!!deleteSubConfirm} title="Delete Subvolume?" message={deleteSubConfirm || ''} confirmText="Delete" variant="danger"
        onConfirm={() => handleDeleteSub(deleteSubConfirm)} onCancel={() => setDeleteSubConfirm(null)} />
      <ConfirmModal open={!!deleteSnapConfirm} title="Delete Snapshot?" message={deleteSnapConfirm || ''} confirmText="Delete" variant="danger"
        onConfirm={() => handleDeleteSnap(deleteSnapConfirm)} onCancel={() => setDeleteSnapConfirm(null)} />
    </div>
  );
}

/* ── MountsTab ───────────────────────────────────────────────────── */

function MountsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showMount, setShowMount] = useState(false);
  const [error, setError] = useState(null);
  const [unmountConfirm, setUnmountConfirm] = useState(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/disks/mounts');
      setData(res.data);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  async function handleUnmount(target) {
    setUnmountConfirm(null);
    try {
      await api.delete('/api/disks/mounts', { data: { target } });
      fetch_();
    } catch (err) { setError(err.response?.data?.error || err.message); }
  }

  const flatMounts = [];
  function flatten(nodes, level = 0) {
    if (!nodes) return;
    for (const n of nodes) {
      flatMounts.push({ ...n, _level: level });
      if (n.children) flatten(n.children, level + 1);
    }
  }
  flatten(data?.filesystems);

  const filtered = flatMounts.filter(m =>
    m.target?.toLowerCase().includes(search.toLowerCase()) ||
    m.source?.toLowerCase().includes(search.toLowerCase()) ||
    m.fstype?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <SectionHeader icon={Database} title="Active Mounts" color="text-gb-purple">
        <div className="flex items-center gap-2">
          <button onClick={fetch_} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => setShowMount(true)} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-purple-dim bg-gb-purple text-gb-bg0-hard hover:opacity-90 transition-colors">
            <Plus size={14} /> Mount
          </button>
        </div>
      </SectionHeader>

      {error && <div className="flex items-center gap-2 text-gb-yellow bg-gb-bg1 border-2 border-gb-yellow-dim p-3 mb-4 text-sm"><AlertCircle size={16} />{error}</div>}

      <div className="mb-3">
        <div className="relative inline-block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gb-fg4" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter mounts…"
            className="pl-9 pr-3 py-2 w-64 text-sm bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 focus:border-gb-aqua outline-none" />
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-gb-bg0 border-2 border-gb-bg2 overflow-x-auto">
          <div className="px-4 py-2 border-b-2 border-gb-bg2 text-xs text-gb-fg4">{filtered.length} mounts</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gb-bg2">
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Target</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Source</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-24">FS Type</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Options</th>
                <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-16" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, i) => (
                <tr key={i} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                  <td className="px-4 py-2.5 text-gb-fg1 font-mono">
                    <span style={{ paddingLeft: m._level * 16 }}>
                      {m._level > 0 ? '└ ' : ''}{m.target}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gb-fg3 font-mono text-xs">{m.source || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-bold uppercase ${
                      m.fstype === 'btrfs' ? 'text-gb-green' : m.fstype === 'ext4' ? 'text-gb-blue' : m.fstype === 'tmpfs' ? 'text-gb-fg4' : 'text-gb-fg3'
                    }`}>{m.fstype}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gb-fg4 font-mono text-xs max-w-md truncate">{m.options}</td>
                  <td className="px-4 py-2.5 text-center">
                    <button onClick={() => setUnmountConfirm(m.target)} className="p-1 text-gb-fg4 hover:text-gb-red transition-colors" title="Unmount">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showMount && <MountModal onClose={() => setShowMount(false)} onCreated={() => { setShowMount(false); fetch_(); }} />}
      <ConfirmModal open={!!unmountConfirm} title={`Unmount ${unmountConfirm}?`} message="This will detach the filesystem from the mount point."
        confirmText="Unmount" variant="warning" onConfirm={() => handleUnmount(unmountConfirm)} onCancel={() => setUnmountConfirm(null)} />
    </div>
  );
}

/* ── SharingTab (SMB + NFS shares + config forms) ────────────────── */

const SHARING_SUBS = [
  { key: 'shares',     label: 'Shares',     icon: Share2 },
  { key: 'smb-config', label: 'SMB Config', icon: FolderOpen },
  { key: 'nfs-config', label: 'NFS Config', icon: Server },
  { key: 'ftp-config', label: 'FTP Config', icon: Globe },
];

function SharingTab() {
  const [sub, setSub] = useState('shares');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSmbCreate, setShowSmbCreate] = useState(false);
  const [showNfsCreate, setShowNfsCreate] = useState(false);
  const [error, setError] = useState(null);
  const [deleteConfirmShare, setDeleteConfirmShare] = useState(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/disks/shares');
      setData(res.data);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (sub === 'shares') fetch_(); }, [fetch_, sub]);

  async function handleDeleteSmb(name) {
    setDeleteConfirmShare(null);
    try {
      await api.delete('/api/disks/shares/smb', { data: { name } });
      fetch_();
    } catch (err) { setError(err.response?.data?.error || err.message); }
  }

  async function handleDeleteNfs(path) {
    setDeleteConfirmShare(null);
    try {
      await api.delete('/api/disks/shares/nfs', { data: { path } });
      fetch_();
    } catch (err) { setError(err.response?.data?.error || err.message); }
  }

  const { smbShares = [], nfsExports = [], smbActive = false, nfsActive = false } = data || {};

  return (
    <div>
      {/* Inner sub-tabs */}
      <div className="flex items-center gap-1 mb-4 border-b-2 border-gb-bg2 pb-2 flex-wrap">
        {SHARING_SUBS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setSub(key)}
            className={`px-3 py-1.5 text-xs font-bold uppercase border-2 transition-colors ${
              sub === key
                ? 'bg-gb-bg1 text-gb-orange border-gb-orange-dim'
                : 'bg-gb-bg0 text-gb-fg4 border-transparent hover:text-gb-fg1 hover:border-gb-bg3'
            }`}>
            <span className="flex items-center gap-1.5"><Icon size={14} /> {label}</span>
          </button>
        ))}
      </div>

      {sub === 'shares' && (
        <div className="space-y-6">
          {error && <ErrorBox msg={error} />}

          {/* SMB Shares */}
          <div>
            <SectionHeader icon={FolderOpen} title="Samba (SMB) Shares" color="text-gb-orange">
              <div className="flex items-center gap-3">
                <ServiceStatus label="smbd" active={smbActive} />
                <button onClick={fetch_} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors">
                  <RefreshCw size={14} />
                </button>
                <button onClick={() => setShowSmbCreate(true)} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-orange-dim bg-gb-orange text-gb-bg0-hard hover:opacity-90 transition-colors">
                  <Plus size={14} /> Create
                </button>
              </div>
            </SectionHeader>

            {loading ? <Spinner /> : (
              <div className="bg-gb-bg0 border-2 border-gb-bg2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gb-bg2">
                      <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Name</th>
                      <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Path</th>
                      <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Comment</th>
                      <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Browse</th>
                      <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">RO</th>
                      <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Guest</th>
                      <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Users</th>
                      <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {smbShares.map(s => (
                      <tr key={s.name} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                        <td className="px-4 py-2.5 text-gb-fg1 font-bold">{s.name}</td>
                        <td className="px-4 py-2.5 text-gb-fg3 font-mono text-xs">{s.path}</td>
                        <td className="px-4 py-2.5 text-gb-fg3 text-xs">{s.comment || '—'}</td>
                        <td className="px-4 py-2.5 text-center">{s.browseable ? <Check size={14} className="text-gb-green mx-auto" /> : <X size={14} className="text-gb-fg4 mx-auto" />}</td>
                        <td className="px-4 py-2.5 text-center">{s.readOnly ? <Check size={14} className="text-gb-yellow mx-auto" /> : <X size={14} className="text-gb-fg4 mx-auto" />}</td>
                        <td className="px-4 py-2.5 text-center">{s.guestOk ? <Check size={14} className="text-gb-orange mx-auto" /> : <X size={14} className="text-gb-fg4 mx-auto" />}</td>
                        <td className="px-4 py-2.5 text-gb-fg3 text-xs">{s.validUsers || 'all'}</td>
                        <td className="px-4 py-2.5 text-center">
                          <button onClick={() => setDeleteConfirmShare({ type: 'smb', key: s.name })} className="p-1 text-gb-fg4 hover:text-gb-red transition-colors"><Trash2 size={12} /></button>
                        </td>
                      </tr>
                    ))}
                    {smbShares.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-4 text-center text-gb-fg4 text-xs">No Samba shares configured</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* NFS Exports */}
          <div>
            <SectionHeader icon={Network} title="NFS Exports" color="text-gb-green">
              <div className="flex items-center gap-3">
                <ServiceStatus label="nfsd" active={nfsActive} />
                <button onClick={() => setShowNfsCreate(true)} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-green-dim bg-gb-green text-gb-bg0-hard hover:opacity-90 transition-colors">
                  <Plus size={14} /> Create
                </button>
              </div>
            </SectionHeader>

            {loading ? <Spinner /> : (
              <div className="bg-gb-bg0 border-2 border-gb-bg2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gb-bg2">
                      <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Path</th>
                      <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Clients / Options</th>
                      <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {nfsExports.map((e, i) => (
                      <tr key={i} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                        <td className="px-4 py-2.5 text-gb-fg1 font-mono text-xs">{e.path}</td>
                        <td className="px-4 py-2.5 text-gb-fg3 font-mono text-xs">{e.clients}</td>
                        <td className="px-4 py-2.5 text-center">
                          <button onClick={() => setDeleteConfirmShare({ type: 'nfs', key: e.path })} className="p-1 text-gb-fg4 hover:text-gb-red transition-colors"><Trash2 size={12} /></button>
                        </td>
                      </tr>
                    ))}
                    {nfsExports.length === 0 && (
                      <tr><td colSpan={3} className="px-4 py-4 text-center text-gb-fg4 text-xs">No NFS exports (/etc/exports)</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {showSmbCreate && <CreateSmbShareModal onClose={() => setShowSmbCreate(false)} onCreated={() => { setShowSmbCreate(false); fetch_(); }} />}
          {showNfsCreate && <CreateNfsExportModal onClose={() => setShowNfsCreate(false)} onCreated={() => { setShowNfsCreate(false); fetch_(); }} />}
          <ConfirmModal open={!!deleteConfirmShare}
            title={deleteConfirmShare?.type === 'smb' ? `Delete share [${deleteConfirmShare?.key}]?` : `Delete NFS export ${deleteConfirmShare?.key}?`}
            message="This action cannot be undone." confirmText="Delete" variant="danger"
            onConfirm={() => deleteConfirmShare?.type === 'smb' ? handleDeleteSmb(deleteConfirmShare.key) : handleDeleteNfs(deleteConfirmShare.key)}
            onCancel={() => setDeleteConfirmShare(null)} />
        </div>
      )}

      {sub === 'smb-config' && <SemanticConfigForm configName="smb" />}
      {sub === 'nfs-config' && <SemanticConfigForm configName="nfs" />}
      {sub === 'ftp-config' && <SemanticConfigForm configName="ftp" />}
    </div>
  );
}

/* ── Tiny shared components ──────────────────────────────────────── */

function Spinner() {
  return (
    <div className="flex items-center gap-2 text-gb-fg4 mt-4">
      <Activity size={18} className="animate-pulse" /> Loading…
    </div>
  );
}

function ErrorBox({ msg }) {
  return (
    <div className="flex items-center gap-2 text-gb-red bg-gb-bg1 border-2 border-gb-red-dim p-3 text-sm mb-3">
      <AlertCircle size={16} /> {msg}
    </div>
  );
}

function ServiceStatus({ label, active }) {
  return (
    <span className={`flex items-center gap-1.5 text-xs font-bold uppercase ${active ? 'text-gb-green' : 'text-gb-red'}`}>
      <span className={`w-2 h-2 ${active ? 'bg-gb-green' : 'bg-gb-red'}`} />
      {label}: {active ? 'Running' : 'Stopped'}
    </span>
  );
}

/* ── Main Disks Page ─────────────────────────────────────────────── */

export default function Disks() {
  const VALID_TAB_KEYS = TABS.map(t => t.key);
  const [tab, setTab] = useTabSync(VALID_TAB_KEYS, 'drives');

  const TAB_COMPONENTS = {
    drives: DrivesTab,
    structure: StructureTab,
    mounts: MountsTab,
    sharing: SharingTab,
  };

  const ActiveTab = TAB_COMPONENTS[tab] || DrivesTab;

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight mb-6 text-gb-fg1">Storage</h1>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-bold uppercase border-2 transition-colors ${
              tab === key
                ? 'bg-gb-bg1 text-gb-aqua border-gb-aqua-dim'
                : 'bg-gb-bg0 text-gb-fg4 border-gb-bg3 hover:text-gb-fg1 hover:bg-gb-bg1'
            }`}>
            <span className="flex items-center gap-2"><Icon size={16} /> {label}</span>
          </button>
        ))}
      </div>

      <ActiveTab />
    </div>
  );
}
