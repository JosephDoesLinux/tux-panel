import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Wifi,
  Activity,
  Server,
  Clock,
  Monitor,
  Zap,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import api from '../lib/api';
import { formatBytes, formatRate } from '../lib/utils';

/* ── Gruvbox palette for charts ──────────────────────────────────── */
const GB = {
  bg0h: 'var(--gb-bg0-hard)',
  bg0: 'var(--gb-bg0)',
  bg1: 'var(--gb-bg1)',
  bg2: 'var(--gb-bg2)',
  bg3: 'var(--gb-bg3)',
  fg0: 'var(--gb-fg0)',
  fg1: 'var(--gb-fg1)',
  fg3: 'var(--gb-fg3)',
  fg4: 'var(--gb-fg4)',
  red: 'var(--gb-red)',
  green: 'var(--gb-green)',
  yellow: 'var(--gb-yellow)',
  blue: 'var(--gb-blue)',
  purple: 'var(--gb-purple)',
  aqua: 'var(--gb-aqua)',
  orange: 'var(--gb-orange)',
};

// Static hex fallbacks for chart fills (CSS vars don't work in SVG gradients reliably)
const HEX = {
  aqua: '#8ec07c',
  aquaDim: '#689d6a',
  blue: '#83a598',
  blueDim: '#458588',
  yellow: '#fabd2f',
  yellowDim: '#d79921',
  orange: '#fe8019',
  orangeDim: '#d65d0e',
  red: '#fb4934',
  green: '#b8bb26',
  greenDim: '#98971a',
  purple: '#d3869b',
  purpleDim: '#b16286',
  bg0: '#282828',
  bg1: '#3c3836',
  bg2: '#504945',
  bg3: '#665c54',
  fg4: '#a89984',
};

const HISTORY_SIZE = 60;

/* ── Custom Recharts tooltip ─────────────────────────────────────── */

function GruvboxTooltip({ active, payload, label, suffix = '%', formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gb-bg0 border-2 border-gb-bg3 px-3 py-2 shadow-lg">
      <div className="text-xs text-gb-fg4 font-mono mb-1">{label}</div>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2" style={{ background: entry.color }} />
          <span className="text-gb-fg3 text-xs uppercase">{entry.name}:</span>
          <span className="font-bold text-gb-fg1 font-mono">
            {formatter ? formatter(entry.value) : `${entry.value?.toFixed(1)}${suffix}`}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Animated ring gauge ─────────────────────────────────────────── */

function RingGauge({ value, max = 100, label, sub, icon: Icon, size = 120, strokeWidth = 8 }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const center = size / 2;

  const color = pct > 90 ? HEX.red : pct > 70 ? HEX.yellow : HEX.aqua;
  const colorDim = pct > 90 ? HEX.red : pct > 70 ? HEX.yellowDim : HEX.aquaDim;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background track */}
          <circle
            cx={center} cy={center} r={radius}
            fill="none" stroke={HEX.bg2} strokeWidth={strokeWidth}
          />
          {/* Animated value arc */}
          <circle
            cx={center} cy={center} r={radius}
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(.4,0,.2,1), stroke 0.3s' }}
          />
          {/* Glow filter */}
          <circle
            cx={center} cy={center} r={radius}
            fill="none" stroke={color} strokeWidth={strokeWidth + 4}
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" opacity="0.15"
            style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(.4,0,.2,1)' }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {Icon && <Icon size={16} className="text-gb-fg4 mb-0.5" />}
          <span className="text-2xl font-black text-gb-fg0 leading-none">{pct.toFixed(0)}%</span>
        </div>
      </div>
      <div className="text-xs font-bold text-gb-fg3 uppercase tracking-wide">{label}</div>
      {sub && <div className="text-xs text-gb-fg4 font-mono">{sub}</div>}
    </div>
  );
}

/* ── Service Status Pill ─────────────────────────────────────────── */

function ServicePill({ name, active }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-gb-bg1 border-2 border-gb-bg2">
      <span className="text-sm font-bold text-gb-fg2">{name}</span>
      <span className={`flex items-center gap-1.5 text-xs font-bold uppercase ${active ? 'text-gb-green' : 'text-gb-red'}`}>
        <span className={`w-2 h-2 inline-block ${active ? 'bg-gb-green' : 'bg-gb-red'}`}
          style={active ? { animation: 'pulse 2s infinite' } : {}} />
        {active ? 'Running' : 'Stopped'}
      </span>
    </div>
  );
}

