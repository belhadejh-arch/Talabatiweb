---
name: Restaurant account credentials
description: Operational constraint for the six-digit restaurant sign-in serials.
---

Restaurant account serials must remain recoverable by the admin UI while never being stored in plaintext. Their lookup hash and authenticated ciphertext both depend on `SESSION_SECRET`.

**Why:** Admins need to display or regenerate the serial, while the short six-digit value is too low-entropy to store as an unpeppered hash. Changing the secret also makes current lookup hashes and ciphertext unusable.

**How to apply:** Keep `SESSION_SECRET` stable across deploys. If it must change, plan a one-time credential reissue/backfill before switching the secret; never silently replace the secret and strand restaurant accounts.
