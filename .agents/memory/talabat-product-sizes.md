---
name: TALABAT product sizes (exclusive) vs addons (additive)
description: Two distinct per-product option mechanisms exist; don't conflate them when extending menu items
---

## The two mechanisms
- `addons` (existing): additive, multi-select, checkbox-style. Each selected addon's price is added on top.
- `product_sizes` (added later): exclusive, single-select, radio-style. When a product has sizes, the
  selected size's `price` **replaces** the product's base `price` entirely (base price is not added).

**Why:** No size/variant concept existed originally; addons alone can't express "small/medium/large" because
addons stack additively rather than substituting the base price. Adding a parallel `product_sizes` table
(id, productId, name, nameAr, price, sortOrder, isAvailable) kept addons untouched and let unit price
computation stay simple: `unitPrice = (size ? size.price : product.price) + sum(selectedAddonPrices)`.

**How to apply:** When touching product pricing, cart logic, order placement, or the public menu payload,
remember both arrays travel on `Product` (`sizes[]`, `addons[]`). Cart item identity must incorporate both
`selectedSizeId` and `selectedAddonIds` (not just addons) or distinct size/addon combos will collide into one
cart line. `order_items` carries `sizeId`/`sizeName` alongside the addon linkage table, mirrored the same way
resolved server-side in the public order-placement route (validates the size belongs to the product and is
available before trusting its price).
