import { redirect } from "next/navigation";
import { LabClient } from "@/components/lab/lab-client";
import { canConfigure } from "@/lib/auth/roles";
import { getSessionOrNull } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Solo owner/admin: un miembro del equipo vuelve a la Bandeja. */
export default async function LabPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!canConfigure(session.role)) redirect("/inbox");
  return <LabClient />;
}
