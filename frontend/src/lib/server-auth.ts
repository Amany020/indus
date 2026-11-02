import { cookies } from "next/headers";

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export interface ServerUser {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  factory_id: string;
  branch_id: string | null;
  auth_mode: string;
}

export async function getServerUser(): Promise<ServerUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("indus_token")?.value;

    if (!token) {
      return null;
    }

    const res = await fetch(`${BASE_URL}/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    return data as ServerUser;
  } catch {
    return null;
  }
}
