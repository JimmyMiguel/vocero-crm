import { redirect } from "next/navigation";
import { AgentClient } from "@/components/agent/agent-client";
import { canConfigure } from "@/lib/auth/roles";
import { getSessionOrNull } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Solo owner/admin: un miembro del equipo vuelve a la Bandeja. */
export default async function AgentPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!canConfigure(session.role)) redirect("/inbox");
  return <AgentClient />;
}
