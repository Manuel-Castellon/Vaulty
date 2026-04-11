import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CouponsPage from "../CouponsPage";
import type { Coupon } from "@coupon/shared";

vi.mock("react-router-dom", () => ({
  Link: ({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
  useSearchParams: () => [new URLSearchParams()],
}));

const deleteCouponMock = vi.fn();

vi.mock("../../hooks/useCoupons", () => ({
  useCoupons: () => ({
    coupons: mockCoupons,
    loading: false,
    error: null,
    deleteCoupon: deleteCouponMock,
  }),
}));

vi.mock("../../services/api", () => ({
  api: {
    ai: { search: vi.fn().mockResolvedValue({ items: [] }) },
  },
}));

const mockCoupon: Coupon = {
  id: "coupon-1",
  userId: "user-1",
  title: "Pizza discount",
  store: "Dominos",
  code: "PIZZA10",
  category: "food",
  itemType: "coupon",
  discount: { type: "percentage", value: 10 },
  usageCount: 0,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

let mockCoupons: Coupon[] = [];

describe("CouponsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCoupons = [mockCoupon];
  });

  it("shows empty vault state when there are no coupons", async () => {
    mockCoupons = [];
    render(<CouponsPage />);
    await waitFor(() => {
      expect(screen.getByText("Nothing saved yet")).toBeInTheDocument();
    });
  });

  it("renders coupon cards when coupons exist", async () => {
    render(<CouponsPage />);
    await waitFor(() => {
      expect(screen.getByText("Pizza discount")).toBeInTheDocument();
    });
  });

  it("shows inline confirmation when Delete is clicked (no window.confirm)", async () => {
    render(<CouponsPage />);
    await waitFor(() => {
      expect(screen.getByText("Pizza discount")).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole("button", { name: "Delete" });
    await userEvent.click(deleteBtn);

    // Should show inline confirmation, not call deleteCoupon yet
    expect(screen.getByRole("button", { name: "Yes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(deleteCouponMock).not.toHaveBeenCalled();
  });

  it("calls deleteCoupon when Yes is confirmed", async () => {
    deleteCouponMock.mockResolvedValue(undefined);
    render(<CouponsPage />);
    await waitFor(() => {
      expect(screen.getByText("Pizza discount")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes" }));

    expect(deleteCouponMock).toHaveBeenCalledWith("coupon-1");
  });

  it("cancels delete when Cancel is clicked", async () => {
    render(<CouponsPage />);
    await waitFor(() => {
      expect(screen.getByText("Pizza discount")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // Confirmation dismissed, Delete button is back
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(deleteCouponMock).not.toHaveBeenCalled();
  });

  it("shows filter empty state when coupons exist but filters yield nothing", async () => {
    render(<CouponsPage />);
    await waitFor(() => {
      expect(screen.getByText("Pizza discount")).toBeInTheDocument();
    });

    // Click the "Used" status filter to get no results
    const usedBtn = screen.getByRole("button", { name: "Used" });
    await userEvent.click(usedBtn);

    expect(screen.getByText("No items match your filters")).toBeInTheDocument();
  });
});
