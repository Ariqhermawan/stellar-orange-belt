// Pure presentation helpers (unit-tested).

/** Percent of goal raised, clamped to 0–100 and rounded. */
export function progressPct(raised: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((raised / goal) * 100)));
}

/** Shorten a Stellar address/contract id for display: GABCDE…WXYZ. */
export function shortAddress(a: string): string {
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Human time remaining until a unix-seconds deadline, given "now" in seconds. */
export function timeLeft(deadlineSec: number, nowSec: number): string {
  const diff = deadlineSec - nowSec;
  if (diff <= 0) return "ended";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h left`;
  const mins = Math.floor((diff % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}
