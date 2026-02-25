import { useEffect, useState } from 'react';
import {
  HardDrive,
  Database,
  FolderOpen,
  Plus,
  Trash2,
  RefreshCw,
  Activity,
  Share2,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';
import api from '../lib/api';

/* ── Reusable sub-components ─────────────────────────────────────── */

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

/* ── Create Share Modal ──────────────────────────────────────────── */

function CreateShareModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    path: '',
    comment: '',
    browseable: true,
    readOnly: false,
    guestOk: false,
    validUsers: '',
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/api/storage/samba/shares', form);
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="bg-gb-bg0 border-2 border-gb-bg3 p-6 w-120 shadow-xl"
      >
        <h2 className="text-lg font-black text-gb-fg0 uppercase mb-4">New Samba Share</h2>

        {error && (
          <div className="flex items-center gap-2 text-gb-red bg-gb-bg1 border-2 border-gb-red-dim p-3 mb-4 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Share Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none"
              placeholder="media"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Path</label>
            <input
              required
              value={form.path}
              onChange={(e) => set('path', e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none"
              placeholder="/srv/samba/media"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Comment</label>
            <input
              value={form.comment}
              onChange={(e) => set('comment', e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none"
              placeholder="Shared media files"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Valid Users</label>
            <input
              value={form.validUsers}
              onChange={(e) => set('validUsers', e.target.value)}
              className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none"
              placeholder="@smbgroup, joseph (leave empty for all)"
            />
          </div>

          <div className="flex gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm text-gb-fg2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.browseable}
                onChange={(e) => set('browseable', e.target.checked)}
                className="accent-gb-aqua"
              />
              Browseable
            </label>
            <label className="flex items-center gap-2 text-sm text-gb-fg2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.readOnly}
                onChange={(e) => set('readOnly', e.target.checked)}
                className="accent-gb-aqua"
              />
              Read Only
            </label>
            <label className="flex items-center gap-2 text-sm text-gb-fg2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.guestOk}
                onChange={(e) => set('guestOk', e.target.checked)}
                className="accent-gb-aqua"
              />
              Guest OK
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg3 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm font-bold border-2 border-gb-aqua-dim bg-gb-aqua text-gb-bg0-hard hover:opacity-90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create Share'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Main Storage Page ───────────────────────────────────────────── */

export default function Storage() {
  const [diskData, setDiskData] = useState(null);
  const [sambaData, setSambaData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      const [diskRes, sambaRes] = await Promise.all([
        api.get('/api/storage/disks'),
        api.get('/api/storage/samba/shares').catch(() => ({ data: { shares: [], serviceActive: false } })),
      ]);
      setDiskData(diskRes.data);
      setSambaData(sambaRes.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
  }, []);

  async function handleDeleteShare(name) {
    try {
      await api.delete(`/api/storage/samba/shares/${encodeURIComponent(name)}`);
      setDeleteConfirm(null);
      fetchAll();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }

  if (error && !diskData) {
    return (
      <div className="text-gb-red bg-gb-bg1 border-2 border-gb-red-dim p-4">
        Failed to load storage data: {error}
      </div>
    );
  }

  if (loading && !diskData) {
    return (
      <div className="flex items-center gap-2 text-gb-fg4">
        <Activity size={18} className="animate-pulse" />
        Loading storage overview…
      </div>
    );
  }

  const { blockDevices = [], filesystems = [] } = diskData || {};
  const { shares = [], serviceActive = false } = sambaData || {};

  // Flatten block devices for table (parent + children)
  const flatDevices = [];
  for (const dev of blockDevices) {
    flatDevices.push({ ...dev, _level: 0 });
    if (dev.children) {
      for (const child of dev.children) {
        flatDevices.push({ ...child, _level: 1 });
      }
    }
  }

  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '—';
    const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (num === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(num) / Math.log(1024));
    return `${(num / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight mb-6 text-gb-fg1">
        Storage & Shares
      </h1>

      {/* ── Block Devices ──────────────────────────────────────── */}
      <div className="mb-8">
        <SectionHeader icon={HardDrive} title="Block Devices" color="text-gb-blue">
          <button
            onClick={fetchAll}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
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
                      {dev._level > 0 ? '└ ' : ''}
                      {dev.name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gb-fg3">{dev.type}</td>
                  <td className="px-4 py-2.5 text-gb-fg1 text-right font-mono">{formatBytes(dev.size)}</td>
                  <td className="px-4 py-2.5 text-gb-fg3">{dev.fstype || '—'}</td>
                  <td className="px-4 py-2.5 text-gb-fg3 font-mono">{dev.mountpoint || '—'}</td>
                  <td className="px-4 py-2.5 text-gb-fg3">{dev.label || '—'}</td>
                </tr>
              ))}
              {flatDevices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gb-fg4">No block devices found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Filesystems ────────────────────────────────────────── */}
      <div className="mb-8">
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
              {filesystems.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gb-fg4">No filesystems found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Samba Shares ───────────────────────────────────────── */}
      <div className="mb-8">
        <SectionHeader icon={Share2} title="Samba Shares" color="text-gb-orange">
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-1.5 text-xs font-bold uppercase ${serviceActive ? 'text-gb-green' : 'text-gb-red'}`}>
              <span className={`w-2 h-2 ${serviceActive ? 'bg-gb-green' : 'bg-gb-red'}`} />
              {serviceActive ? 'Running' : 'Stopped'}
            </span>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase border-2 border-gb-aqua-dim bg-gb-bg1 text-gb-aqua hover:bg-gb-bg2 transition-colors"
            >
              <Plus size={14} />
              New Share
            </button>
          </div>
        </SectionHeader>

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
              {shares.map((share) => (
                <tr key={share.name} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                  <td className="px-4 py-2.5 text-gb-fg1 font-bold">{share.name}</td>
                  <td className="px-4 py-2.5 text-gb-fg3 font-mono">{share.path}</td>
                  <td className="px-4 py-2.5 text-gb-fg3">{share.comment || '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    {share.browseable ? (
                      <Check size={16} className="text-gb-green mx-auto" />
                    ) : (
                      <X size={16} className="text-gb-red mx-auto" />
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {share.readOnly ? (
                      <Check size={16} className="text-gb-yellow mx-auto" />
                    ) : (
                      <X size={16} className="text-gb-fg4 mx-auto" />
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {share.guestOk ? (
                      <Check size={16} className="text-gb-orange mx-auto" />
                    ) : (
                      <X size={16} className="text-gb-fg4 mx-auto" />
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gb-fg3">{share.validUsers || 'all'}</td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      onClick={() => setDeleteConfirm(share.name)}
                      className="p-1 text-gb-fg4 hover:text-gb-red transition-colors"
                      title="Delete share"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {shares.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-gb-fg4">
                    <FolderOpen size={24} className="mx-auto mb-2 text-gb-bg4" />
                    No Samba shares configured
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────── */}
      {showCreateModal && (
        <CreateShareModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            fetchAll();
          }}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gb-bg0 border-2 border-gb-bg3 p-6 w-96 shadow-xl">
            <h2 className="text-lg font-black text-gb-fg0 uppercase mb-2">Delete Share</h2>
            <p className="text-sm text-gb-fg2 mb-6">
              Are you sure you want to delete{' '}
              <span className="font-bold text-gb-red">[{deleteConfirm}]</span>?
              This will remove it from smb.conf.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-bold border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg3 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteShare(deleteConfirm)}
                className="px-4 py-2 text-sm font-bold border-2 border-gb-red-dim bg-gb-red text-gb-bg0-hard hover:opacity-90 transition-colors"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
