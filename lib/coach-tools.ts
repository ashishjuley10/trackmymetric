import { z } from "zod";
import { database, readData } from "./storage";
import { commandSchema, dateSchema, valuesSchema, mealSchema, exerciseSchema } from "./validation";
import { dateKey, EMPTY_DAY, METRICS, NUTRIENTS, habitStreak, type Day, type Entry, type Values } from "./metrics";
import { effectiveEntry, weeklySummary } from "./analysis";
import { dayStatement, settingsStatement, TrackerError } from "./writes";

const dayKeys = ["study","weight","sleep","steps","practice","applications","water"];
const requestId = z.string().min(8).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const revision = z.number().int().min(0);
const logDate = dateSchema.refine(v => v <= dateKey(), "Choose today or a past date in UK time.");
const recovery = z.number().int().min(1).max(5);
const newMeal = mealSchema.omit({id:true}).extend({
  nutrients: valuesSchema.refine(v => Object.keys(v).every(k => (NUTRIENTS as readonly string[]).includes(k)) && ["calories","protein","carbs","fat"].every(k => v[k as keyof Values] !== undefined), "Supply portion-specific calories, protein, carbs and fat; optional sugar, fibre and sodium."),
});
const newExercise = exerciseSchema.omit({id:true}).extend({muscle:z.string().trim().min(1).max(40).default("Other"),note:z.string().max(500).default("")});
const writeBase = {requestId, date:logDate, expectedRevision:revision};

export const toolSchemas = {
  read_week: z.object({endDate:logDate.optional()}).strict(),
  read_day: z.object({date:logDate.optional(),includeNotes:z.boolean().default(false)}).strict(),
  log_daily_metrics: z.object({...writeBase,
    values:valuesSchema.refine(v => Object.keys(v).every(k => dayKeys.includes(k)), "Log nutrition through log_meals.").default({}),
    workout:z.enum(["none","trained","rest"]).optional(),fatigue:recovery.optional(),soreness:recovery.optional(),
    appendNote:z.string().trim().min(1).max(1000).optional(),
  }).strict().refine(v => Object.keys(v.values).length || v.workout !== undefined || v.fatigue !== undefined || v.soreness !== undefined || v.appendNote !== undefined, "Supply at least one update."),
  log_meals: z.object({...writeBase,meals:z.array(newMeal).min(1).max(20)}).strict(),
  log_workout: z.object({...writeBase,exercises:z.array(newExercise).min(1).max(20)}).strict(),
  update_goals: z.object({requestId,expectedRevision:revision,
    goals:valuesSchema.refine(v => Object.values(v).every(x => x > 0), "Targets must be greater than zero.").optional(),
    examName:z.string().trim().max(60).optional(),examDate:z.union([z.literal(""),dateSchema]).optional(),
  }).strict().refine(v => (v.goals && Object.keys(v.goals).length) || v.examName !== undefined || v.examDate !== undefined, "Supply at least one goal or deadline update."),
  create_habit: z.object({requestId,name:z.string().trim().min(1).max(70),date:logDate}).strict(),
  set_habit_completion: z.object({requestId,habitId:z.string().uuid(),date:logDate,completed:z.boolean()}).strict(),
};
export type ToolName = keyof typeof toolSchemas;

type JsonSchema = Record<string,unknown>;
const object = (properties:Record<string,unknown>,required:string[]=[]):JsonSchema => ({type:"object",properties,required,additionalProperties:false});
const dateInput = {type:"string",pattern:"^\\d{4}-\\d{2}-\\d{2}$",description:"YYYY-MM-DD in Europe/London; use the date returned by read_day for today."};
const revisionInput = {type:"integer",minimum:0,description:"Latest revision from read_day, or settingsRevision from read_week for goals. Read first; never guess."};
const requestInput = {type:"string",minLength:8,maxLength:100,pattern:"^[a-zA-Z0-9_-]+$",description:"Unique ID for this intended change. Reuse it with the identical arguments on retry; use a new ID only for a new change."};
const numericFields = (keys:readonly string[]) => Object.fromEntries(METRICS.filter(m => keys.includes(m.key)).map(m => [m.key,{type:m.step === 1 ? "integer" : "number",minimum:m.key === "weight" ? 0.01 : 0,maximum:m.max,description:`${m.label}, ${m.unit}. An absolute value for the whole day, not an increment.`}]));
const writeFields = {requestId:requestInput,date:dateInput,expectedRevision:revisionInput};
const writeRequired = ["requestId","date","expectedRevision"];
const mealInput = object({name:{type:"string",minLength:1,maxLength:100},portion:{type:"string",minLength:1,maxLength:80,description:"The complete portion these nutrient values describe."},type:{type:"string",enum:["Breakfast","Lunch","Dinner","Snack"]},nutrients:object(Object.fromEntries(METRICS.filter(m => (NUTRIENTS as readonly string[]).includes(m.key)).map(m => [m.key,{type:m.step===1?"integer":"number",minimum:0,maximum:m.max,description:`${m.unit} for the complete described portion.`}])),["calories","protein","carbs","fat"])},["name","portion","type","nutrients"]);
const exerciseInput = object({name:{type:"string",minLength:1,maxLength:100},muscle:{type:"string",maxLength:40,description:"Muscle group if known; defaults to Other."},sets:{type:"array",minItems:1,maxItems:40,items:object({reps:{type:"integer",minimum:1,maximum:500},weight:{type:"number",minimum:0,maximum:2000,description:"Load in kg; 0 for unweighted exercises. Convert pounds before logging."},rpe:{type:"number",minimum:1,maximum:10,description:"Optional effort rating; omit if unknown."}},["reps","weight"])},note:{type:"string",maxLength:500}},["name","sets"]);

