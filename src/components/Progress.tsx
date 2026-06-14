import { progressPct } from "../lib/format";

export function Progress({ raised, goal }: { raised: number; goal: number }) {
  const pct = progressPct(raised, goal);
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Funding progress"
    >
      <div className="progress-bar" style={{ width: `${pct}%` }} />
      <span className="progress-label">{pct}%</span>
    </div>
  );
}
