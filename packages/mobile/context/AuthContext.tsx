import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getIdToken, signOut as cognitoSignOut } from "../services/auth";

interface AuthContextValue {
  isAuthenticated: boolean;
  loading: boolean;
  refreshAuth: () => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  loading: true,
  refreshAuth: async () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshAuth = async () => {
    const token = await getIdToken();
    setIsAuthenticated(!!token);
  };

  useEffect(() => {
    refreshAuth().finally(() => setLoading(false));
  }, []);

  const signOut = () => {
    cognitoSignOut();
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, loading, refreshAuth, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
