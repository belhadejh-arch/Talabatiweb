---
name: Restaurant invoice privacy
description: Customer data allowed in restaurant-facing order invoices versus driver-facing delivery emails.
---

Restaurant users may see the customer's name, order items and totals, and the name/status of the assigned driver. They must not receive customer phone, delivery coordinates/map links, or customer notes. Driver emails need the delivery location and order details to complete delivery.

**Why:** The user explicitly asked to keep customer location and contact details away from restaurants while preserving the information drivers need to deliver real orders.

**How to apply:** Enforce this at the restaurant API response boundary as well as the UI/print invoice. Keep driver and admin views separate; do not globally remove delivery details from shared invoice components.
