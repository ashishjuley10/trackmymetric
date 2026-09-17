import { z } from "zod";
import { database } from "./storage";
import { commandSchema, dateSchema } from "./validation";
import { dateKey, EMPTY_DAY, type Day } from "./metrics";
import { dayStatement, TrackerError } from "./writes";
import { HEALTH_METRICS, healthSaveSchema, healthValues, type HealthImportResult } from "./health";

async function receipt(owner: string, id: string, hash: string): Promise<HealthImportResult | null> {
  const row = await database().prepare("SELECT fingerprint,result FROM health_imports WHERE owner=? AND request_id=?").bind(owner, id).first<{fingerprint:string;result:string}>();
  if (!row) return null;
  if (row.fingerprint !== hash) throw new TrackerError("This save was already used for different readings. Review your saved day before trying again.", 409);
  return { ...JSON.parse(row.result), replayed: true };
}

export async function saveHealthImport(owner: string, raw: unknown): Promise<HealthImportResult> {
  const a = healthSaveSchema.parse(raw);
  // Canonical order binds an idempotency receipt to the exact reviewed values.
  const transfer = { ...a.transfer, readings: a.transfer.readings.slice().sort((x,y) => x.metric.localeCompare(y.metric)) };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ expectedRevision: a.expectedRevision, transfer })));
  const hash = Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2,"0")).join("");
  const existing = await receipt(owner, a.requestId, hash);
  if (existing) return existing;
  const db = database();
  const row = await db.prepare("SELECT payload,revision FROM daily_entries WHERE owner=? AND date=?").bind(owner, transfer.date).first<{payload:string;revision:number}>();
  if ((row?.revision ?? 0) !== a.expectedRevision) throw new TrackerError("This day changed since your preview. Refresh the preview and choose the readings to save again.", 409);
  const day: Day = { ...EMPTY_DAY, ...(row ? JSON.parse(row.payload) : {}) };
  const values = healthValues(transfer.readings);
  const command = commandSchema.parse({ action: "saveDay", date: transfer.date, revision: a.expectedRevision, ...day, values: { ...day.values, ...values } });
  if (command.action !== "saveDay") throw new Error("Unexpected command");
  if (JSON.stringify(command).length > 16000) throw new TrackerError("This day is full. Shorten its notes before importing readings.");
  const result: HealthImportResult = { saved: true, date: transfer.date, revision: a.expectedRevision + 1, values, readings: transfer.readings, importedAt: new Date().toISOString() };
  const guardedReceipt = db.prepare("INSERT INTO health_imports (owner,request_id,fingerprint,result,created_at) VALUES (?,?,?,CASE WHEN COALESCE((SELECT revision FROM daily_entries WHERE owner=? AND date=?),0)=? THEN ? ELSE NULL END,?)")
    .bind(owner, a.requestId, hash, owner, transfer.date, a.expectedRevision, JSON.stringify(result), result.importedAt);
  try { await db.batch([guardedReceipt, dayStatement(db, owner, command)]); }
  catch (error) {
    const replay = await receipt(owner, a.requestId, hash);
    if (replay) return replay;
    const current = await db.prepare("SELECT revision FROM daily_entries WHERE owner=? AND date=?").bind(owner, transfer.date).first<{revision:number}>();
    if ((current?.revision ?? 0) !== a.expectedRevision) throw new TrackerError("This day changed before saving. No readings from this import were saved. Refresh the preview.", 409);
    throw error;
  }
  return result;
}

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function handleHealthRequest(request: Request, owner: string | null): Promise<Response> {
  if (!owner) return json({ error: "Sign in to TrackMyMetric on this browser, then return to Health sync." }, 401);
  try {
    if (request.method === "GET") {
      const rawDate = new URL(request.url).searchParams.get("date");
      const db = database();
      if (rawDate !== null) {
        const date = dateSchema.parse(rawDate);
        if (date > dateKey()) throw new TrackerError("Choose today or a past date in UK time.");
        const row = await db.prepare("SELECT payload,revision FROM daily_entries WHERE owner=? AND date=?").bind(owner, date).first<{payload:string;revision:number}>();
        const day: Day = row ? JSON.parse(row.payload) : EMPTY_DAY;
        return json({ date, revision: row?.revision ?? 0, values: Object.fromEntries(HEALTH_METRICS.filter(m => day.values[m.key] !== undefined).map(m => [m.key, day.values[m.key]])) });
      }
      const rows = await db.prepare("SELECT result FROM health_imports WHERE owner=? ORDER BY created_at DESC LIMIT 5").bind(owner).all<{result:string}>();
      return json({ imports: rows.results.map(r => JSON.parse(r.result)) });
    }
    if (request.method !== "POST") return json({error:"Method not supported."},405);
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") return json({error:"Request origin is not allowed."},403);
    if (!request.headers.get("content-type")?.includes("application/json")) return json({error:"Send JSON."},415);
    const text = await request.text();
    if (text.length > 16000) return json({error:"Send one day's selected readings at a time."},413);
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return json({error:"Invalid Health transfer."},400); }
    return json(await saveHealthImport(owner, raw));
  } catch (error) {
    if (error instanceof TrackerError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message ?? "Check your readings." },400);
    console.error("Health transfer unavailable", error instanceof Error ? error.name : "Unknown error");
    return json({ error: "Could not reach your tracker. Keep this preview open and retry the save." }, 503);
  }
}
