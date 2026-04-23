import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getIdToken, getCurrentUserInfo, initSecureStorage, signOut as cognitoSignOut } from "../services/auth";

interface AuthContextValue {
  isAuthenticated: boolean;
  userEmail: string | null;
  authProvider: "email" | "google" | null;
  loading: boolean;
  refreshAuth: () => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  userEmail: null,
  authProvider: null,
  loading: true,
  refreshAuth: async () => {},
  signOut: () => {},
});

let _storageInitialized = false;

export function __resetStorageInitForTests() {
  _storageInitialized = false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authProvider, setAuthProvider] = useState<"email" | "google" | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAuth = async () => {
    if (!_storageInitialized) {
      await initSecureStorage();
      _storageInitialized = true;
    }
    const [token, info] = await Promise.all([getIdToken(), getCurrentUserInfo()]);
    setIsAuthenticated(!!token);
    setUserEmail(info.email);
    setAuthProvider(info.email ? info.provider : null);
  };

  useEffect(() => {
    refreshAuth().finally(() => setLoading(false));
  }, []);

  const signOut = () => {
    cognitoSignOut();
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