/* ── Format helpers ──────────────────────────────────────────────── */

function timeLabel(secondsAgo) {
  return `-${secondsAgo}s`;
}

/* ════════════════════════════════════════════════════════════════════
   Main Dashboard Component
   ════════════════════════════════════════════════════════════════════ */

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [memDetail, setMemDetail] = useState(null);
  const [error, setError] = useState(null);

  // Rolling histories for charts
  const [cpuHistory, setCpuHistory] = useState([]);
  const [memHistory, setMemHistory] = useState([]);
  const [netHistory, setNetHistory] = useState([]);
  const [loadHistory, setLoadHistory] = useState([]);
  const [services, setServices] = useState([]);

  const prevNet = useRef(null);
  const prevNetTime = useRef(null);
  const tickRef = useRef(0);
  const intervalRef = useRef(null);
  const svcIntervalRef = useRef(null);

  /* ── Data fetching ───────────────────────────────────────────── */

  const fetchData = useCallback(async () => {
    try {
      const [overviewRes, memRes, netRes] = await Promise.all([
        api.get('/api/system/overview'),
        api.get('/api/system/memory'),
        api.get('/api/system/netstat'),
      ]);

      const overview = overviewRes.data;
      setData(overview);

      // Memory detail
      const m = memRes.data;
      const memInfo = {
        total: m.MemTotal,
        free: m.MemFree,
        available: m.MemAvailable,
        buffers: m.Buffers,
        cached: m.Cached,
        swapTotal: m.SwapTotal,
        swapFree: m.SwapFree,
      };
      setMemDetail(memInfo);

      tickRef.current += 1;
      const tick = tickRef.current;
      const now = (HISTORY_SIZE - tick) * 2; // label as negative seconds ago
      const timeStr = timeLabel(Math.max(0, (HISTORY_SIZE - tick) * 2));

      // CPU history — per-core + average
      const avgCpu = overview.cpu.usage.reduce((a, b) => a + b, 0) / overview.cpu.usage.length;
      setCpuHistory((prev) => {
        const entry = { t: tick, time: `${tick * 2}s`, avg: +avgCpu.toFixed(1) };
        overview.cpu.usage.forEach((pct, i) => {
          entry[`c${i}`] = +pct.toFixed(1);
        });
        return [...prev.slice(-(HISTORY_SIZE - 1)), entry];
      });

      // Memory history
      const usedPct = overview.memory.usedPercent;
      const cachedPct = memInfo.total > 0 ? +((memInfo.cached / memInfo.total) * 100).toFixed(1) : 0;
      setMemHistory((prev) => [
        ...prev.slice(-(HISTORY_SIZE - 1)),
        { t: tick, time: `${tick * 2}s`, used: usedPct, cached: cachedPct },
      ]);

      // Load history
      setLoadHistory((prev) => [
        ...prev.slice(-(HISTORY_SIZE - 1)),
        { t: tick, time: `${tick * 2}s`, '1m': overview.load['1m'], '5m': overview.load['5m'], '15m': overview.load['15m'] },
      ]);

      // Network throughput calculation
      const netData = netRes.data;
      if (prevNet.current && prevNetTime.current) {
        const dt = (netData.timestamp - prevNetTime.current) / 1000; // seconds
        if (dt > 0) {
          const rxRate = Math.max(0, (netData.totalRx - prevNet.current.rx) / dt);
          const txRate = Math.max(0, (netData.totalTx - prevNet.current.tx) / dt);
          setNetHistory((prev) => [
            ...prev.slice(-(HISTORY_SIZE - 1)),
            { t: tick, time: `${tick * 2}s`, rx: +rxRate.toFixed(0), tx: +txRate.toFixed(0) },
          ]);
        }
      }
      prevNet.current = { rx: netData.totalRx, tx: netData.totalTx };
      prevNetTime.current = netData.timestamp;
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const fetchServices = useCallback(async () => {
    try {
      const res = await api.get('/api/system/services');
      const raw = res.data.raw || '';
      const watchList = ['sshd.service', 'smb.service', 'firewalld.service', 'guacd.service', 'docker.service'];
      const running = raw.toLowerCase();
      setServices(
        watchList.map((name) => ({
          name: name.replace('.service', ''),
          active: running.includes(name.replace('.service', '')),
        }))
      );
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchServices();

    const startPolling = () => {
      intervalRef.current = setInterval(fetchData, 2000);
      svcIntervalRef.current = setInterval(fetchServices, 10000);
    };
    const stopPolling = () => {
      clearInterval(intervalRef.current);
      clearInterval(svcIntervalRef.current);
    };

    startPolling();

    // Pause polling when the tab is hidden to save resources
    const onVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        fetchData();
        fetchServices();
        startPolling();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchData, fetchServices]);

  /* ── Loading / Error states ──────────────────────────────────── */

  if (error && !data) {
    return (
      <div className="text-gb-red bg-gb-bg1 border-2 border-gb-red-dim p-4">
        Failed to load system data: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-gb-fg4">
        <Activity size={24} className="animate-spin text-gb-aqua" />
        <span className="text-lg font-bold uppercase">Loading system overview…</span>
      </div>
    );
  }

  /* ── Derived data ────────────────────────────────────────────── */

  const memTotalGB = (data.memory.totalBytes / 1e9).toFixed(1);
  const memUsedGB = (data.memory.usedBytes / 1e9).toFixed(1);
  const memFreeGB = (data.memory.freeBytes / 1e9).toFixed(1);
  const avgCpu = data.cpu.usage.reduce((a, b) => a + b, 0) / data.cpu.usage.length;

  const swapTotal = memDetail?.swapTotal || 0;
  const swapUsed = swapTotal - (memDetail?.swapFree || 0);
  const swapPct = swapTotal > 0 ? +((swapUsed / swapTotal) * 100).toFixed(1) : 0;
  const cachedGB = memDetail ? (memDetail.cached / 1e9).toFixed(1) : '0';
  const buffersGB = memDetail ? (memDetail.buffers / 1e9).toFixed(1) : '0';

  // Disk data for pie chart
  const diskFilesystems = [];
  if (data.disk?.raw) {
    const dfLines = data.disk.raw.split('\n').slice(1);
    for (const line of dfLines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 7) continue;
      if (parts[0].startsWith('tmpfs') || parts[0].startsWith('devtmpfs') || parts[0] === 'efivarfs') continue;
      diskFilesystems.push({
        source: parts[0],
        fstype: parts[1],
        size: parts[2],
        used: parts[3],
        avail: parts[4],
        percent: parseInt(parts[5], 10) || 0,
        mount: parts.slice(6).join(' '),
      });
    }
  }

  // Memory pie data
  const memPieData = memDetail ? [
    { name: 'Used', value: Math.max(0, memDetail.total - memDetail.free - (memDetail.cached || 0) - (memDetail.buffers || 0)), color: HEX.yellow },
    { name: 'Cached', value: memDetail.cached || 0, color: HEX.blue },
    { name: 'Buffers', value: memDetail.buffers || 0, color: HEX.purple },
    { name: 'Free', value: memDetail.free || 0, color: HEX.bg3 },
  ] : [];

  // Net latest values
  const latestNet = netHistory.length > 0 ? netHistory[netHistory.length - 1] : null;

  /* ── Render ──────────────────────────────────────────────────── */

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black uppercase tracking-tight text-gb-fg1">
          Dashboard — <span className="text-gb-aqua">{data.hostname}</span>
        </h1>
        <div className="flex items-center gap-2 text-xs text-gb-fg4 font-mono">
          <span className="w-2 h-2 bg-gb-green animate-pulse inline-block" />
          Live · 2s refresh
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ROW 1: Gauges + Uptime + Network summary
          ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU Gauge */}
        <div className="bg-gb-bg0 border-2 border-gb-bg2 p-5 flex items-center justify-center">
          <RingGauge value={avgCpu} label="CPU" sub={`${data.cpu.cores} cores · ${data.cpu.model?.split(' ').slice(-3).join(' ')}`} icon={Cpu} />
        </div>

        {/* Memory Gauge */}
        <div className="bg-gb-bg0 border-2 border-gb-bg2 p-5 flex items-center justify-center">
          <RingGauge value={data.memory.usedPercent} label="Memory" sub={`${memUsedGB} / ${memTotalGB} GB`} icon={MemoryStick} />
        </div>

        {/* Uptime + Load */}
        <div className="bg-gb-bg0 border-2 border-gb-bg2 p-5 flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-3">
            <Clock size={20} className="text-gb-green" />
            <span className="text-sm font-bold text-gb-fg3 uppercase tracking-wide">Uptime</span>
          </div>
          <p className="text-xl font-black text-gb-fg0 mb-3">{data.uptime}</p>
          <div className="space-y-1">
            {['1m', '5m', '15m'].map((k) => (
              <div key={k} className="flex items-center justify-between">
                <span className="text-xs text-gb-fg4 uppercase font-mono">{k}</span>
                <div className="flex items-center gap-2 flex-1 mx-3">
                  <div className="flex-1 h-1.5 bg-gb-bg2">
                    <div
                      className="h-full bg-gb-green transition-all duration-700"
                      style={{ width: `${Math.min(100, (data.load[k] / data.cpu.cores) * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs font-bold text-gb-fg2 font-mono w-8 text-right">{data.load[k]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Network summary */}
        <div className="bg-gb-bg0 border-2 border-gb-bg2 p-5 flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-3">
            <Wifi size={20} className="text-gb-purple" />
            <span className="text-sm font-bold text-gb-fg3 uppercase tracking-wide">Network I/O</span>
          </div>
          {latestNet ? (
            <>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <div className="text-xs text-gb-fg4 uppercase mb-1">↓ RX</div>
                  <div className="text-lg font-black text-gb-green font-mono">{formatRate(latestNet.rx)}</div>
                </div>
                <div>
                  <div className="text-xs text-gb-fg4 uppercase mb-1">↑ TX</div>
                  <div className="text-lg font-black text-gb-blue font-mono">{formatRate(latestNet.tx)}</div>
                </div>
              </div>
              {/* Mini sparkline */}
              <div className="flex items-end gap-px h-6">
                {netHistory.slice(-20).map((d, i) => {
                  const maxVal = Math.max(...netHistory.slice(-20).map((x) => x.rx + x.tx), 1);
                  const h = Math.max(1, ((d.rx + d.tx) / maxVal) * 24);
                  return <div key={i} className="flex-1 bg-gb-purple transition-all duration-300" style={{ height: `${h}px` }} />;
                })}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-gb-fg4 text-sm">
              <Activity size={14} className="animate-pulse" /> Gathering…
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ROW 2: CPU Area Chart (full width)
          ═══════════════════════════════════════════════════════════ */}
      <div className="bg-gb-bg0 border-2 border-gb-bg2 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Cpu size={20} className="text-gb-blue" />
            <span className="text-sm font-bold text-gb-fg3 uppercase tracking-wide">CPU Usage History</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-2xl font-black text-gb-fg0">{avgCpu.toFixed(1)}%</span>
          </div>
        </div>
        {cpuHistory.length > 1 ? (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={cpuHistory} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={HEX.blue} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={HEX.blue} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={HEX.bg2} strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fill: HEX.fg4, fontSize: 10 }} tickLine={false} axisLine={{ stroke: HEX.bg2 }} />
              <YAxis domain={[0, 100]} tick={{ fill: HEX.fg4, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<GruvboxTooltip />} />
              <Area
                type="monotone" dataKey="avg" name="Average"
                stroke={HEX.blue} fill="url(#cpuGrad)" strokeWidth={2}
                dot={false} isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-45 flex items-center justify-center text-gb-fg4 text-sm">
            <Activity size={16} className="animate-pulse mr-2" /> Building history…
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ROW 3: Per-Core Animated Bars
          ═══════════════════════════════════════════════════════════ */}
      <div className="bg-gb-bg0 border-2 border-gb-bg2 p-5">
        <div className="flex items-center gap-3 mb-4">
          <Zap size={20} className="text-gb-aqua" />
          <span className="text-sm font-bold text-gb-fg3 uppercase tracking-wide">Per-Core Usage</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {data.cpu.usage.map((pct, i) => {
            const color = pct > 90 ? HEX.red : pct > 70 ? HEX.yellow : HEX.aqua;
            return (
              <div key={i} className="flex flex-col items-center">
                {/* Vertical bar */}
                <div className="w-full h-20 bg-gb-bg2 flex flex-col-reverse relative overflow-hidden">
                  <div
                    className="w-full transition-all duration-700 ease-out"
                    style={{ height: `${pct}%`, background: color }}
                  />
                  {/* Glow overlay */}
                  <div
                    className="absolute bottom-0 w-full transition-all duration-700"
                    style={{ height: `${pct}%`, background: `linear-gradient(to top, ${color}33, transparent)` }}
                  />
                </div>
                <div className="mt-1.5 text-center">
                  <div className="text-xs font-bold font-mono" style={{ color }}>{pct.toFixed(0)}%</div>
                  <div className="text-xs text-gb-fg4 font-mono">C{i}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ROW 4: Memory Chart + Network Chart (side by side)
          ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Memory area chart */}
        <div className="bg-gb-bg0 border-2 border-gb-bg2 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <MemoryStick size={20} className="text-gb-yellow" />
              <span className="text-sm font-bold text-gb-fg3 uppercase tracking-wide">Memory History</span>
            </div>
            <span className="text-lg font-black text-gb-fg0">{memUsedGB} / {memTotalGB} GB</span>
          </div>
          {memHistory.length > 1 ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={memHistory} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="memUsedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={HEX.yellow} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={HEX.yellow} stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="memCachedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={HEX.blue} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={HEX.blue} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={HEX.bg2} strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fill: HEX.fg4, fontSize: 10 }} tickLine={false} axisLine={{ stroke: HEX.bg2 }} />
                <YAxis domain={[0, 100]} tick={{ fill: HEX.fg4, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<GruvboxTooltip />} />
                <Area type="monotone" dataKey="used" name="Used" stroke={HEX.yellow} fill="url(#memUsedGrad)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="cached" name="Cached" stroke={HEX.blue} fill="url(#memCachedGrad)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-gb-fg4 text-sm">
              <Activity size={16} className="animate-pulse mr-2" /> Building history…
            </div>
          )}
        </div>

        {/* Network throughput chart */}
        <div className="bg-gb-bg0 border-2 border-gb-bg2 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Wifi size={20} className="text-gb-purple" />
              <span className="text-sm font-bold text-gb-fg3 uppercase tracking-wide">Network Throughput</span>
            </div>
            {latestNet && (
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="text-gb-green">↓ {formatRate(latestNet.rx)}</span>
                <span className="text-gb-blue">↑ {formatRate(latestNet.tx)}</span>
              </div>
            )}
          </div>
          {netHistory.length > 1 ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={netHistory} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={HEX.green} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={HEX.green} stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={HEX.blue} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={HEX.blue} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={HEX.bg2} strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fill: HEX.fg4, fontSize: 10 }} tickLine={false} axisLine={{ stroke: HEX.bg2 }} />
                <YAxis tick={{ fill: HEX.fg4, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatRate(v)} />
                <Tooltip content={<GruvboxTooltip suffix="" formatter={formatRate} />} />
                <Area type="monotone" dataKey="rx" name="RX ↓" stroke={HEX.green} fill="url(#rxGrad)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="tx" name="TX ↑" stroke={HEX.blue} fill="url(#txGrad)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-gb-fg4 text-sm">
              <Activity size={16} className="animate-pulse mr-2" /> Waiting for second sample…
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ROW 5: Memory Pie + Disk Pie + Load Chart
          ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Memory breakdown pie */}
        <div className="bg-gb-bg0 border-2 border-gb-bg2 p-5">
          <div className="flex items-center gap-3 mb-4">
            <MemoryStick size={20} className="text-gb-yellow" />
            <span className="text-sm font-bold text-gb-fg3 uppercase tracking-wide">Memory Breakdown</span>
          </div>
          {memPieData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={130} height={130}>
                <PieChart>
                  <Pie
                    data={memPieData} cx="50%" cy="50%"
                    innerRadius={35} outerRadius={60}
                    dataKey="value" stroke="none"
                    isAnimationActive={true} animationDuration={800}
                  >
                    {memPieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 text-xs">
                {memPieData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <span className="w-3 h-3 inline-block" style={{ background: entry.color }} />
                    <span className="text-gb-fg3 uppercase w-14">{entry.name}</span>
                    <span className="font-bold text-gb-fg1 font-mono">{formatBytes(entry.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gb-fg4">Loading…</p>
          )}
        </div>

        {/* Disk usage bars */}
        <div className="bg-gb-bg0 border-2 border-gb-bg2 p-5">
          <div className="flex items-center gap-3 mb-4">
            <HardDrive size={20} className="text-gb-purple" />
            <span className="text-sm font-bold text-gb-fg3 uppercase tracking-wide">Disk Usage</span>
          </div>
          <div className="space-y-3">
            {diskFilesystems.map((fs, i) => {
              const pct = fs.percent;
              const color = pct > 90 ? HEX.red : pct > 70 ? HEX.yellow : HEX.purple;
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gb-fg3 font-mono truncate max-w-[60%]">{fs.mount}</span>
                    <span className="text-xs text-gb-fg4 font-mono">{fs.used} / {fs.size}</span>
                  </div>
                  <div className="w-full h-3 bg-gb-bg2 overflow-hidden relative">
                    <div
                      className="h-full transition-all duration-700 ease-out"
                      style={{ width: `${pct}%`, background: color }}
                    />
                    <span className="absolute right-1 top-0 h-full flex items-center text-[10px] font-bold font-mono"
                      style={{ color: pct > 50 ? HEX.bg0 : color }}>
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })}
            {diskFilesystems.length === 0 && (
              <p className="text-sm text-gb-fg4">No filesystem data</p>
            )}
          </div>
        </div>

        {/* Load average chart */}
        <div className="bg-gb-bg0 border-2 border-gb-bg2 p-5">
          <div className="flex items-center gap-3 mb-4">
            <Activity size={20} className="text-gb-orange" />
            <span className="text-sm font-bold text-gb-fg3 uppercase tracking-wide">Load Average</span>
          </div>
          {loadHistory.length > 1 ? (
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={loadHistory} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={HEX.bg2} strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fill: HEX.fg4, fontSize: 9 }} tickLine={false} axisLine={{ stroke: HEX.bg2 }} />
                <YAxis tick={{ fill: HEX.fg4, fontSize: 9 }} tickLine={false} axisLine={false} />
                <Tooltip content={<GruvboxTooltip suffix="" />} />
                <Line type="monotone" dataKey="1m" name="1 min" stroke={HEX.orange} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="5m" name="5 min" stroke={HEX.yellow} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="15m" name="15 min" stroke={HEX.green} strokeWidth={1} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-30 flex items-center justify-center text-gb-fg4 text-sm">
              <Activity size={16} className="animate-pulse mr-2" /> Building history…
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          ROW 6: Swap + Services + System Info
          ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Swap usage */}
        <div className="bg-gb-bg0 border-2 border-gb-bg2 p-5">
          <div className="flex items-center gap-3 mb-4">
            <HardDrive size={20} className="text-gb-orange" />
            <span className="text-sm font-bold text-gb-fg3 uppercase tracking-wide">Swap</span>
          </div>
          {swapTotal > 0 ? (
            <div className="flex items-center gap-4">
              <RingGauge value={swapPct} size={80} strokeWidth={6} label="" />
              <div className="text-sm space-y-1">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-gb-fg4 uppercase">Used</span>
                  <span className="font-bold text-gb-fg1 font-mono">{(swapUsed / 1e9).toFixed(2)} GB</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-gb-fg4 uppercase">Total</span>
                  <span className="font-bold text-gb-fg1 font-mono">{(swapTotal / 1e9).toFixed(2)} GB</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gb-fg4">No swap configured</p>
          )}
        </div>

        {/* Service Status */}
        <div className="bg-gb-bg0 border-2 border-gb-bg2 p-5">
          <div className="flex items-center gap-3 mb-4">
            <Server size={20} className="text-gb-orange" />
            <span className="text-sm font-bold text-gb-fg3 uppercase tracking-wide">Services</span>
          </div>
          <div className="space-y-2">
            {services.map((svc) => (
              <ServicePill key={svc.name} name={svc.name} active={svc.active} />
            ))}
            {services.length === 0 && (
              <p className="text-sm text-gb-fg4">Loading services…</p>
            )}
          </div>
        </div>

        {/* System Info */}
        <div className="bg-gb-bg0 border-2 border-gb-bg2 p-5">
          <div className="flex items-center gap-3 mb-4">
            <Monitor size={20} className="text-gb-blue" />
            <span className="text-sm font-bold text-gb-fg3 uppercase tracking-wide">System Info</span>
          </div>
          <div className="space-y-2.5 text-sm">
            {[
              { k: 'Hostname', v: data.hostname },
              { k: 'CPU', v: data.cpu.model },
              { k: 'Cores', v: data.cpu.cores },
              { k: 'Memory', v: `${memTotalGB} GB` },
              { k: 'Cached', v: `${cachedGB} GB` },
              { k: 'Buffers', v: `${buffersGB} GB` },
            ].map(({ k, v }) => (
              <div key={k} className="flex items-center justify-between border-b border-gb-bg2 pb-1.5">
                <span className="text-xs text-gb-fg4 uppercase">{k}</span>
                <span className="font-bold text-gb-fg1 text-xs font-mono text-right max-w-[65%] truncate">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
