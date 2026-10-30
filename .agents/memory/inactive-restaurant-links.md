---
name: Inactive restaurant links
description: Public menu visibility and link-copy behavior for inactive restaurants.
---

Customer menu links are publicly available only when the restaurant is active and has an active subscription covering the current date. Do not bypass this gate just to make a copied URL appear valid. The admin UI should not allow copying a customer link while the restaurant is unavailable; customer-facing text should direct toward activation rather than requesting a replacement link.

**Why:** The user chose to keep restaurants hidden until activation.

**How to apply:** Preserve this rule when changing catalog routes, restaurant link generation, subscription handling, or restaurant admin controls.