function definition(name:ToolName,title:string,description:string,inputSchema:JsonSchema,readOnly:boolean,destructive=false) {
  return {name,title,description,inputSchema,annotations:{readOnlyHint:readOnly,destructiveHint:destructive,idempotentHint:true,openWorldHint:false},securitySchemes:[{type:"oauth2",scopes:[]} ]};
}
export const coachToolDefinitions = [
  definition("read_week","Review your week","Read seven days of the signed-in user's TrackMyMetric metrics, nutrition totals, training counts, habits, current goals and settingsRevision. Missing records are unknown, not zero; partial food logs can understate intake. Journal and exercise notes are excluded. No changes.",object({endDate:dateInput}),true),
  definition("read_day","Read a daily log","Read a day's workouts, meals, daily totals, habit IDs/completions, and revision before logging. Defaults to today in UK time. Set includeNotes only when the user asks to use their journal or exercise notes. Returns revision 0 for an unlogged day.",object({date:dateInput,includeNotes:{type:"boolean",default:false}}),true),
  definition("log_daily_metrics","Save daily metrics","Save only user-requested daily totals, recovery ratings or a note. Values REPLACE the named day's totals; e.g. study is minutes and water is ml. Preserve all other fields and records. Read the day first. Do not infer measurements or mark activities as done from a future plan. Reuse requestId on retries.",object({...writeFields,values:object(numericFields(dayKeys)),workout:{type:"string",enum:["none","trained","rest"]},fatigue:{type:"integer",minimum:1,maximum:5},soreness:{type:"integer",minimum:1,maximum:5},appendNote:{type:"string",minLength:1,maxLength:1000}},writeRequired),false,true),
  definition("log_meals","Log meals","Append foods the user actually ate to their daily food log. Nutrients must describe the complete portion; calories, protein, carbs and fat are required. Ask about missing portions or nutrition. Never silently guess; explicitly discuss any estimate and obtain the user's agreement to log it. Read the day first. Retry with identical requestId and arguments to avoid duplicate foods.",object({...writeFields,meals:{type:"array",minItems:1,maxItems:20,items:mealInput}},[...writeRequired,"meals"]),false),
  definition("log_workout","Log a workout","Append completed exercises and sets to the chosen day and mark it trained. Reps and kg are required per set, RPE optional. Read the day first. Log only what the user reports, not a suggested or scheduled workout. Preserve existing exercises. Retry with identical requestId and arguments to avoid duplicates.",object({...writeFields,exercises:{type:"array",minItems:1,maxItems:20,items:exerciseInput}},[...writeRequired,"exercises"]),false),
  definition("update_goals","Update your targets","Change only the targets or exam details explicitly requested or accepted by the user. Read_week supplies settingsRevision. A request for a review or advice does not authorize changes. Preserve unspecified targets. This tool does not diagnose, prescribe or change medication.",object({requestId:requestInput,expectedRevision:revisionInput,goals:object(numericFields(METRICS.map(m=>m.key))),examName:{type:"string",maxLength:60},examDate:{anyOf:[dateInput,{type:"string",const:""}]}},["requestId","expectedRevision"]),false,true),
  definition("create_habit","Create a daily habit","Create a custom daily habit only when requested. date is the first trackable date (today or past). Does not mark it complete. A matching active name is returned instead of duplicated. Reuse requestId and identical arguments on retry.",object({requestId:requestInput,name:{type:"string",minLength:1,maxLength:70},date:dateInput},["requestId","name","date"]),false),
  definition("set_habit_completion","Set habit completion","Mark the selected active habit completed or uncompleted for a date, only as requested by the user. Read_day/read_week supplies actual habit IDs. This is an absolute state, never a toggle. Reuse requestId and identical arguments on retry.",object({requestId:requestInput,habitId:{type:"string",format:"uuid"},date:dateInput,completed:{type:"boolean"}},["requestId","habitId","date","completed"]),false,true),
];

