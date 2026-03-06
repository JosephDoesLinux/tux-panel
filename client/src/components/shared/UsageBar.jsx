/**
 * Horizontal usage bar with color thresholds (green → yellow → red).
 */
export default function UsageBar({ percent, color = 'bg-gb-aqua' }) {
  const num = parseInt(percent, 10) || 0;
  const barColor = num > 90 ? 'bg-gb-red' : num > 70 ? 'bg-gb-yellow' : color;
  return (
    <div className="w-full h-2 bg-gb-bg2">
      <div className={`h-full ${barColor} transition-all`} style={{ width: `${num}%` }} />
    </div>
  );
}
