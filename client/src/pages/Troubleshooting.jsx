import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Wrench,
  Cpu,
  FileText,
  Stethoscope,
  ClipboardList,
  Activity,
  RefreshCw,
  AlertCircle,
  Search,
  ChevronDown,
  Copy,
  Check,
  Download,
  Terminal,
  Wifi,
  HardDrive,
  Shield,
  Server,
  MonitorX,
  Usb,
  CircuitBoard,
} from 'lucide-react';
import api from '../lib/api';
import useTabSync from '../hooks/useTabSync';

/* ── Shared helpers ──────────────────────────────────────────────── */

function CodeBlock({ children, title, maxH = 'max-h-96' }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(children || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gb-bg1 border-2 border-gb-bg2 overflow-hidden">
      {title && (
        <div className="flex items-center justify-between px-3 py-2 bg-gb-bg0 border-b-2 border-gb-bg2">
          <span className="text-xs font-bold text-gb-fg3 uppercase tracking-wide">{title}</span>
          <button onClick={copy} className="text-gb-fg4 hover:text-gb-fg1 transition-colors" title="Copy">
            {copied ? <Check size={14} className="text-gb-green" /> : <Copy size={14} />}
          </button>
        </div>
      )}
      <pre className={`p-3 text-xs font-mono text-gb-fg2 overflow-auto whitespace-pre-wrap wrap-break-word ${maxH}`}>
        {children || <span className="text-gb-fg4 italic">No data</span>}
      </pre>
    </div>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-gb-bg2 last:border-0">
      <span className="text-xs text-gb-fg4 uppercase shrink-0 w-40">{label}</span>
      <span className="text-xs font-bold text-gb-fg1 font-mono text-right">{value}</span>
    </div>
  );
}

