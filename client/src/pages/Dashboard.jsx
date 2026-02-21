import { useEffect, useState } from 'react';
import { Cpu, MemoryStick, HardDrive, Wifi, Activity } from 'lucide-react';
import api from '../lib/api';

function StatCard({ icon: Icon, label, value, sub, color = 'text-blue-400' }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <Icon size={20} className={color} />
        <span className="text-sm font-medium text-gray-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
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
      <div className="text-red-400 bg-red-950/30 border border-red-800 rounded-lg p-4">
        Failed to load system data: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-gray-400">
        <Activity size={18} className="animate-pulse" />
        Loading system overview…
      </div>
    );
  }

  const memUsedGB = (data.memory.usedBytes / 1e9).toFixed(1);
  const memTotalGB = (data.memory.totalBytes / 1e9).toFixed(1);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">
        Dashboard — <span className="text-blue-400">{data.hostname}</span>
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Activity}
          label="Uptime"
          value={data.uptime}
          color="text-emerald-400"
        />
        <StatCard
          icon={Cpu}
          label="CPU"
          value={`${data.cpu.cores} cores`}
          sub={data.cpu.model}
          color="text-blue-400"
        />
        <StatCard
          icon={MemoryStick}
          label="Memory"
          value={`${memUsedGB} / ${memTotalGB} GB`}
          sub={`${data.memory.usedPercent}% used`}
          color="text-amber-400"
        />
        <StatCard
          icon={HardDrive}
          label="Load Average"
          value={`${data.load['1m']} / ${data.load['5m']} / ${data.load['15m']}`}
          sub="1m / 5m / 15m"
          color="text-purple-400"
        />
      </div>

      {/* Placeholder for Phase 4 charts */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-2">System Metrics</h2>
        <p className="text-sm text-gray-500">
          Live CPU/Memory/Disk charts will appear here in Phase 4.
        </p>
      </div>
    </div>
  );
}
