---
name: Render SMTP egress
description: Why Gmail SMTP can fail from Render even when order dispatch and email configuration are correct.
---

Render Free web services block outbound ports 25, 465, and 587. A Gmail SMTP connection on 465 can therefore fail with network-unreachable errors before any message is sent; setting the public API URL does not fix it. Use a paid Render web service that permits SMTP, or explicitly migrate to an HTTPS-based email provider.

**Why:** The public API and dispatch job can be healthy while all delivery attempts fail before SMTP; an earlier URL-configuration error may mask the separate port restriction until it is corrected. Render documents the restriction at https://render.com/docs/free.

**How to apply:** Check the host plan and delivery error class before recommending more SMTP retries or changing recipient addresses. Never treat a `FAILED` pre-SMTP attempt as a delivered message, and do not manually requeue ambiguous `SENDING` deliveries.