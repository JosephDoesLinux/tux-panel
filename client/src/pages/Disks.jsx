import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  HardDrive, Layers, Camera, Database, Share2,
  RefreshCw, Activity, AlertCircle, Search,
  ChevronDown, ChevronUp, Trash2, Plus, Check, X,
  FolderOpen, Server, Globe,
} from 'lucide-react';
import api from '../lib/api';
import ConfigEditorTab from '../components/ConfigEditorTab';

/* ── Helpers ─────────────────────────────────────────────────────── */

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—';
  const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (num === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(num) / Math.log(1024));
  return `${(num / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function UsageBar({ percent, color = 'bg-gb-aqua' }) {
  const num = parseInt(percent, 10) || 0;
  const barColor = num > 90 ? 'bg-gb-red' : num > 70 ? 'bg-gb-yellow' : color;
  return (
    <div className="w-full h-2 bg-gb-bg2">
      <div className={`h-full ${barColor} transition-all`} style={{ width: `${num}%` }} />
    </div>
  );
}

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
      await api.post('/api/disks/mounts', { device, mountpoint, fstype, options });
      onCreated();
    } catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form onSubmit={handleSubmit} className="bg-gb-bg0 border-2 border-gb-bg3 p-6 w-110 shadow-xl">
        <h2 className="text-lg font-black text-gb-fg0 uppercase mb-4">Mount Device</h2>
        {error && <ErrorBox msg={error} />}
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Device</label>
            <input required value={device} onChange={(e) => setDevice(e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono"
              placeholder="/dev/sdb1" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Mountpoint</label>
            <input required value={mountpoint} onChange={(e) => setMountpoint(e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono"
              placeholder="/mnt/data" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">FS Type (optional)</label>
              <input value={fstype} onChange={(e) => setFstype(e.target.value)}
                className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono"
                placeholder="ext4, btrfs..." />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Options (optional)</label>
              <input value={options} onChange={(e) => setOptions(e.target.value)}
                className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono"
                placeholder="defaults, ro..." />
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
  const [form, setForm] = useState({ name: '', path: '', readOnly: false, guestOk: false });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

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
      <form onSubmit={handleSubmit} className="bg-gb-bg0 border-2 border-gb-bg3 p-6 w-110 shadow-xl">
        <h2 className="text-lg font-black text-gb-fg0 uppercase mb-4">Create Samba Share</h2>
        {error && <ErrorBox msg={error} />}
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Share Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono"
              placeholder="public" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Path</label>
            <input required value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono"
              placeholder="/srv/samba/public" />
          </div>
          <div className="flex gap-4 mt-2">
            <label className="flex items-center gap-2 text-sm text-gb-fg2 cursor-pointer">
              <input type="checkbox" checked={form.readOnly} onChange={(e) => setForm({ ...form, readOnly: e.target.checked })} className="accent-gb-aqua" />
              Read Only
            </label>
            <label className="flex items-center gap-2 text-sm text-gb-fg2 cursor-pointer">
              <input type="checkbox" checked={form.guestOk} onChange={(e) => setForm({ ...form, guestOk: e.target.checked })} className="accent-gb-aqua" />
              Guest OK
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
  const [clients, setClients] = useState('*(rw,sync,no_subtree_check)');
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
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Path</label>
            <input required value={path} onChange={(e) => setPath(e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono"
              placeholder="/srv/nfs/public" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Clients & Options</label>
            <input required value={clients} onChange={(e) => setClients(e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none font-mono"
              placeholder="*(rw,sync,no_subtree_check)" />
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

/* ── Tab Definition ──────────────────────────────────────────────── */

const TABS = [
  { key: 'shares',      label: 'Shares',             icon: Share2 },
  { key: 'smb',         label: 'SMB Config',         icon: FolderOpen, dividerBefore: true },
  { key: 'nfs',         label: 'NFS Config',         icon: Server },
  { key: 'ftp',         label: 'FTP Config',         icon: Globe },
  { key: 'disks',       label: 'Disks & Partitions', icon: HardDrive, dividerBefore: true },
  { key: 'subvolumes',  label: 'Subvolumes',         icon: Layers },
  { key: 'snapshots',   label: 'Snapshots',          icon: Camera },
  { key: 'mounts',      label: 'Mounts',             icon: Database },
];

/* ── DisksTab ────────────────────────────────────────────────────── */

function DisksTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/disks/block');
      setData(res.data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox msg={error} />;

  const { blockDevices = [], filesystems = [] } = data || {};

  // Flatten block devices for display
  const flatDevices = [];
  for (const dev of blockDevices) {
    flatDevices.push({ ...dev, _level: 0 });
    if (dev.children) {
      for (const child of dev.children) {
        flatDevices.push({ ...child, _level: 1 });
        if (child.children) {
          for (const gc of child.children) {
            flatDevices.push({ ...gc, _level: 2 });
          }
        }
      }
    }
  }

  return (
    <div className="space-y-8">
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
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Device</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Type</th>
                <th className="text-right px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Size</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">FS Type</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Mount</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Label</th>
              </tr>
            </thead>
            <tbody>
              {flatDevices.map((dev, i) => (
                <tr key={`${dev.name}-${i}`} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                  <td className="px-4 py-2.5 text-gb-fg1 font-mono">
                    <span style={{ paddingLeft: dev._level * 20 }}>
                      {dev._level > 0 ? '└ ' : ''}{dev.name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gb-fg3">{dev.type}</td>
                  <td className="px-4 py-2.5 text-gb-fg1 text-right font-mono">{formatBytes(dev.size)}</td>
                  <td className="px-4 py-2.5 text-gb-fg3">{dev.fstype || '—'}</td>
                  <td className="px-4 py-2.5 text-gb-fg3 font-mono">{dev.mountpoint || dev.mountpoints?.filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-4 py-2.5 text-gb-fg3">{dev.label || '—'}</td>
                </tr>
              ))}
              {flatDevices.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gb-fg4">No block devices found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filesystems */}
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
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-32">Usage</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Mount</th>
              </tr>
            </thead>
            <tbody>
              {filesystems.map((fs, i) => (
                <tr key={i} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                  <td className="px-4 py-2.5 text-gb-fg1 font-mono">{fs.source}</td>
                  <td className="px-4 py-2.5 text-gb-fg3">{fs.fstype}</td>
                  <td className="px-4 py-2.5 text-gb-fg1 text-right font-mono">{fs.size}</td>
                  <td className="px-4 py-2.5 text-gb-fg1 text-right font-mono">{fs.used}</td>
                  <td className="px-4 py-2.5 text-gb-fg1 text-right font-mono">{fs.avail}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <UsageBar percent={fs.usePercent} />
                      <span className="text-xs text-gb-fg3 font-mono w-10 text-right">{fs.usePercent}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gb-fg3 font-mono">{fs.mountpoint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── SubvolumesTab ───────────────────────────────────────────────── */

function SubvolumesTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mount, setMount] = useState('/');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/disks/subvolumes?mount=${encodeURIComponent(mount)}`);
      setData(res.data);
      if (res.data.error) setError(res.data.error);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [mount]);

  useEffect(() => { fetch_(); }, [fetch_]);

  async function handleDelete(path) {
    try {
      await api.delete('/api/disks/subvolumes', { data: { path } });
      setDeleteConfirm(null);
      fetch_();
    } catch (err) { setError(err.response?.data?.error || err.message); }
  }

  const subvolumes = (data?.subvolumes || []).filter((sv) =>
    sv.path.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <SectionHeader icon={Layers} title="Btrfs Subvolumes" color="text-gb-green">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-gb-fg3 uppercase">Mount:</label>
          <input
            value={mount}
            onChange={(e) => setMount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetch_()}
            className="w-32 px-2 py-1.5 text-sm bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 focus:border-gb-aqua outline-none font-mono"
          />
          <button onClick={fetch_} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-green-dim bg-gb-green text-gb-bg0-hard hover:opacity-90 transition-colors ml-2">
            <Plus size={14} /> Create
          </button>
        </div>
      </SectionHeader>

      {error && <div className="flex items-center gap-2 text-gb-yellow bg-gb-bg1 border-2 border-gb-yellow-dim p-3 mb-4 text-sm"><AlertCircle size={16} />{error}</div>}

      <div className="mb-3">
        <div className="relative inline-block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gb-fg4" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter subvolumes…"
            className="pl-9 pr-3 py-2 w-64 text-sm bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 focus:border-gb-aqua outline-none" />
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-gb-bg0 border-2 border-gb-bg2 overflow-x-auto">
          <div className="px-4 py-2 border-b-2 border-gb-bg2 text-xs text-gb-fg4">{subvolumes.length} subvolumes</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gb-bg2">
                <th className="text-right px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-20">ID</th>
                <th className="text-right px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-20">Gen</th>
                <th className="text-right px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-24">Top Level</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Path</th>
                <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-16">—</th>
              </tr>
            </thead>
            <tbody>
              {subvolumes.map((sv) => (
                <tr key={sv.id} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                  <td className="px-4 py-2.5 text-gb-fg1 text-right font-mono">{sv.id}</td>
                  <td className="px-4 py-2.5 text-gb-fg3 text-right font-mono">{sv.gen}</td>
                  <td className="px-4 py-2.5 text-gb-fg3 text-right font-mono">{sv.topLevel}</td>
                  <td className="px-4 py-2.5 text-gb-fg1 font-mono">{sv.path}</td>
                  <td className="px-4 py-2.5 text-center">
                    <button onClick={() => setDeleteConfirm(mount === '/' ? `/${sv.path}` : `${mount}/${sv.path}`.replace(/\/\//g, '/'))}
                      className="p-1 text-gb-fg4 hover:text-gb-red transition-colors" title="Delete subvolume">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {subvolumes.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gb-fg4">
                  {error ? 'Not a btrfs filesystem' : 'No subvolumes found'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateSubvolumeModal mount={mount} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetch_(); }} />}
      
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gb-bg0 border-2 border-gb-bg3 p-6 w-96 shadow-xl">
            <h2 className="text-lg font-black text-gb-fg0 uppercase mb-2">Delete Subvolume</h2>
            <p className="text-sm text-gb-fg2 mb-1">Are you sure you want to delete:</p>
            <p className="text-sm font-mono text-gb-red mb-6 break-all">{deleteConfirm}</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-bold border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg3 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 text-sm font-bold border-2 border-gb-red-dim bg-gb-red text-gb-bg0-hard hover:opacity-90 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── SnapshotsTab ────────────────────────────────────────────────── */

function SnapshotsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mount, setMount] = useState('/');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/disks/snapshots?mount=${encodeURIComponent(mount)}`);
      setData(res.data);
      if (res.data.error) setError(res.data.error);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [mount]);

  useEffect(() => { fetch_(); }, [fetch_]);

  async function handleDelete(path) {
    try {
      await api.delete('/api/disks/snapshots', { data: { path } });
      setDeleteConfirm(null);
      fetch_();
    } catch (err) { setError(err.response?.data?.error || err.message); }
  }

  const snapshots = data?.snapshots || [];

  return (
    <div>
      <SectionHeader icon={Camera} title="Btrfs Snapshots" color="text-gb-orange">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-gb-fg3 uppercase">Mount:</label>
          <input value={mount} onChange={(e) => setMount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetch_()}
            className="w-32 px-2 py-1.5 text-sm bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 focus:border-gb-aqua outline-none font-mono" />
          <button onClick={fetch_} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-orange-dim bg-gb-orange text-gb-bg0-hard hover:opacity-90 transition-colors ml-2">
            <Plus size={14} /> Create
          </button>
        </div>
      </SectionHeader>

      {error && <div className="flex items-center gap-2 text-gb-yellow bg-gb-bg1 border-2 border-gb-yellow-dim p-3 mb-4 text-sm"><AlertCircle size={16} />{error}</div>}

      {loading ? <Spinner /> : (
        <div className="bg-gb-bg0 border-2 border-gb-bg2 overflow-x-auto">
          <div className="px-4 py-2 border-b-2 border-gb-bg2 text-xs text-gb-fg4">{snapshots.length} snapshots</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gb-bg2">
                <th className="text-right px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-20">ID</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Path</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-44">Created</th>
                <th className="text-right px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-20">Gen</th>
                <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-16">—</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snap) => (
                <tr key={snap.id} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                  <td className="px-4 py-2.5 text-gb-fg1 text-right font-mono">{snap.id}</td>
                  <td className="px-4 py-2.5 text-gb-fg1 font-mono">{snap.path}</td>
                  <td className="px-4 py-2.5 text-gb-fg3 font-mono">{snap.otime}</td>
                  <td className="px-4 py-2.5 text-gb-fg3 text-right font-mono">{snap.gen}</td>
                  <td className="px-4 py-2.5 text-center">
                    <button onClick={() => setDeleteConfirm(mount === '/' ? `/${snap.path}` : `${mount}/${snap.path}`.replace(/\/\//g, '/'))}
                      className="p-1 text-gb-fg4 hover:text-gb-red transition-colors" title="Delete snapshot">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {snapshots.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gb-fg4">
                  {error ? 'Not a btrfs filesystem' : 'No snapshots found'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateSnapshotModal mount={mount} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetch_(); }} />}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gb-bg0 border-2 border-gb-bg3 p-6 w-96 shadow-xl">
            <h2 className="text-lg font-black text-gb-fg0 uppercase mb-2">Delete Snapshot</h2>
            <p className="text-sm text-gb-fg2 mb-1">Are you sure you want to delete:</p>
            <p className="text-sm font-mono text-gb-red mb-6 break-all">{deleteConfirm}</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-bold border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg3 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 text-sm font-bold border-2 border-gb-red-dim bg-gb-red text-gb-bg0-hard hover:opacity-90 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
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
    if (!confirm(`Unmount ${target}?`)) return;
    try {
      await api.delete('/api/disks/mounts', { data: { target } });
      fetch_();
    } catch (err) { setError(err.response?.data?.error || err.message); }
  }

  // Flatten the mount tree
  const flatMounts = [];
  function flatten(nodes, level = 0) {
    if (!nodes) return;
    for (const n of nodes) {
      flatMounts.push({ ...n, _level: level });
      if (n.children) flatten(n.children, level + 1);
    }
  }
  flatten(data?.filesystems);

  const filtered = flatMounts.filter((m) =>
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
                <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-16">—</th>
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
                      m.fstype === 'btrfs' ? 'text-gb-green' :
                      m.fstype === 'ext4' ? 'text-gb-blue' :
                      m.fstype === 'tmpfs' ? 'text-gb-fg4' :
                      'text-gb-fg3'
                    }`}>{m.fstype}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gb-fg4 font-mono text-xs max-w-md truncate">{m.options}</td>
                  <td className="px-4 py-2.5 text-center">
                    <button onClick={() => handleUnmount(m.target)}
                      className="p-1 text-gb-fg4 hover:text-gb-red transition-colors" title="Unmount">
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
    </div>
  );
}

/* ── SharesTab ───────────────────────────────────────────────────── */

function SharesTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSmbCreate, setShowSmbCreate] = useState(false);
  const [showNfsCreate, setShowNfsCreate] = useState(false);
  const [error, setError] = useState(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/disks/shares');
      setData(res.data);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  async function handleDeleteSmb(name) {
    if (!confirm(`Delete Samba share [${name}]?`)) return;
    try {
      await api.delete('/api/disks/shares/smb', { data: { name } });
      fetch_();
    } catch (err) { setError(err.response?.data?.error || err.message); }
  }

  async function handleDeleteNfs(path) {
    if (!confirm(`Delete NFS export ${path}?`)) return;
    try {
      await api.delete('/api/disks/shares/nfs', { data: { path } });
      fetch_();
    } catch (err) { setError(err.response?.data?.error || err.message); }
  }

  const { smbShares = [], nfsExports = [], smbActive = false, nfsActive = false } = data || {};

  return (
    <div className="space-y-8">
      {error && <ErrorBox msg={error} />}
      {/* SMB */}
      <div>
        <SectionHeader icon={Share2} title="Samba (SMB) Shares" color="text-gb-orange">
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
                  <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Read Only</th>
                  <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Guest</th>
                  <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Users</th>
                  <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-16">—</th>
                </tr>
              </thead>
              <tbody>
                {smbShares.map((s) => (
                  <tr key={s.name} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                    <td className="px-4 py-2.5 text-gb-fg1 font-bold">{s.name}</td>
                    <td className="px-4 py-2.5 text-gb-fg3 font-mono">{s.path}</td>
                    <td className="px-4 py-2.5 text-gb-fg3">{s.comment || '—'}</td>
                    <td className="px-4 py-2.5 text-center">{s.browseable ? <Check size={16} className="text-gb-green mx-auto" /> : <X size={16} className="text-gb-fg4 mx-auto" />}</td>
                    <td className="px-4 py-2.5 text-center">{s.readOnly ? <Check size={16} className="text-gb-yellow mx-auto" /> : <X size={16} className="text-gb-fg4 mx-auto" />}</td>
                    <td className="px-4 py-2.5 text-center">{s.guestOk ? <Check size={16} className="text-gb-orange mx-auto" /> : <X size={16} className="text-gb-fg4 mx-auto" />}</td>
                    <td className="px-4 py-2.5 text-gb-fg3">{s.validUsers || 'all'}</td>
                    <td className="px-4 py-2.5 text-center">
                      <button onClick={() => handleDeleteSmb(s.name)} className="p-1 text-gb-fg4 hover:text-gb-red transition-colors" title="Delete share">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {smbShares.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-gb-fg4">No Samba shares configured</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* NFS */}
      <div>
        <SectionHeader icon={Share2} title="NFS Exports" color="text-gb-green">
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
                  <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-16">—</th>
                </tr>
              </thead>
              <tbody>
                {nfsExports.map((e, i) => (
                  <tr key={i} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                    <td className="px-4 py-2.5 text-gb-fg1 font-mono">{e.path}</td>
                    <td className="px-4 py-2.5 text-gb-fg3 font-mono">{e.clients}</td>
                    <td className="px-4 py-2.5 text-center">
                      <button onClick={() => handleDeleteNfs(e.path)} className="p-1 text-gb-fg4 hover:text-gb-red transition-colors" title="Delete export">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {nfsExports.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-gb-fg4">No NFS exports configured (/etc/exports)</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showSmbCreate && <CreateSmbShareModal onClose={() => setShowSmbCreate(false)} onCreated={() => { setShowSmbCreate(false); fetch_(); }} />}
      {showNfsCreate && <CreateNfsExportModal onClose={() => setShowNfsCreate(false)} onCreated={() => { setShowNfsCreate(false); fetch_(); }} />}
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
    <div className="flex items-center gap-2 text-gb-red bg-gb-bg1 border-2 border-gb-red-dim p-3 text-sm">
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, _setTab] = useState(() => searchParams.get('tab') || 'shares');
  const setTab = (t) => { _setTab(t); setSearchParams({ tab: t }, { replace: true }); };

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && TABS.some((tb) => tb.key === t)) _setTab(t);
  }, [searchParams]);

  const TAB_COMPONENTS = {
    shares: SharesTab,
    smb: () => <ConfigEditorTab configName="smb" />,
    nfs: () => <ConfigEditorTab configName="nfs" />,
    ftp: () => <ConfigEditorTab configName="ftp" />,
    disks: DisksTab,
    subvolumes: SubvolumesTab,
    snapshots: SnapshotsTab,
    mounts: MountsTab,
  };

  const ActiveTab = TAB_COMPONENTS[tab] || SharesTab;

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight mb-6 text-gb-fg1">
        Storage
      </h1>

      {/* Tab bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {TABS.map(({ key, label, icon: Icon, dividerBefore }) => (
          <div key={key} className="flex items-center gap-2">
            {dividerBefore && <div className="w-px h-8 bg-gb-bg3 mx-1" />}
            <button
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-bold uppercase border-2 transition-colors ${
                tab === key
                  ? 'bg-gb-bg1 text-gb-aqua border-gb-aqua-dim'
                  : 'bg-gb-bg0 text-gb-fg4 border-gb-bg3 hover:text-gb-fg1 hover:bg-gb-bg1'
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon size={16} /> {label}
              </span>
            </button>
          </div>
        ))}
      </div>

      <ActiveTab />
    </div>
  );
}
