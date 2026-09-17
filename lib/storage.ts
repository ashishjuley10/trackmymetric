import { env } from "cloudflare:workers";
import { DEFAULT_SETTINGS, type Data, type Day, type Settings } from "./metrics";
export function database() {
  if (!env.DB) throw new Error("TrackMyMetric database unavailable");
  return env.DB;
}
export async function readData(owner: string): Promise<Data> {
  const db = database();
  const [entries, prefs, habits, logs] = await Promise.all([
    db.prepare("SELECT date, payload, revision FROM daily_entries WHERE owner = ? ORDER BY date DESC").bind(owner).all<{date:string;payload:string;revision:number}>(),
    db.prepare("SELECT payload, revision FROM preferences WHERE owner = ?").bind(owner).first<{payload:string;revision:number}>(),
    db.prepare("SELECT id, name, created, archived FROM habits WHERE owner = ? ORDER BY created, rowid").bind(owner).all<{id:string;name:string;created:string;archived:number}>(),
    db.prepare("SELECT habit_id, date FROM habit_logs WHERE owner = ?").bind(owner).all<{habit_id:string;date:string}>(),
  ]);
  return {
    entries: entries.results.map(e => ({...JSON.parse(e.payload) as Day, date:e.date, revision:e.revision})),
    settings: prefs ? JSON.parse(prefs.payload) as Settings : DEFAULT_SETTINGS, settingsRevision: prefs?.revision ?? 0,
    habits: habits.results.map(h => ({...h, archived: !!h.archived})),
    habitLogs: logs.results.map(l => ({habitId:l.habit_id, date:l.date})),
  };
}
