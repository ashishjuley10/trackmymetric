import { z } from "zod";
import { dateKey, shiftDate, type Values } from "./metrics";
import { dateSchema, valuesSchema } from "./validation";

export const HEALTH_METRICS = [
  { key: "steps", label: "Steps", unit: "count", displayUnit: "steps" },
  { key: "weight", label: "Body weight", unit: "kg", displayUnit: "kg" },
  { key: "sleep", label: "Sleep", unit: "hours", displayUnit: "hrs" },
  { key: "water", label: "Water", unit: "ml", displayUnit: "ml" },
] as const;
export type HealthMetric = typeof HEALTH_METRICS[number]["key"];
export const healthReadingSchema = z.object({
  metric: z.enum(["steps", "weight", "sleep", "water"]),
  value: z.number().finite().min(0),
  unit: z.enum(["count", "kg", "lb", "hours", "minutes", "ml", "L"]),
  source: z.string().trim().min(1).max(100).refine(v => !/[\x00-\x1f\x7f]/.test(v), "Use a single line for the Health source."),
}).strict().superRefine((r, ctx) => {
  const units = { steps: ["count"], weight: ["kg", "lb"], sleep: ["hours", "minutes"], water: ["ml", "L"] };
  if (!units[r.metric].includes(r.unit)) ctx.addIssue({ code: "custom", message: "The unit does not match " + r.metric + "." });
  const result = valuesSchema.safeParse({ [r.metric]: convert(r.value, r.unit) });
  if (!result.success) ctx.addIssue({ code: "custom", message: "Check the value for " + r.metric + "." });
});
export type HealthReading = z.infer<typeof healthReadingSchema>;
export const healthTransferSchema = z.object({
  version: z.literal(1),
  date: dateSchema.refine(v => v <= dateKey(), "Choose today or a past date in UK time."),
  readings: z.array(healthReadingSchema).min(1).max(4).refine(r => new Set(r.map(v => v.metric)).size === r.length, "Send one daily value per metric; duplicate metrics are not added together."),
}).strict();
export type HealthTransfer = z.infer<typeof healthTransferSchema>;
export const healthSaveSchema = z.object({
  requestId: z.string().uuid(),
  expectedRevision: z.number().int().min(0),
  transfer: healthTransferSchema,
}).strict();

function convert(value: number, unit: string) {
  const converted = unit === "lb" ? value * 0.45359237 : unit === "minutes" ? value / 60 : unit === "L" ? value * 1000 : value;
  // Preserve useful precision; water is stored as whole ml and steps as counts.
  return Math.round(converted * 1000000) / 1000000;
}
export function healthValues(readings: HealthReading[]): Values {
  return Object.fromEntries(readings.map(r => [r.metric, r.metric === "water" ? Math.round(convert(r.value, r.unit)) : convert(r.value, r.unit)]));
}

// A plain-text envelope is easy to create in Shortcuts without hand-assembling
// JSON. Accept exactly the documented fields and never execute pasted content.
export function parseHealthTransfer(text: string): HealthTransfer {
  if (text.length > 16000) throw new Error("This transfer is too large. Send one day's readings at a time.");
  const input = text.trim();
  if (input.startsWith("TMM_SLEEP_V1")) return parseSleepTransfer(input);
  if (input.startsWith("{")) {
    let raw: unknown;
    try { raw = JSON.parse(input); } catch { throw new Error("The Health transfer is not valid JSON."); }
    return healthTransferSchema.parse(raw);
  }
  const lines = input.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (lines.shift() !== "TMM_HEALTH_V1") throw new Error("Paste the output from your TrackMyMetric Health shortcut. This screen accepts its text or JSON output.");
  const fields: Record<string, string> = Object.create(null);
  for (const line of lines) {
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error("Each transfer field needs a name and an equals sign.");
    const key = line.slice(0, separator).trim(), value = line.slice(separator + 1).trim();
    if (!["date", "metric", "unit", "value", "source"].includes(key) || Object.hasOwn(fields, key)) throw new Error("Unexpected or repeated field in the Health transfer.");
    fields[key] = value;
  }
  const numeric = fields.value ?? "";
  if (!/^\d+(?:\.\d+)?$/.test(numeric) && !/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(numeric)) throw new Error("Use a numeric value with a decimal point, such as 72.4. Missing Health readings must not be sent as zero.");
  return healthTransferSchema.parse({ version: 1, date: fields.date, readings: [{ metric: fields.metric, unit: fields.unit, value: Number(numeric.replaceAll(",", "")), source: fields.source }] });
}

