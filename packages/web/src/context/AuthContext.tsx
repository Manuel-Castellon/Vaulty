import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getCurrentUserId, getCurrentUserInfo, signOut as cognitoSignOut } from "../services/auth";

interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  userEmail: string | null;
  authProvider: "email" | "google" | null;
  loading: boolean;
  signOut: () => void;
}

const AuthContext = createContext<AuthState>({
  isAuthenticated: false,
  userId: null,
  userEmail: null,
  authProvider: null,
  loading: true,
  signOut: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authProvider, setAuthProvider] = useState<"email" | "google" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getCurrentUserId(), getCurrentUserInfo()])
      .then(([id, info]) => {
        setUserId(id);
        setUserEmail(info.email);
        setAuthProvider(info.email ? info.provider : null);
      })
      .finally(() => setLoading(false));
  }, []);

  const signOut = () => {
    cognitoSignOut();
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
