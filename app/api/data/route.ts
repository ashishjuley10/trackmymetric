import { getChatGPTUser } from "@/app/chatgpt-auth";
import { readData } from "@/lib/storage";
import { commandSchema } from "@/lib/validation";
import { executeCommand, TrackerError } from "@/lib/writes";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {"Cache-Control":"private, no-store"}});
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return json({error:"Please sign in again to load your tracker."},401);
  try { return json(await readData(user.userId)); }
  catch (error) { console.error("Tracker load failed", error); return json({error:"Your tracker could not be loaded. Please try again."},503); }
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return json({error:"Your session expired. Sign in again before saving."},401);
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") return json({error:"Request origin is not allowed."},403);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({error:"Send JSON."},415);
  let raw: unknown;
  try { const text = await request.text(); if (text.length > 16000) return json({error:"Entry is too large."},413); raw = JSON.parse(text); }
  catch { return json({error:"Invalid entry."},400); }
  const parsed = commandSchema.safeParse(raw);
  if (!parsed.success) return json({error:parsed.error.issues[0]?.message ?? "Check your entry."},400);
  try { return json(await executeCommand(user.userId,parsed.data)); }
  catch (error) {
    if (error instanceof TrackerError) return json({error:error.message},error.status);
    console.error("Tracker save failed",error);
    return json({error:"Could not save. Your input is still here. Check your connection and try again."},503);
  }
}