function londonNoon(date: string): number {
  const utc = Date.parse(date + "T12:00:00Z");
  const hour = Number(new Intl.DateTimeFormat("en-GB", {timeZone:"Europe/London",hour:"2-digit",hourCycle:"h23"}).format(new Date(utc)));
  return utc - (hour - 12) * 3600000;
}
function parseSleepTransfer(input: string): HealthTransfer {
  const lines = input.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (lines.shift() !== "TMM_SLEEP_V1") throw new Error("Invalid sleep transfer.");
  const dateLine = lines.shift() ?? "", sourceLine = lines.shift() ?? "";
  if (!dateLine.startsWith("date=") || !sourceLine.startsWith("source=")) throw new Error("Sleep transfers need a wake date and one Health source.");
  const date = dateSchema.parse(dateLine.slice(5)), source = sourceLine.slice(7);
  const windowStart = londonNoon(shiftDate(date, -1)), windowEnd = londonNoon(date);
  const intervals: [number, number][] = [];
  const asleep = new Set(["asleep", "asleepunspecified", "asleepcore", "asleepdeep", "asleeprem", "core", "deep", "rem"]);
  for (const line of lines) {
    const parts = line.split("|");
    if (parts.length !== 3) throw new Error("Each sleep row needs start time, end time and stage separated by |.");
    const [startText, endText, stageText] = parts.map(s => s.trim());
    if (![startText, endText].every(s => z.string().datetime({offset:true}).safeParse(s).success)) throw new Error("Use valid ISO 8601 dates with a timezone for sleep samples.");
    const start = Date.parse(startText), end = Date.parse(endText);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 86400000 || end > Date.now() + 60000) throw new Error("Check the start and end of each sleep sample.");
    const stage = stageText.replace(/^HKCategoryValueSleepAnalysis/i, "").toLowerCase().replace(/[^a-z]/g, "");
    if (stage === "awake" || stage === "inbed") continue;
    if (!asleep.has(stage)) throw new Error("Unrecognised sleep stage: " + stageText.slice(0,40) + ". Use Asleep, Core, Deep, REM, Awake or In Bed.");
    const a = Math.max(start, windowStart), b = Math.min(end, windowEnd);
    if (b > a) intervals.push([a,b]);
  }
  if (!intervals.length) throw new Error("No recorded sleep was found in this noon-to-noon window. Missing sleep is not imported as zero.");
  intervals.sort((a,b) => a[0] - b[0]);
  let total = 0, [start, end] = intervals[0];
  for (const [a,b] of intervals.slice(1)) {
    if (a <= end) end = Math.max(end,b);
    else { total += end - start; start = a; end = b; }
  }
  total += end - start;
  return healthTransferSchema.parse({ version:1, date, readings:[{ metric:"sleep", value:Math.round(total / 36000) / 100, unit:"hours", source }] });
}

export function shortcutTemplate(metric: HealthMetric): string {
  const unit = HEALTH_METRICS.find(m => m.key === metric)!.unit;
  return ["TMM_HEALTH_V1", "date=[Formatted Date]", "metric=" + metric, "unit=" + unit, "value=[Health Value]", "source=[Your Health source]"].join("\n");
}

export type HealthImportResult = { saved: true; date: string; revision: number; values: Values; readings: HealthReading[]; importedAt: string; replayed?: boolean };
export type HealthPreview = { date: string; revision: number; values: Values };
