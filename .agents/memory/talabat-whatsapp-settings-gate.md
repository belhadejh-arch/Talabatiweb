---
name: TALABAT WhatsApp send gate
description: Why WhatsApp driver notifications may silently never send even with a token configured
---

## The gate
`sendWhatsAppToDriver` (artifacts/api-server/src/lib/whatsapp.ts) checks the `settings` table row
first: it no-ops (logs a warning, returns false, order still succeeds) unless
`settings.whatsappEnabled === true` AND `settings.whatsappPhoneId` is set — regardless of whether
`WhatsApp_API_Secret` is configured as a direct token.

**Why:** `seed.ts` creates the settings row with `whatsappEnabled: false` by default, so a freshly
seeded/reset dev DB always has WhatsApp notifications off even when the token secret exists. The
admin UI (`artifacts/talabat/src/pages/admin/settings.tsx`) has a toggle + phone-ID field for this —
if it's ever removed or the checkbox looks missing, the underlying column and gate are still there.

**How to apply:** When WhatsApp order notifications appear to not fire, first check `settings.whatsappEnabled`
and `settings.whatsappPhoneId` in the DB / admin Settings page before assuming a code bug — this has caused
the mistaken impression that the send path itself was untested or broken when it was just disabled.
