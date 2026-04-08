import { Link } from "react-router-dom";
import { useCoupons } from "../hooks/useCoupons";

export default function CouponsPage() {
  const { coupons, loading, error, deleteCoupon } = useCoupons();

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div>
      <h1>My Coupons</h1>
      {coupons.length === 0 && <p>No coupons yet. <Link to="/add">Add one!</Link></p>}
      <ul>
        {coupons.map((coupon) => (
          <li key={coupon.id}>
            <Link to={`/coupons/${coupon.id}`}>
              <strong>{coupon.title}</strong> — {coupon.store} ({coupon.code})
            </Link>
            <button onClick={() => deleteCoupon(coupon.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
