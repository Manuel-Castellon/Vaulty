import { Routes, Route, NavLink } from "react-router-dom";
import CouponsPage from "./pages/CouponsPage";
import CouponDetailPage from "./pages/CouponDetailPage";
import AddCouponPage from "./pages/AddCouponPage";

export default function App() {
  return (
    <div>
      <nav>
        <NavLink to="/">My Coupons</NavLink>
        <NavLink to="/add">Add Coupon</NavLink>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<CouponsPage />} />
          <Route path="/coupons/:id" element={<CouponDetailPage />} />
          <Route path="/add" element={<AddCouponPage />} />
        </Routes>
      </main>
    </div>
  );
}