function canonical(value:unknown):string {
  if (Array.isArray(value)) return "["+value.map(canonical).join(",")+"]";
  if (value && typeof value === "object") return "{"+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+":"+canonical(v)).join(",")+"}";
  return JSON.stringify(value);
}
async function fingerprint(name:string,args:unknown) {
  const bytes = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical({name,args})));
  return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,"0")).join("");
}
async function previousReceipt(owner:string,id:string,hash:string) {
  const row = await database().prepare("SELECT fingerprint,result FROM tool_requests WHERE owner=? AND request_id=?").bind(owner,id).first<{fingerprint:string;result:string}>();
  if (!row) return null;
  if (row.fingerprint !== hash) throw new TrackerError("That request ID was already used with different details. Read the saved record before preparing a new change.",409);
  return {...JSON.parse(row.result),replayed:true};
}

// D1 batch is a transaction. The NOT NULL result guard verifies the revision
// inside the transaction, before changing data; a failed guard rolls it all back.
async function commitTool(owner:string,id:string,hash:string,result:object,guardSql:string,guardArgs:(string|number)[],statements:D1PreparedStatement[]) {
  const db=database();
  const receipt=db.prepare(`INSERT INTO tool_requests (owner,request_id,fingerprint,result,created_at) VALUES (?,?,?,CASE WHEN (${guardSql}) THEN ? ELSE NULL END,?)`).bind(owner,id,hash,...guardArgs,JSON.stringify(result),new Date().toISOString());
  try { await db.batch([receipt,...statements]); }
  catch (error) {
    const prior=await previousReceipt(owner,id,hash);
    if(prior) return prior;
    const guard=await db.prepare(`SELECT (${guardSql}) AS valid`).bind(...guardArgs).first<{valid:number}>();
    if (!guard?.valid) throw new TrackerError("The record changed before saving. Nothing from this request was saved. Read it again and review the change before retrying with a new request ID.",409);
    throw error;
  }
  return result;
}