function SectionCard({ icon: Icon, title, children, className = '' }) {
  return (
    <div className={`bg-gb-bg0 border-2 border-gb-bg2 ${className}`}>
      <div className="flex items-center gap-3 px-4 py-3 border-b-2 border-gb-bg2 bg-gb-bg0">
        {Icon && <Icon size={18} className="text-gb-aqua" />}
        <span className="text-sm font-bold text-gb-fg3 uppercase tracking-wide">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TAB 1: SYSTEM INFO
   ════════════════════════════════════════════════════════════════════ */

function SystemInfoTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch_ = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/diagnostics/sysinfo', signal ? { signal } : {});
      if (signal?.aborted) return;
      setData(res.data);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch_(controller.signal);
    return () => controller.abort();
  }, [fetch_]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  // Parse lscpu key-value pairs
  const cpuPairs = {};
  if (data.cpu) {
    for (const line of data.cpu.split('\n')) {
      const [k, ...v] = line.split(':');
      if (k && v.length) cpuPairs[k.trim()] = v.join(':').trim();
    }
  }

  // Parse hostnamectl
  const hostPairs = {};
  if (data.host) {
    for (const line of data.host.split('\n')) {
      const [k, ...v] = line.split(':');
      if (k && v.length) hostPairs[k.trim()] = v.join(':').trim();
    }
  }

  // Parse os-release
  const osPairs = {};
  if (data.osRelease) {
    for (const line of data.osRelease.split('\n')) {
      const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
      if (match) osPairs[match[1]] = match[2];
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gb-fg4">Detailed hardware and software specifications</span>
        <button onClick={fetch_} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors uppercase">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* OS / Host */}
        <SectionCard icon={Server} title="Operating System">
          <div className="space-y-0">
            <InfoRow label="OS" value={osPairs.PRETTY_NAME || hostPairs['Operating System']} />
            <InfoRow label="Kernel" value={data.kernel} />
            <InfoRow label="Hostname" value={hostPairs['Static hostname'] || hostPairs['Hostname']} />
            <InfoRow label="Architecture" value={cpuPairs['Architecture']} />
            <InfoRow label="Virtualization" value={hostPairs['Virtualization'] || 'None detected'} />
            <InfoRow label="Chassis" value={hostPairs['Chassis']} />
            <InfoRow label="Machine ID" value={hostPairs['Machine ID']} />
          </div>
        </SectionCard>

        {/* CPU */}
        <SectionCard icon={Cpu} title="Processor">
          <div className="space-y-0">
            <InfoRow label="Model" value={cpuPairs['Model name']} />
            <InfoRow label="Vendor" value={cpuPairs['Vendor ID']} />
            <InfoRow label="Cores" value={cpuPairs['CPU(s)']} />
            <InfoRow label="Threads/Core" value={cpuPairs['Thread(s) per core']} />
            <InfoRow label="Sockets" value={cpuPairs['Socket(s)']} />
            <InfoRow label="Max MHz" value={cpuPairs['CPU max MHz']} />
            <InfoRow label="Min MHz" value={cpuPairs['CPU min MHz']} />
            <InfoRow label="L1d Cache" value={cpuPairs['L1d cache']} />
            <InfoRow label="L1i Cache" value={cpuPairs['L1i cache']} />
            <InfoRow label="L2 Cache" value={cpuPairs['L2 cache']} />
            <InfoRow label="L3 Cache" value={cpuPairs['L3 cache']} />
            <InfoRow label="Flags" value={cpuPairs['Flags']?.split(' ').slice(0, 12).join(', ') + '…'} />
          </div>
        </SectionCard>

        {/* Memory */}
        <SectionCard icon={CircuitBoard} title="Memory">
          <CodeBlock title="lsmem">{data.memory}</CodeBlock>
        </SectionCard>

        {/* Block Devices */}
        <SectionCard icon={HardDrive} title="Block Devices">
          <CodeBlock title="lsblk">{data.blockDevices}</CodeBlock>
        </SectionCard>

        {/* PCI Devices */}
        <SectionCard icon={CircuitBoard} title="PCI Devices">
          <CodeBlock title="lspci" maxH="max-h-60">{data.pci}</CodeBlock>
        </SectionCard>

        {/* USB Devices */}
        <SectionCard icon={Usb} title="USB Devices">
          <CodeBlock title="lsusb" maxH="max-h-60">{data.usb}</CodeBlock>
        </SectionCard>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TAB 2: LOGS
   ════════════════════════════════════════════════════════════════════ */

function LogsTab() {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const logEndRef = useRef(null);

  // Filter state
  const [lines, setLines] = useState('200');
  const [priority, setPriority] = useState('');
  const [unit, setUnit] = useState('');
  const [since, setSince] = useState('');
  const [grepStr, setGrepStr] = useState('');

  const PRIORITIES = [
    { value: '', label: 'All' },
    { value: '0', label: '0 — Emergency' },
    { value: '1', label: '1 — Alert' },
    { value: '2', label: '2 — Critical' },
    { value: '3', label: '3 — Error' },
    { value: '4', label: '4 — Warning' },
    { value: '5', label: '5 — Notice' },
    { value: '6', label: '6 — Info' },
    { value: '7', label: '7 — Debug' },
  ];

  const TIME_PRESETS = [
    { value: '', label: 'Any time' },
    { value: '5 minutes ago', label: 'Last 5 min' },
    { value: '30 minutes ago', label: 'Last 30 min' },
    { value: '1 hour ago', label: 'Last hour' },
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Since yesterday' },
  ];

  const fetchLogs = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('lines', lines);
      if (priority) params.set('priority', priority);
      if (unit) params.set('unit', unit);
      if (since) params.set('since', since);
      if (grepStr) params.set('grep', grepStr);

      const res = await api.get(`/api/diagnostics/logs?${params.toString()}`, signal ? { signal } : {});
      if (signal?.aborted) return;
      setLogs(res.data.logs || '');
      setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [lines, priority, unit, since, grepStr]);

  useEffect(() => {
    const controller = new AbortController();
    fetchLogs(controller.signal);
    return () => controller.abort();
  }, []);

  // Colorize log lines
  const colorizedLogs = (logs || '').split('\n').map((line, i) => {
    let color = 'text-gb-fg3';
    if (/emerg|emergency/i.test(line)) color = 'text-gb-red font-bold';
    else if (/alert|crit/i.test(line)) color = 'text-gb-red';
    else if (/error|err\b|fail/i.test(line)) color = 'text-gb-orange';
    else if (/warn/i.test(line)) color = 'text-gb-yellow';
    else if (/notice/i.test(line)) color = 'text-gb-aqua';
    else if (/debug/i.test(line)) color = 'text-gb-fg4';
    return (
      <div key={i} className={`${color} text-xs font-mono leading-5 hover:bg-gb-bg2 px-2`}>
        {line}
      </div>
    );
  });

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-gb-bg0 border-2 border-gb-bg2 p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs text-gb-fg4 uppercase mb-1 font-bold">Lines</label>
            <select value={lines} onChange={(e) => setLines(e.target.value)}
              className="w-full bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-xs px-2 py-1.5 font-mono">
              {['50', '100', '200', '500', '1000', '2000'].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gb-fg4 uppercase mb-1 font-bold">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}
              className="w-full bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-xs px-2 py-1.5 font-mono">
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gb-fg4 uppercase mb-1 font-bold">Since</label>
            <select value={since} onChange={(e) => setSince(e.target.value)}
              className="w-full bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-xs px-2 py-1.5 font-mono">
              {TIME_PRESETS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gb-fg4 uppercase mb-1 font-bold">Unit</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g. sshd"
              className="w-full bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-xs px-2 py-1.5 font-mono placeholder:text-gb-bg4" />
          </div>
          <div>
            <label className="block text-xs text-gb-fg4 uppercase mb-1 font-bold">Search</label>
            <input value={grepStr} onChange={(e) => setGrepStr(e.target.value)}
              placeholder="grep pattern…"
              className="w-full bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-xs px-2 py-1.5 font-mono placeholder:text-gb-bg4" />
          </div>
          <div className="flex items-end">
            <button onClick={() => fetchLogs()} disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-bold border-2 border-gb-aqua-dim bg-gb-aqua text-gb-bg0-hard hover:opacity-90 transition-colors uppercase disabled:opacity-50">
              {loading ? <Activity size={12} className="animate-spin" /> : <Search size={12} />}
              Query
            </button>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Log output */}
      <div className="bg-gb-bg1 border-2 border-gb-bg2">
        <div className="flex items-center justify-between px-3 py-2 bg-gb-bg0 border-b-2 border-gb-bg2">
          <span className="text-xs font-bold text-gb-fg4 uppercase">
            journalctl — {(logs || '').split('\n').filter(Boolean).length} lines
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => { navigator.clipboard.writeText(logs); }}
              className="text-gb-fg4 hover:text-gb-fg1" title="Copy all">
              <Copy size={14} />
            </button>
          </div>
        </div>
        <div className="max-h-125 overflow-auto p-1">
          {colorizedLogs}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TAB 3: DIAGNOSTICS
   ════════════════════════════════════════════════════════════════════ */

function DiagnosticsTab() {
  const [failedUnits, setFailedUnits] = useState(null);
  const [dmesg, setDmesg] = useState(null);
  const [selinux, setSelinux] = useState(null);
  const [ports, setPorts] = useState(null);
  const [loading, setLoading] = useState(true);

  // Network tool state
  const [netTool, setNetTool] = useState('ping');
  const [netHost, setNetHost] = useState('');
  const [dnsType, setDnsType] = useState('A');
  const [netResult, setNetResult] = useState(null);
  const [netLoading, setNetLoading] = useState(false);

  // SMART state
  const [smartDev, setSmartDev] = useState('');
  const [smartResult, setSmartResult] = useState(null);
  const [smartLoading, setSmartLoading] = useState(false);

  const fetchAll = useCallback(async (signal) => {
    setLoading(true);
    const opts = signal ? { signal } : {};
    const [fu, dm, se, pt] = await Promise.allSettled([
      api.get('/api/diagnostics/failed-units', opts),
      api.get('/api/diagnostics/dmesg', opts),
      api.get('/api/diagnostics/selinux', opts),
      api.get('/api/diagnostics/ports', opts),
    ]);
    if (signal?.aborted) return;
    setFailedUnits(fu.status === 'fulfilled' ? fu.value.data.output : 'Error loading');
    setDmesg(dm.status === 'fulfilled' ? dm.value.data.dmesg : 'Error loading');
    setSelinux(se.status === 'fulfilled' ? se.value.data : null);
    setPorts(pt.status === 'fulfilled' ? pt.value.data.output : 'Error loading');
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchAll(controller.signal);
    return () => controller.abort();
  }, [fetchAll]);

  async function runNetTool() {
    if (!netHost.trim()) return;
    setNetLoading(true);
    setNetResult(null);
    try {
      let res;
      if (netTool === 'ping') {
        res = await api.post('/api/diagnostics/ping', { host: netHost });
      } else if (netTool === 'traceroute') {
        res = await api.post('/api/diagnostics/traceroute', { host: netHost });
      } else {
        res = await api.post('/api/diagnostics/dns', { host: netHost, type: dnsType });
      }
      setNetResult(res.data.output || res.data.error || 'No output');
    } catch (err) {
      setNetResult(`Error: ${err.message}`);
    } finally {
      setNetLoading(false);
    }
  }

  async function runSmart() {
    if (!smartDev.trim()) return;
    setSmartLoading(true);
    setSmartResult(null);
    try {
      const res = await api.get(`/api/diagnostics/smart/${smartDev}`);
      setSmartResult(res.data.output || 'No SMART data');
    } catch (err) {
      setSmartResult(`Error: ${err.message}`);
    } finally {
      setSmartLoading(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  // Parse failed units to check if clean
  const hasFailures = failedUnits && !failedUnits.includes('0 loaded units listed');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gb-fg4">System health checks and network diagnostics</span>
        <button onClick={() => fetchAll()} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors uppercase">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Failed Units */}
      <SectionCard icon={MonitorX} title={`Failed Systemd Units${hasFailures ? ' ⚠' : ''}`}>
        {hasFailures ? (
          <CodeBlock>{failedUnits}</CodeBlock>
        ) : (
          <div className="flex items-center gap-2 text-gb-green text-sm font-bold">
            <Check size={16} /> All units healthy — no failures detected
          </div>
        )}
      </SectionCard>

      {/* Network Tools */}
      <SectionCard icon={Wifi} title="Network Diagnostics">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gb-fg4 uppercase mb-1 font-bold">Tool</label>
              <select value={netTool} onChange={(e) => setNetTool(e.target.value)}
                className="bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-xs px-2 py-1.5 font-mono">
                <option value="ping">Ping</option>
                <option value="traceroute">Traceroute</option>
                <option value="dns">DNS Lookup</option>
              </select>
            </div>
            <div className="flex-1 min-w-50">
              <label className="block text-xs text-gb-fg4 uppercase mb-1 font-bold">Host</label>
              <input value={netHost} onChange={(e) => setNetHost(e.target.value)}
                placeholder="e.g. 8.8.8.8 or google.com"
                onKeyDown={(e) => e.key === 'Enter' && runNetTool()}
                className="w-full bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-xs px-2 py-1.5 font-mono placeholder:text-gb-bg4" />
            </div>
            {netTool === 'dns' && (
              <div>
                <label className="block text-xs text-gb-fg4 uppercase mb-1 font-bold">Type</label>
                <select value={dnsType} onChange={(e) => setDnsType(e.target.value)}
                  className="bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-xs px-2 py-1.5 font-mono">
                  {['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA', 'PTR'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}
            <button onClick={runNetTool} disabled={netLoading || !netHost.trim()}
              className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold border-2 border-gb-aqua-dim bg-gb-aqua text-gb-bg0-hard hover:opacity-90 transition-colors uppercase disabled:opacity-50">
              {netLoading ? <Activity size={12} className="animate-spin" /> : <Terminal size={12} />}
              Run
            </button>
          </div>
          {netResult && <CodeBlock title={`${netTool} ${netHost}`}>{netResult}</CodeBlock>}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Listening Ports */}
        <SectionCard icon={Wifi} title="Listening Ports">
          <CodeBlock maxH="max-h-64">{ports}</CodeBlock>
        </SectionCard>

        {/* SELinux */}
        <SectionCard icon={Shield} title="SELinux Denials">
          {selinux?.message === 'No SELinux denials found' ? (
            <div className="flex items-center gap-2 text-gb-green text-sm font-bold">
              <Check size={16} /> No SELinux denials
            </div>
          ) : selinux?.denials ? (
            <CodeBlock maxH="max-h-64">{selinux.denials}</CodeBlock>
          ) : (
            <p className="text-sm text-gb-fg4">{selinux?.message || 'Unable to check SELinux'}</p>
          )}
        </SectionCard>
      </div>

      {/* SMART Health */}
      <SectionCard icon={HardDrive} title="SMART Disk Health">
        <div className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-xs">
              <label className="block text-xs text-gb-fg4 uppercase mb-1 font-bold">Device</label>
              <input value={smartDev} onChange={(e) => setSmartDev(e.target.value)}
                placeholder="e.g. sda, nvme0n1"
                onKeyDown={(e) => e.key === 'Enter' && runSmart()}
                className="w-full bg-gb-bg1 border-2 border-gb-bg3 text-gb-fg1 text-xs px-2 py-1.5 font-mono placeholder:text-gb-bg4" />
            </div>
            <button onClick={runSmart} disabled={smartLoading || !smartDev.trim()}
              className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold border-2 border-gb-aqua-dim bg-gb-aqua text-gb-bg0-hard hover:opacity-90 transition-colors uppercase disabled:opacity-50">
              {smartLoading ? <Activity size={12} className="animate-spin" /> : <Stethoscope size={12} />}
              Check
            </button>
          </div>
          {smartResult && <CodeBlock title={`smartctl /dev/${smartDev}`}>{smartResult}</CodeBlock>}
        </div>
      </SectionCard>

      {/* dmesg */}
      <SectionCard icon={FileText} title="Kernel Ring Buffer (dmesg)">
        <CodeBlock maxH="max-h-80">{dmesg}</CodeBlock>
      </SectionCard>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   TAB 4: REPORTS
   ════════════════════════════════════════════════════════════════════ */

function ReportsTab() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generateReport() {
    setLoading(true);
    setReport(null);
    try {
      const res = await api.get('/api/diagnostics/report');
      setReport(res.data);
    } catch (err) {
      setReport({ report: `Error generating report: ${err.message}`, timestamp: new Date().toISOString() });
    } finally {
      setLoading(false);
    }
  }

  function downloadReport() {
    if (!report?.report) return;
    const blob = new Blob([report.report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tuxpanel-report-${report.timestamp.replace(/[:.]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyReport() {
    if (!report?.report) return;
    navigator.clipboard.writeText(report.report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="bg-gb-bg0 border-2 border-gb-bg2 p-6 text-center">
        <ClipboardList size={48} className="mx-auto mb-4 text-gb-aqua" />
        <h2 className="text-lg font-bold text-gb-fg1 mb-2">System Report Generator</h2>
        <p className="text-sm text-gb-fg4 max-w-lg mx-auto mb-6">
          Generate a comprehensive report of your system's hardware, software, network, services,
          and security configuration. Useful for troubleshooting and documentation.
        </p>
        <button onClick={generateReport} disabled={loading}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold border-2 border-gb-aqua-dim bg-gb-aqua text-gb-bg0-hard hover:opacity-90 transition-colors uppercase disabled:opacity-50">
          {loading ? (
            <>
              <Activity size={16} className="animate-spin" />
              Generating Report…
            </>
          ) : (
            <>
              <ClipboardList size={16} />
              Generate Report
            </>
          )}
        </button>
      </div>

      {report && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gb-fg4 font-mono">Generated: {report.timestamp}</span>
            <div className="flex items-center gap-2">
              <button onClick={copyReport}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors uppercase">
                {copied ? <Check size={12} className="text-gb-green" /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button onClick={downloadReport}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold border-2 border-gb-bg3 bg-gb-bg1 text-gb-fg4 hover:text-gb-fg1 hover:bg-gb-bg2 transition-colors uppercase">
                <Download size={12} /> Download .txt
              </button>
            </div>
          </div>
          <CodeBlock maxH="max-h-[600px]">{report.report}</CodeBlock>
        </div>
      )}
    </div>
  );
}

/* ── Small shared components ─────────────────────────────────────── */

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-40 gap-3 text-gb-fg4">
      <Activity size={20} className="animate-spin text-gb-aqua" />
      <span className="text-sm font-bold uppercase">Loading…</span>
    </div>
  );
}

function ErrorBanner({ message }) {
  return (
    <div className="flex items-center gap-2 text-gb-red bg-gb-bg1 border-2 border-gb-red-dim p-3 text-sm">
      <AlertCircle size={16} />
      {message}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   MAIN TROUBLESHOOTING PAGE
   ════════════════════════════════════════════════════════════════════ */

const TABS = [
  { key: 'sysinfo', icon: Cpu, label: 'System Info' },
  { key: 'logs', icon: FileText, label: 'Logs' },
  { key: 'diagnostics', icon: Stethoscope, label: 'Diagnostics' },
  { key: 'reports', icon: ClipboardList, label: 'Reports' },
];

export default function Troubleshooting() {
  const VALID_TAB_KEYS = TABS.map((x) => x.key);
  const [tab, setTab] = useTabSync(VALID_TAB_KEYS, 'sysinfo');

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight mb-6 text-gb-fg1">
        Troubleshooting
      </h1>

      {/* Tab bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-bold uppercase border-2 transition-colors ${
              tab === key
                ? 'bg-gb-bg1 text-gb-aqua border-gb-aqua-dim'
                : 'bg-gb-bg0 text-gb-fg4 border-gb-bg3 hover:text-gb-fg1 hover:bg-gb-bg1'
            }`}
          >
            <span className="flex items-center gap-2">
              <Icon size={16} />
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'sysinfo' && <SystemInfoTab />}
      {tab === 'logs' && <LogsTab />}
      {tab === 'diagnostics' && <DiagnosticsTab />}
      {tab === 'reports' && <ReportsTab />}
    </div>
  );
}
