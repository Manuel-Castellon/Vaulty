import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getIdToken, initSecureStorage, signOut as cognitoSignOut } from "../services/auth";

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

let _storageInitialized = false;

export function __resetStorageInitForTests() {
  _storageInitialized = false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshAuth = async () => {
    if (!_storageInitialized) {
      await initSecureStorage();
      _storageInitialized = true;
    }
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
