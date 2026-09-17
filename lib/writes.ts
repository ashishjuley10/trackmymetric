import { database } from "./storage";
import { commandSchema } from "./validation";
import { dateKey } from "./metrics";
import type { z } from "zod";

export class TrackerError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export type Command = z.infer<typeof commandSchema>;

export function dayStatement(db: D1Database, owner: string, c: Extract<Command, {action:"saveDay"}>) {
  const {action: _action, date, revision, ...day} = c;
  return db.prepare("INSERT INTO daily_entries (owner,date,payload,revision) VALUES (?,?,?,1) ON CONFLICT(owner,date) DO UPDATE SET payload=excluded.payload, revision=daily_entries.revision+1 WHERE daily_entries.revision=? RETURNING revision").bind(owner,date,JSON.stringify(day),revision);
}

export function settingsStatement(db: D1Database, owner: string, c: Extract<Command, {action:"saveSettings"}>) {
  return db.prepare("INSERT INTO preferences (owner,payload,revision) VALUES (?,?,1) ON CONFLICT(owner) DO UPDATE SET payload=excluded.payload, revision=preferences.revision+1 WHERE preferences.revision=? RETURNING revision").bind(owner,JSON.stringify(c.settings),c.revision);
}

export async function executeCommand(owner: string, raw: unknown) {
  const c = commandSchema.parse(raw);
  if ("date" in c && c.date > dateKey()) throw new TrackerError("You can only log today or a past date (UK time).");
  const db = database();
  if (c.action === "saveDay") {
    const result = await dayStatement(db,owner,c).first<{revision:number}>();
    if (!result) throw new TrackerError("This day changed in another window. Close this form, refresh, then review your entry.",409);
    const {action: _action, revision: _revision, ...entry} = c;
    return {...entry,revision:result.revision};
  }
  if (c.action === "saveSettings") {
    const result = await settingsStatement(db,owner,c).first<{revision:number}>();
    if (!result) throw new TrackerError("Your goals changed in another window. Refresh before editing again.",409);
    return {settings:c.settings,settingsRevision:result.revision};
  }
  if (c.action === "addHabit") {
    await db.prepare("INSERT INTO habits (owner,id,name,created,archived) VALUES (?,?,?,?,0) ON CONFLICT(owner,id) DO NOTHING").bind(owner,c.id,c.name,c.date).run();
    const habit = await db.prepare("SELECT id,name,created,archived FROM habits WHERE owner=? AND id=?").bind(owner,c.id).first<{id:string;name:string;created:string;archived:number}>();
    return {...habit,archived:!!habit?.archived};
  }
  if (c.action === "archiveHabit") {
    const result = await db.prepare("UPDATE habits SET archived=? WHERE owner=? AND id=? RETURNING id").bind(c.archived?1:0,owner,c.id).first();
    if (!result) throw new TrackerError("Habit not found.",404);
    return {id:c.id,archived:c.archived};
  }
  if (c.action === "deleteHabit") {
    await db.batch([
      db.prepare("DELETE FROM habit_logs WHERE owner=? AND habit_id=?").bind(owner,c.id),
      db.prepare("DELETE FROM habits WHERE owner=? AND id=?").bind(owner,c.id),
    ]);
    return {id:c.id,deleted:true};
  }
  const habit = await db.prepare("SELECT created,archived FROM habits WHERE owner=? AND id=?").bind(owner,c.id).first<{created:string;archived:number}>();
  if (!habit || habit.archived) throw new TrackerError("This habit is no longer active. Refresh to update your list.",404);
  if (c.date < habit.created) throw new TrackerError("Choose a date on or after this habit was created.");
  if (c.completed) await db.prepare("INSERT INTO habit_logs (owner,habit_id,date) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM habits WHERE owner=? AND id=? AND archived=0) ON CONFLICT DO NOTHING").bind(owner,c.id,c.date,owner,c.id).run();
  else await db.prepare("DELETE FROM habit_logs WHERE owner=? AND habit_id=? AND date=?").bind(owner,c.id,c.date).run();
  return {habitId:c.id,date:c.date,completed:c.completed};
}
