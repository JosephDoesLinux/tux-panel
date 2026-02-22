import { useEffect, useState } from 'react';
import { Cpu, MemoryStick, HardDrive, Wifi, Activity } from 'lucide-react';
import api from '../lib/api';

function StatCard({ icon: Icon, label, value, sub, color = 'text-gb-blue' }) {
  return (
    <div className="bg-gb-bg0 border-2 border-gb-bg2 p-5">
      <div className="flex items-center gap-3 mb-3">
        <Icon size={20} className={color} />
        <span className="text-sm font-semibold text-gb-fg3 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-black text-gb-fg0">{value}</p>
      {sub && <p className="text-xs text-gb-fg4 mt-1">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/api/system/overview')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="text-gb-red bg-gb-bg1 border-2 border-gb-red-dim p-4">
        Failed to load system data: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-gb-fg4">
        <Activity size={18} className="animate-pulse" />
        Loading system overview…
      </div>
    );
  }

  const memUsedGB = (data.memory.usedBytes / 1e9).toFixed(1);
  const memTotalGB = (data.memory.totalBytes / 1e9).toFixed(1);

  return (
    <div>
      <h1 className="text-2xl font-black uppercase tracking-tight mb-6 text-gb-fg1">
        Dashboard — <span className="text-gb-aqua">{data.hostname}</span>
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Activity}
          label="Uptime"
          value={data.uptime}
          color="text-gb-green"
        />
        <StatCard
          icon={Cpu}
          label="CPU"
          value={`${data.cpu.cores} cores`}
          sub={data.cpu.model}
          color="text-gb-blue"
        />
        <StatCard
          icon={MemoryStick}
          label="Memory"
          value={`${memUsedGB} / ${memTotalGB} GB`}
          sub={`${data.memory.usedPercent}% used`}
          color="text-gb-yellow"
        />
        <StatCard
          icon={HardDrive}
          label="Load Average"
          value={`${data.load['1m']} / ${data.load['5m']} / ${data.load['15m']}`}
          sub="1m / 5m / 15m"
          color="text-gb-purple"
        />
      </div>

      {/* Placeholder for Phase 4 charts */}
      <div className="bg-gb-bg0 border-2 border-gb-bg2 p-6">
        <h2 className="text-lg font-bold text-gb-fg1 mb-2">System Metrics</h2>
        <p className="text-sm text-gb-fg4">
          Live CPU/Memory/Disk charts will appear here in Phase 4.
        </p>
      </div>
    </div>
  );
}
