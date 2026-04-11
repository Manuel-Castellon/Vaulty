import fs from "node:fs";
import path from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddCouponPage from "../AddCouponPage";
import { api } from "../../services/api";
import jsQR from "jsqr";

const navigateMock = vi.fn();

vi.mock("jsqr", () => ({
  default: vi.fn(),
}));

vi.mock("../../services/api", () => ({
  api: {
    ai: {
      extract: vi.fn(),
    },
    coupons: {
      create: vi.fn(),
    },
  },
}));

vi.mock("react-router-dom", async () => {
  return {
    useNavigate: () => navigateMock,
  };
});

function renderPage() {
  return render(<AddCouponPage />);
}

function mockFileApis() {
  const originalCreateElement = document.createElement.bind(document);

  class MockFileReader {
    onload: ((event: { target: { result: string } }) => void) | null = null;
    onerror: (() => void) | null = null;

    readAsDataURL() {
      this.onload?.({ target: { result: "data:image/png;base64,ZmFrZQ==" } });
    }
  }

  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = 10;
    height = 10;
    naturalWidth = 10;
    naturalHeight = 10;

    set src(_value: string) {
      this.onload?.();
    }
  }

  vi.stubGlobal("FileReader", MockFileReader);
  vi.stubGlobal("Image", MockImage);
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:mock"),
    revokeObjectURL: vi.fn(),
  });

  const getContext = vi.fn(() => ({
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(4),
      width: 10,
      height: 10,
    })),
  }));

  vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
    if (tagName === "canvas") {
      return {
        width: 0,
        height: 0,
        getContext,
      } as unknown as HTMLCanvasElement;
    }

    return originalCreateElement(tagName);
  }) as typeof document.createElement);
}

describe("AddCouponPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFileApis();
    vi.mocked(jsQR).mockReturnValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("keeps user-selected voucher type and shows suggestion banner when AI says coupon", async () => {
    vi.mocked(api.ai.extract).mockResolvedValue({
      extraction: {
        itemType: "coupon",
        title: "AI title",
        store: "AI store",
      },
    });

    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Voucher" }));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(
      fileInput,
      new File(["test"], "voucher.png", { type: "image/png" })
    );

    await screen.findByText("AI thinks this looks like a coupon.");
    expect(screen.getByRole("button", { name: "Voucher" }).className).toContain("typeBtnActive");
  });

  test("does not overwrite user-entered title during extraction", async () => {
    vi.mocked(api.ai.extract).mockResolvedValue({
      extraction: {
        itemType: "coupon",
        title: "AI title",
        store: "AI store",
      },
    });

    renderPage();
    await userEvent.type(screen.getByLabelText("Title"), "Custom title");
    await userEvent.click(screen.getByRole("button", { name: /paste text/i }));
    await userEvent.type(screen.getByPlaceholderText(/paste email or voucher text here/i), "test");
    await userEvent.click(screen.getByRole("button", { name: /extract/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Title")).toHaveValue("Custom title");
    });
    expect(screen.getByLabelText(/store \/ vendor/i)).toHaveValue("AI store");
  });

  test("preserves exact hebrew extraction output", async () => {
    vi.mocked(api.ai.extract).mockResolvedValue({
      extraction: {
        title: "פיצה משפחתית",
        store: "דומינוס",
      },
    });

    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /paste text/i }));
    await userEvent.type(screen.getByPlaceholderText(/paste email or voucher text here/i), "שובר");
    await userEvent.click(screen.getByRole("button", { name: /extract/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Title")).toHaveValue("פיצה משפחתית");
    });
  });

  test("switches type only when user accepts AI suggestion", async () => {
    vi.mocked(api.ai.extract).mockResolvedValue({
      extraction: {
        itemType: "voucher",
        title: "Dinner for two",
        store: "Restaurant",
        faceValue: 200,
      },
    });

    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /paste text/i }));
    await userEvent.type(screen.getByPlaceholderText(/paste email or voucher text here/i), "test");
    await userEvent.click(screen.getByRole("button", { name: /extract/i }));
    await userEvent.click(await screen.findByRole("button", { name: /switch to voucher/i }));

    expect(screen.getByRole("button", { name: "Voucher" }).className).toContain("typeBtnActive");
    expect(screen.getByLabelText(/face value/i)).toHaveValue(200);
  });

  test("renders language validation warning", async () => {
    vi.mocked(api.ai.extract).mockResolvedValue({
      extraction: {
        title: "Family Pizza",
        store: "Dominos",
      },
      warnings: ["language_validation_failed"],
    });

    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /paste text/i }));
    await userEvent.type(screen.getByPlaceholderText(/paste email or voucher text here/i), "test");
    await userEvent.click(screen.getByRole("button", { name: /extract/i }));

    await screen.findByText("AI may have translated some fields. Please verify before saving.");
  });

  test("uploads a real example pdf and fills the form without crashing", async () => {
    vi.mocked(api.ai.extract).mockResolvedValue({
      extraction: {
        itemType: "voucher",
        title: "Dominos PDF Voucher",
        store: "דומינוס",
        code: "123456",
      },
    });

    renderPage();

    const pdfBytes = fs.readFileSync(path.resolve(process.cwd(), "../../examples/dominos.pdf"));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(
      fileInput,
      new File([pdfBytes], "dominos.pdf", { type: "application/pdf" })
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Title")).toHaveValue("Dominos PDF Voucher");
    });
    expect(screen.getByLabelText(/store \/ vendor/i)).toHaveValue("דומינוס");
    expect(screen.getAllByText(/pdfs: qr scanning is limited/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /switch to voucher/i })).toBeInTheDocument();
  });

  test("save navigates using the actual selected item type", async () => {
    vi.mocked(api.coupons.create).mockResolvedValue({
      id: "1",
      userId: "u1",
      itemType: "voucher",
      code: "CODE",
      title: "Title",
      store: "Store",
      category: "other",
      isActive: true,
      usageCount: 0,
      createdAt: "",
      updatedAt: "",
    });

    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Voucher" }));
    await userEvent.type(screen.getByLabelText("Title"), "Title");
    await userEvent.type(screen.getAllByLabelText(/code \/ barcode/i)[0], "CODE");
    await userEvent.type(screen.getByLabelText(/store \/ vendor/i), "Store");
    await userEvent.click(screen.getByRole("button", { name: /save voucher/i }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/?type=voucher");
    });
  });

  test("persists detected QR data and shows extraction hint", async () => {
    vi.mocked(api.ai.extract).mockResolvedValue({
      extraction: {
        itemType: "voucher",
        title: "Voucher title",
        store: "Store",
        code: "ABC123",
      },
    });
    vi.mocked(api.coupons.create).mockResolvedValue({
      id: "1",
      userId: "u1",
      itemType: "voucher",
      code: "ABC123",
      title: "Voucher title",
      store: "Store",
      category: "other",
      isActive: true,
      usageCount: 0,
      createdAt: "",
      updatedAt: "",
    });
    vi.mocked(jsQR).mockReturnValue({ data: "https://example.com/qr" } as never);

    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Voucher" }));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, new File(["test"], "voucher.png", { type: "image/png" }));

    await screen.findByText("QR payload detected and added. It will be shown on the saved voucher.");
    await userEvent.click(screen.getByRole("button", { name: /save voucher/i }));

    await waitFor(() => {
      expect(api.coupons.create).toHaveBeenCalled();
    });
    expect(vi.mocked(api.coupons.create).mock.calls[0][0]).toMatchObject({
      qrCode: "https://example.com/qr",
    });
  });
});
