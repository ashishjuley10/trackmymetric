import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
export const dailyEntries = sqliteTable("daily_entries", {
  owner: text("owner").notNull(), date: text("date").notNull(), payload: text("payload").notNull(),
  revision: integer("revision").notNull().default(1),
}, t => [primaryKey({ columns: [t.owner, t.date] })]);
export const preferences = sqliteTable("preferences", {
  owner: text("owner").primaryKey(), payload: text("payload").notNull(), revision: integer("revision").notNull().default(1),
});
export const habits = sqliteTable("habits", {
  owner: text("owner").notNull(), id: text("id").notNull(), name: text("name").notNull(),
  created: text("created").notNull(), archived: integer("archived").notNull().default(0),
}, t => [primaryKey({ columns: [t.owner, t.id] })]);
export const habitLogs = sqliteTable("habit_logs", {
  owner: text("owner").notNull(), habitId: text("habit_id").notNull(), date: text("date").notNull(),
}, t => [primaryKey({ columns: [t.owner, t.habitId, t.date] })]);

// Receipts and their writes commit together. Repeating a ChatGPT request cannot
// add another workout or meal, even if the original response was lost.
export const toolRequests = sqliteTable("tool_requests", {
  owner: text("owner").notNull(), requestId: text("request_id").notNull(),
  fingerprint: text("fingerprint").notNull(), result: text("result").notNull(),
  createdAt: text("created_at").notNull(),
}, t => [primaryKey({ columns: [t.owner, t.requestId] })]);

// Store only the selected daily Health values, never an entire Health export.
export const healthImports = sqliteTable("health_imports", {
  owner: text("owner").notNull(), requestId: text("request_id").notNull(),
  fingerprint: text("fingerprint").notNull(), result: text("result").notNull(),
  createdAt: text("created_at").notNull(),
}, t => [primaryKey({ columns: [t.owner, t.requestId] }), index("health_imports_owner_created").on(t.owner, t.createdAt)]);
