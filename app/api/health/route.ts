import { getChatGPTUser } from "@/app/chatgpt-auth";
import { handleHealthRequest } from "@/lib/health-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handleHealthRequest(request, (await getChatGPTUser())?.userId ?? null); }
export async function POST(request: Request) { return handleHealthRequest(request, (await getChatGPTUser())?.userId ?? null); }
