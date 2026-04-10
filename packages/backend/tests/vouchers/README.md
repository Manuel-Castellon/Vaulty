# Voucher Test Fixtures

Place real-world voucher files here for end-to-end extraction testing.

Supported formats: JPEG, PNG, PDF, plain text (.txt)

## Synthetic fixtures (committed)

Pre-built text fixtures covering key parsing scenarios:

| File | Scenario |
|---|---|
| `synthetic/01-percentage-discount.txt` | Percentage discount coupon |
| `synthetic/02-fixed-currency.txt` | Fixed-value gift voucher (USD) |
| `synthetic/03-hebrew-voucher.txt` | Hebrew RTL voucher (ILS) |
| `synthetic/04-multi-use.txt` | Multi-use loyalty coupon |
| `synthetic/05-no-expiry.txt` | Store credit with no expiry date |

## Running the tests

```bash
# All fixtures (synthetic + any real files you add here)
npm run test:vouchers

# Single file
npm run test:vouchers -- --file 03-hebrew-voucher.txt

# Image/PDF files require IMAGES_BUCKET env var
IMAGES_BUCKET=vaulty-images-dev-829808296740 \
REGION=us-east-1 \
npm run test:vouchers
```

Results are written to `tests/results/<filename>.json`.

## Adding real-world files

Drop any voucher image or PDF into this directory (or a subdirectory).
The runner will pick it up automatically.

Real files are gitignored (`*.jpg`, `*.jpeg`, `*.png`, `*.pdf` inside this dir).