export async function callCoachTool(owner:string,name:ToolName,raw:unknown):Promise<object> {
  if (!Object.prototype.hasOwnProperty.call(toolSchemas,name)) throw new TrackerError("Unknown TrackMyMetric tool.",404);
  const args = toolSchemas[name].parse(raw);
  if (name === "read_week") {
    const a=args as z.infer<typeof toolSchemas.read_week>,data=await readData(owner),end=a.endDate??dateKey(),week=weeklySummary(data,end);
    return {today:dateKey(),timezone:"Europe/London",from:week.start,to:week.end,metrics:week.stats,units:Object.fromEntries(METRICS.map(m=>[m.key,m.unit])),trainingDays:week.workouts,restDays:week.rests,
      goals:data.settings.goals,examName:data.settings.examName,examDate:data.settings.examDate,settingsRevision:data.settingsRevision,
      habits:data.habits.filter(h=>!h.archived).map(h=>({...h,completedDates:data.habitLogs.filter(l=>l.habitId===h.id&&l.date>=week.start&&l.date<=end).map(l=>l.date),streak:habitStreak(data.habitLogs,h.id,end)})),
      notesIncluded:false,interpretation:"Averages use recorded days. Missing days are unknown and food logs may be partial. Targets are current, not historical."};
  }
  if (name === "read_day") {
    const a=args as z.infer<typeof toolSchemas.read_day>,data=await readData(owner),date=a.date??dateKey();
    const entry=effectiveEntry({...EMPTY_DAY,...data.entries.find(e=>e.date===date),date,revision:data.entries.find(e=>e.date===date)?.revision??0});
    const {note,exercises,...rest}=entry;
    return {...rest,timezone:"Europe/London",today:dateKey(),...(a.includeNotes?{note}:{}),exercises:exercises.map(({note:exNote,...e})=>({...e,...(a.includeNotes?{note:exNote}:{})})),notesIncluded:a.includeNotes,
      habits:data.habits.filter(h=>!h.archived&&h.created<=date).map(h=>({...h,completed:data.habitLogs.some(l=>l.habitId===h.id&&l.date===date)}))};
  }
  const id=(args as {requestId:string}).requestId,hash=await fingerprint(name,args);
  const previous=await previousReceipt(owner,id,hash);
  if(previous) return previous;
  const db=database();
  if(name === "update_goals") {
    const a=args as z.infer<typeof toolSchemas.update_goals>,data=await readData(owner);
    if(data.settingsRevision!==a.expectedRevision) throw new TrackerError("Your targets changed. Read_week again before updating them.",409);
    const c=commandSchema.parse({action:"saveSettings",revision:a.expectedRevision,settings:{...data.settings,goals:{...data.settings.goals,...a.goals},...(a.examName!==undefined?{examName:a.examName}:{}),...(a.examDate!==undefined?{examDate:a.examDate}:{})}});
    if(c.action!=="saveSettings") throw new Error("Unexpected command");
    const result={saved:true,settings:c.settings,settingsRevision:a.expectedRevision+1};
    return commitTool(owner,id,hash,result,"COALESCE((SELECT revision FROM preferences WHERE owner=?),0)=?",[owner,a.expectedRevision],[settingsStatement(db,owner,c)]);
  }
  if(name === "create_habit") {
    const a=args as z.infer<typeof toolSchemas.create_habit>,data=await readData(owner);
    const existing=data.habits.find(h=>!h.archived&&h.name.toLowerCase()===a.name.toLowerCase());
    if(existing) return {saved:false,alreadyExists:true,habit:existing};
    const habit={id:crypto.randomUUID(),name:a.name,created:a.date,archived:false},result={saved:true,habit};
    return commitTool(owner,id,hash,result,"NOT EXISTS (SELECT 1 FROM habits WHERE owner=? AND lower(name)=lower(?) AND archived=0)",[owner,a.name],[db.prepare("INSERT INTO habits (owner,id,name,created,archived) VALUES (?,?,?,?,0)").bind(owner,habit.id,a.name,a.date)]);
  }
  if(name === "set_habit_completion") {
    const a=args as z.infer<typeof toolSchemas.set_habit_completion>;
    const valid=await db.prepare("SELECT id FROM habits WHERE owner=? AND id=? AND archived=0 AND created<=?").bind(owner,a.habitId,a.date).first();
    if(!valid) throw new TrackerError("No active habit with that ID exists on this date. Read_day for the available habits.",404);
    const statement=a.completed?db.prepare("INSERT INTO habit_logs (owner,habit_id,date) VALUES (?,?,?) ON CONFLICT DO NOTHING").bind(owner,a.habitId,a.date):db.prepare("DELETE FROM habit_logs WHERE owner=? AND habit_id=? AND date=?").bind(owner,a.habitId,a.date);
    return commitTool(owner,id,hash,{saved:true,habitId:a.habitId,date:a.date,completed:a.completed},"EXISTS (SELECT 1 FROM habits WHERE owner=? AND id=? AND archived=0 AND created<=?)",[owner,a.habitId,a.date],[statement]);
  }
  const a=args as z.infer<typeof toolSchemas.log_daily_metrics>|z.infer<typeof toolSchemas.log_meals>|z.infer<typeof toolSchemas.log_workout>;
  const row=await db.prepare("SELECT payload,revision FROM daily_entries WHERE owner=? AND date=?").bind(owner,a.date).first<{payload:string;revision:number}>();
  if((row?.revision??0)!==a.expectedRevision) throw new TrackerError("This day has changed. Read_day again before saving.",409);
  const day:Day={...EMPTY_DAY,...(row?JSON.parse(row.payload):{})};
  let changes:object;
  if("meals" in a) {
    const meals=a.meals.map(m=>({...m,id:crypto.randomUUID()}));day.meals=[...day.meals,...meals];changes={meals};
  } else if("exercises" in a) {
    const exercises=a.exercises.map(e=>({...e,id:crypto.randomUUID()}));day.exercises=[...day.exercises,...exercises];day.workout="trained";
    changes={exercises:exercises.map(({note:_note,...e})=>e),workout:"trained"};
  } else {
    day.values={...day.values,...a.values};
    if(a.workout!==undefined) {
      if(a.workout==="rest"&&day.exercises.length) throw new TrackerError("This day already contains exercises. Review those in the tracker before marking it as rest.");
      day.workout=a.workout;
    }
    if(a.fatigue!==undefined)day.fatigue=a.fatigue;
    if(a.soreness!==undefined)day.soreness=a.soreness;
    if(a.appendNote!==undefined)day.note=[day.note,a.appendNote].filter(Boolean).join("\n");
    changes={values:a.values,...(a.workout!==undefined?{workout:a.workout}:{}),...(a.fatigue!==undefined?{fatigue:a.fatigue}:{}),...(a.soreness!==undefined?{soreness:a.soreness}:{}),noteAppended:a.appendNote!==undefined};
  }
  const c=commandSchema.parse({action:"saveDay",date:a.date,revision:a.expectedRevision,...day});
  if(c.action!=="saveDay") throw new Error("Unexpected command");
  if(JSON.stringify(c).length>16000)throw new TrackerError("This day has reached the tracker entry size limit. Shorten notes or review existing entries before adding more.");
  const result={saved:true,date:a.date,revision:a.expectedRevision+1,changes};
  return commitTool(owner,id,hash,result,"COALESCE((SELECT revision FROM daily_entries WHERE owner=? AND date=?),0)=?",[owner,a.date,a.expectedRevision],[dayStatement(db,owner,c)]);
}
