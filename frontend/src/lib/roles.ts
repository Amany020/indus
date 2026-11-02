export type BackendRole = "worker" | "supervisor" | "admin" | "expert";
export type DisplayRole = "worker" | "reviewer" | "admin";

export function toDisplayRole(backendRole: BackendRole | string): DisplayRole {
  if (backendRole === "supervisor") return "reviewer";
  if (backendRole === "admin") return "admin";
  // "expert" maps to "worker" display role in Phase 1 (inherits worker layout/routing)
  if (backendRole === "expert") return "worker";
  return "worker";
}

export function isExpertRole(role: string): boolean {
  return role === "expert";
}

export function roleLabel(role: string): "Worker" | "Reviewer" | "Admin" | "Expert Engineer" {
  if (role === "expert") return "Expert Engineer";
  if (role === "admin") return "Admin";
  if (role === "supervisor" || role === "reviewer") return "Reviewer";
  return "Worker";
}
