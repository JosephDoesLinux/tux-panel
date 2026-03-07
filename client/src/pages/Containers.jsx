import { useEffect, useState, useCallback } from 'react';
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
  ChevronDown,
  ChevronUp,
  Network,
  Globe,
  HardDrive,
  Info,
} from 'lucide-react';
import api from '../lib/api';
import { formatBytes } from '../lib/utils';
import useTabSync from '../hooks/useTabSync';
import SectionHeader from '../components/shared/SectionHeader';

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

/* ── Container Inspect Detail (expandable row) ───────────────────── */

function InspectDetail({ containerId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    api
      .get(`/api/containers/inspect/${encodeURIComponent(containerId)}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, [containerId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gb-fg4 p-4">
        <Activity size={14} className="animate-pulse" /> Loading inspect data…
      </div>
    );
  }
  if (error) {
    return <div className="text-gb-red text-xs p-4">{error}</div>;
  }
  if (!data) return null;

  const networks = data.networks ? Object.entries(data.networks) : [];
  const mounts = data.mounts || [];
  const ports = data.ports ? Object.entries(data.ports) : [];
  const env = data.env || [];
  const state = data.state || {};
  const resources = data.resources || {};

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
      {/* State */}
      <div className="bg-gb-bg0 border-2 border-gb-bg2 p-3">
        <h4 className="text-xs font-black uppercase text-gb-fg3 mb-2 flex items-center gap-1.5">
          <Info size={12} /> State
        </h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span className="text-gb-fg4">Status</span>
          <span className="text-gb-fg1 font-mono">{state.status || '—'}</span>
          <span className="text-gb-fg4">Running</span>
          <span className={state.running ? 'text-gb-green' : 'text-gb-red'}>{state.running ? 'Yes' : 'No'}</span>
          <span className="text-gb-fg4">PID</span>
          <span className="text-gb-fg1 font-mono">{state.pid || '—'}</span>
          <span className="text-gb-fg4">Exit Code</span>
          <span className="text-gb-fg1 font-mono">{state.exitCode ?? '—'}</span>
          <span className="text-gb-fg4">Started</span>
          <span className="text-gb-fg3 font-mono">{state.startedAt ? new Date(state.startedAt).toLocaleString() : '—'}</span>
          <span className="text-gb-fg4">Finished</span>
          <span className="text-gb-fg3 font-mono">{state.finishedAt && state.finishedAt !== '0001-01-01T00:00:00Z' ? new Date(state.finishedAt).toLocaleString() : '—'}</span>
        </div>
        {/* Restart policy + image */}
        <div className="mt-2 pt-2 border-t border-gb-bg2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span className="text-gb-fg4">Image</span>
          <span className="text-gb-fg1 font-mono truncate">{data.image || '—'}</span>
          <span className="text-gb-fg4">Restart</span>
          <span className="text-gb-fg1 font-mono">{data.restartPolicy?.name || '—'}</span>
          <span className="text-gb-fg4">Network Mode</span>
          <span className="text-gb-fg1 font-mono">{data.networkMode || '—'}</span>
          {data.cmd && <>
            <span className="text-gb-fg4">CMD</span>
            <span className="text-gb-fg3 font-mono truncate">{Array.isArray(data.cmd) ? data.cmd.join(' ') : data.cmd}</span>
          </>}
        </div>
      </div>

      {/* Networks */}
      <div className="bg-gb-bg0 border-2 border-gb-bg2 p-3">
        <h4 className="text-xs font-black uppercase text-gb-fg3 mb-2 flex items-center gap-1.5">
          <Network size={12} /> Networks ({networks.length})
        </h4>
        {networks.length > 0 ? (
          <div className="space-y-2">
            {networks.map(([name, net]) => (
              <div key={name} className="border border-gb-bg2 p-2">
                <span className="text-xs font-bold text-gb-aqua uppercase">{name}</span>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs mt-1">
                  <span className="text-gb-fg4">IP</span>
                  <span className="text-gb-green font-mono">{net.ip || '—'}</span>
                  <span className="text-gb-fg4">Gateway</span>
                  <span className="text-gb-fg3 font-mono">{net.gateway || '—'}</span>
                  <span className="text-gb-fg4">MAC</span>
                  <span className="text-gb-fg3 font-mono">{net.mac || '—'}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-xs text-gb-fg4">No networks</span>
        )}
      </div>

      {/* Mounts */}
      <div className="bg-gb-bg0 border-2 border-gb-bg2 p-3">
        <h4 className="text-xs font-black uppercase text-gb-fg3 mb-2 flex items-center gap-1.5">
          <HardDrive size={12} /> Mounts ({mounts.length})
        </h4>
        {mounts.length > 0 ? (
          <div className="space-y-1">
            {mounts.map((m, i) => (
              <div key={i} className="flex items-start gap-2 text-xs border-b border-gb-bg2 pb-1 last:border-0">
                <span className={`px-1 py-0.5 text-[10px] font-bold uppercase border ${
                  m.type === 'bind' ? 'text-gb-blue border-gb-blue-dim' : 'text-gb-purple border-gb-purple-dim'
                }`}>{m.type}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-gb-fg3 font-mono truncate">{m.source}</div>
                  <div className="text-gb-fg1 font-mono truncate">→ {m.destination}</div>
                </div>
                <span className={`text-[10px] font-bold ${m.rw ? 'text-gb-green' : 'text-gb-yellow'}`}>{m.rw ? 'RW' : 'RO'}</span>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-xs text-gb-fg4">No mounts</span>
        )}
      </div>

      {/* Ports & Resources */}
      <div className="bg-gb-bg0 border-2 border-gb-bg2 p-3">
        <h4 className="text-xs font-black uppercase text-gb-fg3 mb-2 flex items-center gap-1.5">
          <Globe size={12} /> Ports
        </h4>
        {ports.length > 0 ? (
          <div className="space-y-0.5 text-xs mb-3">
            {ports.map(([containerPort, bindings]) => (
              <div key={containerPort} className="flex items-center gap-2">
                <span className="text-gb-fg4 font-mono">{containerPort}</span>
                <span className="text-gb-fg4">→</span>
                <span className="text-gb-aqua font-mono">
                  {Array.isArray(bindings) ? bindings.map(b => `${b.HostIp || '0.0.0.0'}:${b.HostPort}`).join(', ') : String(bindings)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-xs text-gb-fg4 block mb-3">No port mappings</span>
        )}

        {/* Resources */}
        <h4 className="text-xs font-black uppercase text-gb-fg3 mb-2 flex items-center gap-1.5 border-t border-gb-bg2 pt-2">
          <Cpu size={12} /> Resources
        </h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
          <span className="text-gb-fg4">CPU Shares</span>
          <span className="text-gb-fg1 font-mono">{resources.cpuShares || 'default'}</span>
          <span className="text-gb-fg4">Memory</span>
          <span className="text-gb-fg1 font-mono">{resources.memory ? formatBytes(resources.memory) : 'unlimited'}</span>
          <span className="text-gb-fg4">Mem Reserve</span>
          <span className="text-gb-fg1 font-mono">{resources.memoryReservation ? formatBytes(resources.memoryReservation) : '—'}</span>
        </div>
      </div>

      {/* Environment Variables */}
      {env.length > 0 && (
        <div className="bg-gb-bg0 border-2 border-gb-bg2 p-3 lg:col-span-2">
          <h4 className="text-xs font-black uppercase text-gb-fg3 mb-2">Environment ({env.length})</h4>
          <div className="max-h-32 overflow-auto">
            {env.map((e, i) => {
              const eqIdx = e.indexOf('=');
              const key = eqIdx > -1 ? e.slice(0, eqIdx) : e;
              const val = eqIdx > -1 ? e.slice(eqIdx + 1) : '';
              return (
                <div key={i} className="flex gap-2 text-xs border-b border-gb-bg2 py-0.5 last:border-0">
                  <span className="text-gb-aqua font-mono font-bold shrink-0">{key}</span>
                  <span className="text-gb-fg3 font-mono truncate">{val}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Containers Page ────────────────────────────────────────── */

export default function Containers() {
  const [containers, setContainers] = useState([]);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useTabSync(['containers', 'images'], 'containers');
  const [logContainer, setLogContainer] = useState(null);
  const [showPullModal, setShowPullModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

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
      <div className="flex items-center gap-2 mb-4 flex-wrap">
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
                <th className="text-center px-2 py-3 font-bold text-gb-fg3 uppercase text-xs w-8" />
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

                return [
                  <tr key={id} className="border-b border-gb-bg2 hover:bg-gb-bg1 transition-colors cursor-pointer"
                    onClick={() => setExpandedId(expandedId === id ? null : id)}>
                    <td className="px-2 py-2.5 text-center text-gb-fg4">
                      {expandedId === id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </td>
                    <td className="px-4 py-2.5 text-gb-fg1 font-bold">{name}</td>
                    <td className="px-4 py-2.5 text-gb-fg3 font-mono text-xs">{image}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge state={state} />
                    </td>
                    <td className="px-4 py-2.5 text-gb-fg3 text-xs font-mono">{ports}</td>
                    <td className="px-4 py-2.5 text-gb-fg3 text-xs">{created}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
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
                  </tr>,
                  expandedId === id && (
                    <tr key={`${id}-detail`} className="border-b border-gb-bg2 bg-gb-bg1/50">
                      <td colSpan={7}>
                        <InspectDetail containerId={id} />
                      </td>
                    </tr>
                  ),
                ];
              })}
              {containers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gb-fg4">
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
