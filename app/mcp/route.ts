import { getChatGPTUser } from "@/app/chatgpt-auth";
import { handleMcp } from "@/lib/mcp";

export const dynamic="force-dynamic";
async function handle(request:Request) {
  const user=await getChatGPTUser();
  return handleMcp(request,user?.userId??null);
}
export {handle as POST,handle as GET,handle as DELETE};
