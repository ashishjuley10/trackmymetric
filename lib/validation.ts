import { z } from "zod";
import { METRICS, type Values } from "./metrics";
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(v + "T12:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0,10) === v && v >= "2000-01-01" && v <= "2100-12-31";
}, "Choose a valid date.");
export const valuesSchema = z.record(z.number().finite()).superRefine((values, ctx) => {
  for (const [key, value] of Object.entries(values)) {
    const metric = METRICS.find(m => m.key === key);
    if (!metric || value < 0 || value > metric.max || (metric.step === 1 && !Number.isInteger(value)) || (key === "weight" && value === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Check the value for " + key });
    }
  }
}).transform(v => v as Values);
export const settingsSchema = z.object({
  goals: valuesSchema.refine(v => Object.values(v).every(x => x > 0), "Targets must be greater than zero."),
  examName: z.string().trim().max(60), examDate: z.union([z.literal(""), dateSchema]),
}).strict();
export const mealSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(100), portion: z.string().trim().min(1).max(80),
  type: z.enum(["Breakfast","Lunch","Dinner","Snack"]),
  nutrients: valuesSchema.refine(v => ["calories","protein","carbs","fat"].every(k => v[k as keyof typeof v] !== undefined), "Enter calories, protein, carbs and fat for the portion."),
}).strict();
export const exerciseSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(100), muscle: z.string().trim().min(1).max(40),
  sets: z.array(z.object({reps:z.number().int().min(1).max(500),weight:z.number().finite().min(0).max(2000),rpe:z.number().finite().min(1).max(10).optional()}).strict()).min(1).max(40),
  note:z.string().max(500),
}).strict();
export const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("saveDay"), date: dateSchema, revision: z.number().int().min(0),
    values: valuesSchema, workout: z.enum(["none", "trained", "rest"]), note: z.string().max(2000),
    meals:z.array(mealSchema).max(100), exercises:z.array(exerciseSchema).max(50),
    fatigue:z.number().int().min(1).max(5).optional(),soreness:z.number().int().min(1).max(5).optional() }).strict(),
  z.object({ action: z.literal("saveSettings"), revision: z.number().int().min(0), settings: settingsSchema }).strict(),
  z.object({ action: z.literal("addHabit"), id: z.string().uuid(), name: z.string().trim().min(1).max(70), date: dateSchema }).strict(),
  z.object({ action: z.literal("archiveHabit"), id: z.string().uuid(), archived: z.boolean() }).strict(),
  z.object({ action: z.literal("deleteHabit"), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("toggleHabit"), id: z.string().uuid(), date: dateSchema, completed: z.boolean() }).strict(),
]);
