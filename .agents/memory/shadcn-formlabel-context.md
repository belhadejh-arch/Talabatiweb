---
name: shadcn FormLabel requires FormField context
description: shadcn/ui's FormLabel always calls useFormField() internally — using it outside a FormField/FormItem throws "useFormField should be used within <FormField>"
---

shadcn/ui's `FormLabel` component internally calls `useFormField()`, which reads from React Hook Form context provided by an ancestor `<FormField>`/`<FormItem>`. It cannot be used as a plain label outside that context (e.g. next to a non-form-field UI element like a map/location picker).

**Why:** A standalone `<FormLabel>` used to label a map section (not bound to a form field) crashed the whole page with "useFormField should be used within <FormField>" — the error boundary caught it, so the page appeared entirely broken rather than showing an isolated error.

**How to apply:** When labeling something that isn't an actual react-hook-form field (custom widgets, section headers inside a form), import and use the plain Label from @/components/ui/label instead of FormLabel. Reserve FormLabel strictly for labels rendered inside a FormField/FormItem tree.
