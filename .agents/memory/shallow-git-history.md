---
name: Shallow Git history
description: Older frontend revisions can be absent locally while still available upstream.
---

Do not infer that a historical web design never existed merely because no local branch or commit contains it. The local repository may be shallow.

**Why:** A requested older frontend revision was absent from all locally reachable history, but its explicitly identified commit still existed upstream. Selective comparison avoided restoring incompatible application logic.

**How to apply:** When restoring an older appearance, inspect a user-supplied commit from upstream before treating screenshots as the sole source. Reuse its visual elements selectively; do not check out the whole old application when current behavior must remain intact.