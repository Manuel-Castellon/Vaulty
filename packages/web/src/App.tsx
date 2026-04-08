import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import RequireAuth from "./components/RequireAuth";
import CouponsPage from "./pages/CouponsPage";
import CouponDetailPage from "./pages/CouponDetailPage";
import AddCouponPage from "./pages/AddCouponPage";
import LoginPage from "./pages/LoginPage";
import SignUpPage from "./pages/SignUpPage";
import ConfirmPage from "./pages/ConfirmPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";

export default function App() {
  const { isAuthenticated, loading, signOut } = useAuth();

  return (
    <div>
      {isAuthenticated && !loading && (
        <nav style={{ display: "flex", gap: 16, padding: "12px 24px", borderBottom: "1px solid #eee", alignItems: "center" }}>
          <NavLink to="/" style={{ textDecoration: "none", fontWeight: 600 }}>My Coupons</NavLink>
          <NavLink to="/add" style={{ textDecoration: "none", fontWeight: 600 }}>+ Add</NavLink>
          <button
            onClick={signOut}
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#666" }}
          >
            Sign out
          </button>
        </nav>
      )}
      <main style={{ padding: "24px" }}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/confirm" element={<ConfirmPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          {/* Protected routes */}
          <Route path="/" element={<RequireAuth><CouponsPage /></RequireAuth>} />
          <Route path="/coupons/:id" element={<RequireAuth><CouponDetailPage /></RequireAuth>} />
          <Route path="/add" element={<RequireAuth><AddCouponPage /></RequireAuth>} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
