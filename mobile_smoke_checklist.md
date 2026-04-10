# Mobile Smoke Checklist

Run these checks in Expo Go on a physical device after the extraction changes:

1. Start from the list screen, tap the `Voucher` FAB path, add a photo whose AI result says `coupon`, and confirm the screen stays on `Voucher` until you explicitly tap the suggestion banner action.
2. Type a custom title and store first, then extract from a photo, and confirm those typed values are not overwritten by AI output.
3. Scan a Hebrew voucher image and confirm Hebrew fields stay in Hebrew in the form.
4. Use an image with a QR code and confirm the extract card shows a QR success hint (`payload detected` or `image detected`), then save and verify the QR renders on the detail page.
5. Force or mock an extraction warning case and confirm the yellow translation warning appears without blocking save.
6. Save both a coupon and a voucher from the add screen and confirm each appears correctly in the list/detail flow.
