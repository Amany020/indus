"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { api, type Machine, type QueryResponse, type Factory, type Branch, type AuthUserData } from "@/lib/api";

import { BackendRole, DisplayRole, toDisplayRole } from "@/lib/roles";
export type { BackendRole, DisplayRole };
export { toDisplayRole };
export type Role = DisplayRole; // keep existing alias

export type View = "dashboard" | "chat" | "tips" | "admin" | "escalations" | "auth" | "documents";

interface AppState {
  role: DisplayRole;
  setRole: (r: DisplayRole) => void;
  view: View;
  setView: (v: View) => void;
  user: AuthUserData | null;
  setUser: (u: AuthUserData | null) => void;
  logout: () => void;
  factory: Factory | null;
  setFactory: (f: Factory | null) => void;
  branch: Branch | null;
  setBranch: (b: Branch | null) => void;
  machine: Machine | null;
  setMachine: (m: Machine | null) => void;
  sessionId: string;
  setSessionId: (s: string) => void;
  history: QueryResponse[];
  addToHistory: (q: QueryResponse) => void;
  clearHistory: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<DisplayRole>("worker");
  const [view, setView] = useState<View>("dashboard");
  const [user, setUser] = useState<AuthUserData | null>(null);
  const [factory, setFactory] = useState<Factory | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [machine, setMachine] = useState<Machine | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [history, setHistory] = useState<QueryResponse[]>([]);

  // Initialize persistent worker session ID isolated to this worker/browser
  useEffect(() => {
    let savedId = localStorage.getItem("indus_session_id");
    if (!savedId) {
      savedId = `session_${crypto.randomUUID().slice(0, 8)}`;
      localStorage.setItem("indus_session_id", savedId);
    }
    setSessionId(savedId);

    // Restore saved user if any
    const savedUser = localStorage.getItem("indus_user");
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        setUser(u);
        if (u.role) setRole(toDisplayRole(u.role));
      } catch (e) {
        // ignore
      }
    }
  }, []);

  const handleSetUser = useCallback((u: AuthUserData | null) => {
    setUser(u);
    if (u) {
      localStorage.setItem("indus_user", JSON.stringify(u));
      if (u.role) setRole(toDisplayRole(u.role));
      // Derive isolated session for this specific user
      const workerSession = `session_${u.id.slice(0, 8)}`;
      setSessionId(workerSession);
      localStorage.setItem("indus_session_id", workerSession);
    } else {
      localStorage.removeItem("indus_user");
    }
  }, []);

  const logout = useCallback(() => {
    api.clearToken();
    if (typeof window !== "undefined") {
      localStorage.removeItem("indus_user");
    }
    setUser(null);
    setRole("worker");
  }, []);

  const addToHistory = useCallback((q: QueryResponse) => {
    setHistory((prev) => [...prev, q]);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return (
    <AppContext.Provider
      value={{
        role,
        setRole,
        view,
        setView,
        user,
        setUser: handleSetUser,
        logout,
        factory,
        setFactory,
        branch,
        setBranch,
        machine,
        setMachine,
        sessionId,
        setSessionId,
        history,
        addToHistory,
        clearHistory,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    return {
      role: "worker" as DisplayRole,
      setRole: () => {},
      view: "dashboard" as View,
      setView: () => {},
      user: null,
      setUser: () => {},
      logout: () => {
        api.clearToken();
        if (typeof window !== "undefined") {
          localStorage.removeItem("indus_user");
        }
      },
      factory: null,
      setFactory: () => {},
      branch: null,
      setBranch: () => {},
      machine: null,
      setMachine: () => {},
      sessionId: "",
      setSessionId: () => {},
      history: [],
      addToHistory: () => {},
      clearHistory: () => {},
    };
  }
  return ctx;
}
