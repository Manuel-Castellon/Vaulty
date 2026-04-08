import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getIdToken, getCurrentUserId, signOut as cognitoSignOut } from "../services/auth";

interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  loading: boolean;
  signOut: () => void;
}

const AuthContext = createContext<AuthState>({
  isAuthenticated: false,
  userId: null,
  loading: true,
  signOut: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUserId()
      .then(setUserId)
      .finally(() => setLoading(false));
  }, []);

  const signOut = () => {
    cognitoSignOut();
    setUserId(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!userId, userId, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
