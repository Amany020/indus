export type BackendRole = "worker" | "supervisor" | "admin";
export type DisplayRole = "worker" | "reviewer" | "admin";

export function toDisplayRole(backendRole: BackendRole | string): DisplayRole {
  if (backendRole === "supervisor") return "reviewer";
  if (backendRole === "admin") return "admin";
  return "worker";
}
