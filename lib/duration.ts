// Durations for people. The rule: anything 60 minutes or longer is shown in hours and minutes,
// never as a big number of minutes ("3 hours and 12 minutes", not "192 minutes").

/** Prose: "45 minutes", "1 hour", "3 hours and 12 minutes". */
export function formatDuration(mins: number): string {
  const total = Math.max(0, Math.round(mins));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const minutes = `${m} ${m === 1 ? "minute" : "minutes"}`;
  if (h === 0) return minutes;
  const hours = `${h} ${h === 1 ? "hour" : "hours"}`;
  return m === 0 ? hours : `${hours} and ${minutes}`;
}

/** Tight labels (badges, headers): "45 min", "1h", "3h 12m". */
export function formatDurationShort(mins: number): string {
  const total = Math.max(0, Math.round(mins));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
