import { Routes, Route, NavLink, Navigate, Link } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import RequireAuth from "./components/RequireAuth";
import CouponsPage from "./pages/CouponsPage";
import CouponDetailPage from "./pages/CouponDetailPage";
import EditCouponPage from "./pages/EditCouponPage";
import AddCouponPage from "./pages/AddCouponPage";
import LoginPage from "./pages/LoginPage";
import SignUpPage from "./pages/SignUpPage";
import ConfirmPage from "./pages/ConfirmPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import NotificationSettingsPage from "./pages/NotificationSettingsPage";
import SharedCouponPreviewPage from "./pages/SharedCouponPreviewPage";
import styles from "./app.module.css";

export default function App() {
  const { isAuthenticated, loading, signOut } = useAuth();

  return (
    <div>
      {isAuthenticated && !loading && (
        <nav className={styles.nav}>
          <Link to="/" className={styles.logo}>Vaulty</Link>
          <div className={styles.navLinks}>
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `${styles.navLink}${isActive ? ` ${styles.navLinkActive}` : ""}`
              }
            >
              My Coupons
            </NavLink>
            <NavLink
              to="/add"
              className={({ isActive }) =>
                `${styles.navLink}${isActive ? ` ${styles.navLinkActive}` : ""}`
              }
            >
              + Add
            </NavLink>
            <NavLink
              to="/settings/notifications"
              className={({ isActive }) =>
                `${styles.navLink}${isActive ? ` ${styles.navLinkActive}` : ""}`
              }
            >
              Notifications
            </NavLink>
          </div>
          <button className={styles.signOutBtn} onClick={signOut}>
            Sign out
          </button>
        </nav>
      )}
      <main className={isAuthenticated && !loading ? styles.main : ""}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/confirm" element={<ConfirmPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/shared/:shareToken" element={<SharedCouponPreviewPage />} />

          {/* Protected routes */}
          <Route path="/settings/notifications" element={<RequireAuth><NotificationSettingsPage /></RequireAuth>} />
          <Route path="/" element={<RequireAuth><CouponsPage /></RequireAuth>} />
          <Route path="/coupons/:id" element={<RequireAuth><CouponDetailPage /></RequireAuth>} />
          <Route path="/coupons/:id/edit" element={<RequireAuth><EditCouponPage /></RequireAuth>} />
          <Route path="/add" element={<RequireAuth><AddCouponPage /></RequireAuth>} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
