import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getCurrentUserId, getCurrentUserInfo, onAuthChange, signOut as cognitoSignOut } from "../services/auth";

interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  userEmail: string | null;
  authProvider: "email" | "google" | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  isAuthenticated: false,
  userId: null,
  userEmail: null,
  authProvider: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authProvider, setAuthProvider] = useState<"email" | "google" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = () =>
      Promise.all([getCurrentUserId(), getCurrentUserInfo()])
        .then(([id, info]) => {
          setUserId(id);
          setUserEmail(info.email);
          setAuthProvider(info.email ? info.provider : null);
        })
        .catch((err: unknown) => console.error("[auth] session check failed:", err))
        .finally(() => setLoading(false));
    check();
    // Amplify can end the session on its own (revoked or expired refresh token).
    return onAuthChange(check);
  }, []);

  const signOut = async () => {
    try {
      await cognitoSignOut();
    } catch (err) {
      console.error("[auth] sign-out failed:", err);
    }
    setUserId(null);
    setUserEmail(null);
    setAuthProvider(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!userId, userId, userEmail, authProvider, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
