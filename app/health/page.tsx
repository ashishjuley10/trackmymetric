import { requireChatGPTUser } from "@/app/chatgpt-auth";
import HealthSync from "./health-sync";
export const dynamic = "force-dynamic";
export const metadata = { title: "Apple Health · TrackMyMetric", description: "Review and save selected readings from Apple Health." };
export default async function HealthPage() {
  await requireChatGPTUser("/health");
  return <HealthSync />;
}
