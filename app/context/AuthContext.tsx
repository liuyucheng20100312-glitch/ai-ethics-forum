"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export interface AuthUser {
  userId: string;
  username: string;
  bio: string;
  avatar: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  isGuest: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  isGuest: false,
  login: () => {},
  logout: () => {},
  refreshUser: async () => {},
  authFetch: (url) => fetch(url),
});

const TOKEN_KEY = "ai_ethics_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const authFetch = useCallback(
    (url: string, options: RequestInit = {}) => {
      const t = token ?? (typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null);
      // If body is FormData, let the browser set Content-Type (includes multipart boundary)
      const isFormData = options.body instanceof FormData;
      return fetch(url, {
        ...options,
        headers: {
          ...(options.headers ?? {}),
          ...(t ? { Authorization: `Bearer ${t}` } : {}),
          ...(!isFormData ? { "Content-Type": "application/json" } : {}),
        },
      });
    },
    [token]
  );

  const refreshUser = useCallback(async () => {
    const t = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    if (!t) { setLoading(false); return; }
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setToken(t);
        setUser(data);
      } else {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      }
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  const login = (t: string, u: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, t);
    // Also set a cookie so middleware can verify auth server-side
    document.cookie = `ai_ethics_token=${t}; path=/; max-age=${30 * 24 * 3600}; SameSite=Lax`;
    setToken(t);
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    document.cookie = "ai_ethics_token=; path=/; max-age=0";
    setToken(null);
    setUser(null);
  };

  const isGuest = user?.userId === "guest";

  return (
    <AuthContext.Provider value={{ user, token, loading, isGuest, login, logout, refreshUser, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
