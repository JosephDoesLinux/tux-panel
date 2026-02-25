import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Play,
  Square,
  RotateCcw,
  Trash2,
  Activity,
  FileText,
  RefreshCw,
  AlertCircle,
  Download,
  Image,
  Cpu,
  MemoryStick,
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

function StatusBadge({ state }) {
  const colors = {
    running: 'text-gb-green border-gb-green-dim',
    exited: 'text-gb-fg4 border-gb-bg3',
    created: 'text-gb-yellow border-gb-yellow-dim',
    paused: 'text-gb-blue border-gb-blue-dim',
    dead: 'text-gb-red border-gb-red-dim',
    removing: 'text-gb-orange border-gb-orange-dim',
  };
  const cls = colors[state?.toLowerCase()] || colors.exited;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold uppercase border-2 ${cls}`}>
      {state || 'unknown'}
    </span>
  );
}

/* ── Log Viewer Modal ────────────────────────────────────────────── */

function LogViewer({ containerId, containerName, onClose }) {
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/api/containers/logs/${encodeURIComponent(containerId)}?lines=200`)
      .then((res) => setLog(res.data.logs))
      .catch(() => setLog('Failed to load logs'))
      .finally(() => setLoading(false));
  }, [containerId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gb-bg0 border-2 border-gb-bg3 w-200 max-h-[80vh] shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-gb-bg2">
          <h3 className="text-sm font-black uppercase text-gb-fg1">
            Logs — <span className="text-gb-aqua">{containerName || containerId}</span>
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
              {log || 'No logs available'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Pull Image Modal ────────────────────────────────────────────── */

function PullImageModal({ onClose, onPulled }) {
  const [image, setImage] = useState('');
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState(null);

  async function handlePull(e) {
    e.preventDefault();
    setPulling(true);
    setError(null);
    try {
      await api.post('/api/containers/pull', { image });
      onPulled();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setPulling(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handlePull}
        className="bg-gb-bg0 border-2 border-gb-bg3 p-6 w-120 shadow-xl"
      >
        <h2 className="text-lg font-black text-gb-fg0 uppercase mb-4">Pull Image</h2>

        {error && (
          <div className="flex items-center gap-2 text-gb-red bg-gb-bg1 border-2 border-gb-red-dim p-3 mb-4 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-gb-fg3 uppercase mb-1">Image</label>
          <input
            required
            value={image}
            onChange={(e) => setImage(e.target.value)}
            className="w-full px-3 py-2 bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-sm focus:border-gb-aqua outline-none"
            placeholder="docker.io/library/nginx:latest"
          />
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
            disabled={pulling}
            className="px-4 py-2 text-sm font-bold border-2 border-gb-aqua-dim bg-gb-aqua text-gb-bg0-hard hover:opacity-90 transition-colors disabled:opacity-50"
          >
            {pulling ? 'Pulling…' : 'Pull'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Main Containers Page ────────────────────────────────────────── */

export default function Containers() {
  const [containers, setContainers] = useState([]);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, _setTab] = useState(() => searchParams.get('tab') || 'containers');
  const setTab = (t) => { _setTab(t); setSearchParams({ tab: t }, { replace: true }); };

  // Sync tab when sidebar navigates with ?tab=
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && ['containers', 'images'].includes(t)) _setTab(t);
  }, [searchParams]);
  const [logContainer, setLogContainer] = useState(null);
  const [showPullModal, setShowPullModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [unavailable, setUnavailable] = useState(false);

  const fetchContainers = useCallback(async () => {
    try {
      const res = await api.get('/api/containers/list');
      if (res.data.error) {
        setUnavailable(true);
        setContainers([]);
      } else {
        setContainers(res.data.containers || []);
        setUnavailable(false);
      }
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const fetchImages = useCallback(async () => {
    try {
      const res = await api.get('/api/containers/images');
      setImages(res.data.images || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchContainers(), fetchImages()]).finally(() => setLoading(false));
  }, [fetchContainers, fetchImages]);

  async function handleAction(id, action) {
    setActionLoading(`${id}-${action}`);
    try {
      await api.post('/api/containers/action', { id, action });
      setTimeout(() => {
        fetchContainers();
        setActionLoading(null);
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setActionLoading(null);
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

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gb-fg4">
        <Activity size={18} className="animate-pulse" />
        Loading containers…
      </div>
    );
  }

  if (unavailable) {
    return (
      <div>
        <h1 className="text-2xl font-black uppercase tracking-tight mb-6 text-gb-fg1">Containers</h1>
        <div className="bg-gb-bg0 border-2 border-gb-bg2 p-8 text-center">
          <Box size={48} className="mx-auto mb-4 text-gb-bg4" />
          <h2 className="text-lg font-bold text-gb-fg2 mb-2">Docker Not Available</h2>
          <p className="text-sm text-gb-fg4 max-w-md mx-auto">
            Install Docker to manage containers:{' '}
            <code className="text-gb-aqua bg-gb-bg1 px-1.5 py-0.5">sudo dnf install docker</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight mb-6 text-gb-fg1">Containers</h1>

      {error && (
        <div className="flex items-center gap-2 text-gb-red bg-gb-bg1 border-2 border-gb-red-dim p-3 mb-4 text-sm">
          <AlertCircle size={16} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-gb-fg4 hover:text-gb-fg1">✕</button>
        </div>
      )}

      {/* ── Tab bar ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setTab('containers')}
          className={`px-4 py-2 text-sm font-bold uppercase border-2 transition-colors ${
            tab === 'containers'
              ? 'bg-gb-bg1 text-gb-aqua border-gb-aqua-dim'
              : 'bg-gb-bg0 text-gb-fg4 border-gb-bg3 hover:text-gb-fg1 hover:bg-gb-bg1'
          }`}
        >
          <span className="flex items-center gap-2">
            <Box size={16} />
            Containers ({containers.length})
          </span>
        </button>
        <button
          onClick={() => setTab('images')}
          className={`px-4 py-2 text-sm font-bold uppercase border-2 transition-colors ${
            tab === 'images'
              ? 'bg-gb-bg1 text-gb-aqua border-gb-aqua-dim'
              : 'bg-gb-bg0 text-gb-fg4 border-gb-bg3 hover:text-gb-fg1 hover:bg-gb-bg1'
          }`}
        >
          <span className="flex items-center gap-2">
            <Image size={16} />
            Images ({images.length})
          </span>
        </button>

        <div className="flex-1" />

        {tab === 'images' && (
          <button
            onClick={() => setShowPullModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase border-2 border-gb-aqua-dim bg-gb-bg1 text-gb-aqua hover:bg-gb-bg2 transition-colors"
          >
            <Download size={14} />
            Pull Image
          </button>
        )}

        <button
          onClick={() => {
            setLoading(true);
            Promise.all([fetchContainers(), fetchImages()]).finally(() => setLoading(false));
          }}
          className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {tab === 'containers' ? (
        /* ── Containers Table ──────────────────────────────────── */
        <div className="bg-gb-bg0 border-2 border-gb-bg2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gb-bg2">
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Name</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Image</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Status</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Ports</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Created</th>
                <th className="text-center px-4 py-3 font-bold text-gb-fg3 uppercase text-xs w-48">Actions</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((c) => {
                const name = Array.isArray(c.Names) ? c.Names[0] : c.Names || c.Name || c.Id?.slice(0, 12);
                const state = c.State || c.Status?.split(' ')[0] || 'unknown';
                const image = c.Image || '—';
                const ports = c.Ports
                  ? (Array.isArray(c.Ports)
                    ? c.Ports.map((p) => `${p.host_port || ''}→${p.container_port || ''}`).join(', ')
                    : String(c.Ports))
                  : '—';
                const created = c.Created
                  ? typeof c.Created === 'number'
                    ? new Date(c.Created * 1000).toLocaleString()
                    : String(c.Created)
                  : '—';
                const id = c.Id || c.ID || name;

                return (
                  <tr key={id} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                    <td className="px-4 py-2.5 text-gb-fg1 font-bold">{name}</td>
                    <td className="px-4 py-2.5 text-gb-fg3 font-mono text-xs">{image}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge state={state} />
                    </td>
                    <td className="px-4 py-2.5 text-gb-fg3 text-xs font-mono">{ports}</td>
                    <td className="px-4 py-2.5 text-gb-fg3 text-xs">{created}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        {state === 'running' ? (
                          <>
                            <button
                              onClick={() => handleAction(id, 'restart')}
                              disabled={actionLoading === `${id}-restart`}
                              className="p-1.5 text-gb-yellow hover:bg-gb-bg2 transition-colors disabled:opacity-50"
                              title="Restart"
                            >
                              <RotateCcw size={14} />
                            </button>
                            <button
                              onClick={() => handleAction(id, 'stop')}
                              disabled={actionLoading === `${id}-stop`}
                              className="p-1.5 text-gb-red hover:bg-gb-bg2 transition-colors disabled:opacity-50"
                              title="Stop"
                            >
                              <Square size={14} />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleAction(id, 'start')}
                            disabled={actionLoading === `${id}-start`}
                            className="p-1.5 text-gb-green hover:bg-gb-bg2 transition-colors disabled:opacity-50"
                            title="Start"
                          >
                            <Play size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => setLogContainer({ id, name })}
                          className="p-1.5 text-gb-blue hover:bg-gb-bg2 transition-colors"
                          title="Logs"
                        >
                          <FileText size={14} />
                        </button>
                        {state !== 'running' && (
                          <button
                            onClick={() => handleAction(id, 'rm')}
                            disabled={actionLoading === `${id}-rm`}
                            className="p-1.5 text-gb-fg4 hover:text-gb-red hover:bg-gb-bg2 transition-colors disabled:opacity-50"
                            title="Remove"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {containers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gb-fg4">
                    <Box size={32} className="mx-auto mb-2 text-gb-bg4" />
                    No containers found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Images Table ──────────────────────────────────────── */
        <div className="bg-gb-bg0 border-2 border-gb-bg2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gb-bg2">
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Repository</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Tag</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">ID</th>
                <th className="text-right px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Size</th>
                <th className="text-left px-4 py-3 font-bold text-gb-fg3 uppercase text-xs">Created</th>
              </tr>
            </thead>
            <tbody>
              {images.map((img, i) => {
                const repo = Array.isArray(img.Names)
                  ? img.Names[0]?.split(':')[0]
                  : img.Repository || img.Names || '—';
                const tag = Array.isArray(img.Names)
                  ? img.Names[0]?.split(':')[1]
                  : img.Tag || 'latest';
                const id = (img.Id || img.ID || '').slice(0, 12);
                const size = img.Size || img.VirtualSize;
                const created = img.Created
                  ? typeof img.Created === 'number'
                    ? new Date(img.Created * 1000).toLocaleDateString()
                    : String(img.Created)
                  : '—';

                return (
                  <tr key={`${id}-${i}`} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors">
                    <td className="px-4 py-2.5 text-gb-fg1 font-mono text-xs">{repo}</td>
                    <td className="px-4 py-2.5 text-gb-aqua font-mono text-xs">{tag}</td>
                    <td className="px-4 py-2.5 text-gb-fg3 font-mono text-xs">{id}</td>
                    <td className="px-4 py-2.5 text-gb-fg1 text-right font-mono text-xs">{formatBytes(size)}</td>
                    <td className="px-4 py-2.5 text-gb-fg3 text-xs">{created}</td>
                  </tr>
                );
              })}
              {images.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gb-fg4">
                    <Image size={32} className="mx-auto mb-2 text-gb-bg4" />
                    No images found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────── */}
      {logContainer && (
        <LogViewer
          containerId={logContainer.id}
          containerName={logContainer.name}
          onClose={() => setLogContainer(null)}
        />
      )}

      {showPullModal && (
        <PullImageModal
          onClose={() => setShowPullModal(false)}
          onPulled={() => {
            setShowPullModal(false);
            fetchImages();
          }}
        />
      )}
    </div>
  );
}
