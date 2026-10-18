import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getCurrentUserId, getCurrentUserInfo, onAuthChange, signOut as cognitoSignOut } from "../services/auth";

interface AuthContextValue {
  isAuthenticated: boolean;
  userEmail: string | null;
  authProvider: "email" | "google" | null;
  loading: boolean;
  refreshAuth: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  userEmail: null,
  authProvider: null,
  loading: true,
  refreshAuth: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authProvider, setAuthProvider] = useState<"email" | "google" | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAuth = async () => {
    // Identity, not a fresh token: offline users with a stored session stay in.
    const [userId, info] = await Promise.all([getCurrentUserId(), getCurrentUserInfo()]);
    setIsAuthenticated(!!userId);
    setUserEmail(info.email);
    setAuthProvider(info.email ? info.provider : null);
  };

  useEffect(() => {
    refreshAuth()
      .catch((err: unknown) => console.error("[auth] session check failed:", err))
      .finally(() => setLoading(false));
    // Amplify can end the session on its own (revoked or expired refresh token).
    return onAuthChange(() => {
      refreshAuth().catch((err: unknown) => console.error("[auth] session check failed:", err));
    });
  }, []);

  const signOut = async () => {
    try {
      await cognitoSignOut();
    } catch (err) {
      console.error("[auth] sign-out failed:", err);
    }
    setIsAuthenticated(false);
    setUserEmail(null);
    setAuthProvider(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, userEmail, authProvider, loading, refreshAuth, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
