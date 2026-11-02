import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/server-auth";
import { toDisplayRole, DisplayRole } from "@/lib/roles";

export const instant = false;

function getHomeRoute(role: DisplayRole): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "reviewer":
      return "/reviewer";
    case "worker":
    default:
      return "/worker";
  }
}

export default async function HomePage() {
  const user = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const displayRole: DisplayRole = toDisplayRole(user.role);
  redirect(getHomeRoute(displayRole));
}
