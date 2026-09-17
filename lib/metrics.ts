export const METRICS = [
  { key: "study", label: "Study time", short: "Study", unit: "min", color: "#b9f66b", max: 1440, step: 1, group: "Study & career" },
  { key: "weight", label: "Body weight", short: "Weight", unit: "kg", color: "#97bfff", max: 500, step: 0.1, group: "Fitness & recovery" },
  { key: "sleep", label: "Sleep", short: "Sleep", unit: "hrs", color: "#c4a4ff", max: 24, step: 0.1, group: "Fitness & recovery" },
  { key: "protein", label: "Protein", short: "Protein", unit: "g", color: "#ffb98a", max: 1000, step: 0.1, group: "Nutrition" },
  { key: "calories", label: "Calories", short: "Calories", unit: "kcal", color: "#ffd578", max: 20000, step: 1, group: "Nutrition" },
  { key: "steps", label: "Steps", short: "Steps", unit: "steps", color: "#7edcc8", max: 200000, step: 1, group: "Fitness & recovery" },
  { key: "practice", label: "Practice score", short: "Practice", unit: "%", color: "#c4a4ff", max: 100, step: 0.1, group: "Study & career" },
  { key: "applications", label: "Job applications", short: "Applications", unit: "sent", color: "#97bfff", max: 1000, step: 1, group: "Study & career" },
  { key: "water", label: "Water", short: "Water", unit: "ml", color: "#7edcc8", max: 15000, step: 1, group: "Nutrition" },
  { key: "carbs", label: "Carbohydrate", short: "Carbs", unit: "g", color: "#ffd578", max: 3000, step: 0.1, group: "Nutrition" },
  { key: "fat", label: "Fat", short: "Fat", unit: "g", color: "#c4a4ff", max: 2000, step: 0.1, group: "Nutrition" },
  { key: "sugar", label: "Sugar", short: "Sugar", unit: "g", color: "#ffb98a", max: 2000, step: 0.1, group: "Nutrition" },
  { key: "fibre", label: "Fibre", short: "Fibre", unit: "g", color: "#b9f66b", max: 500, step: 0.1, group: "Nutrition" },
  { key: "sodium", label: "Sodium", short: "Sodium", unit: "mg", color: "#97bfff", max: 50000, step: 1, group: "Nutrition" },
] as const;
export type MetricKey = typeof METRICS[number]["key"];
export type Values = Partial<Record<MetricKey, number>>;
export const NUTRIENTS = ["calories", "protein", "carbs", "fat", "sugar", "fibre", "sodium"] as const;
export type Meal = { id: string; name: string; portion: string; type: "Breakfast" | "Lunch" | "Dinner" | "Snack"; nutrients: Values };
export type LiftSet = { reps: number; weight: number; rpe?: number };
export type Exercise = { id: string; name: string; muscle: string; sets: LiftSet[]; note: string };
export type Day = { values: Values; workout: "none" | "trained" | "rest"; note: string; meals: Meal[]; exercises: Exercise[]; fatigue?: number; soreness?: number };
export type Entry = Day & { date: string; revision: number };
export type Settings = { goals: Values; examName: string; examDate: string };
export type Habit = { id: string; name: string; created: string; archived: boolean };
export type HabitLog = { habitId: string; date: string };
export type Data = { entries: Entry[]; settings: Settings; settingsRevision: number; habits: Habit[]; habitLogs: HabitLog[] };
// A clean checkout starts without the original owner's personal targets.
export const DEFAULT_SETTINGS: Settings = { goals: {}, examName: "", examDate: "" };
export const EMPTY_DAY: Day = { values: {}, workout: "none", note: "", meals: [], exercises: [] };
export function dateKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export function shiftDate(day: string, n: number): string {
  const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function prettyDate(day: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }): string {
  return new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}
export function numberText(value: number | undefined, key?: MetricKey): string {
  if (value === undefined) return "—";
  if (key === "study" && value >= 60) return Math.floor(value / 60) + "h" + (value % 60 ? " " + Math.round(value % 60) + "m" : "");
  return value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}
export function hasEntry(entry?: Day): boolean {
  return !!entry && (Object.keys(entry.values).length > 0 || entry.workout !== "none" || !!entry.note || !!entry.meals?.length || !!entry.exercises?.length);
}
export function habitStreak(logs: HabitLog[], id: string, today: string): number {
  const days = new Set(logs.filter(l => l.habitId === id).map(l => l.date));
  let cursor = days.has(today) ? today : shiftDate(today, -1), streak = 0;
  while (days.has(cursor)) { streak++; cursor = shiftDate(cursor, -1); }
  return streak;
}
export function seriesFor(entries: Entry[], key: MetricKey, end: string, length: number) {
  const byDate = new Map(entries.map(e => [e.date, e.values[key]]));
  return Array.from({ length }, (_, i) => { const date = shiftDate(end, i - length + 1); return { date, value: byDate.get(date) ?? null }; });
}
