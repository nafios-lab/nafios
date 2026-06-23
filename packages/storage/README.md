# @nafios/storage

Server-side Supabase Storage access for NafiOS — currently the avatar upload
path used by the onboarding flow. Keeps `@supabase/*` out of `apps/web` by going
through `@nafios/supabase-core`'s service-role client.

```ts
import { uploadAvatar } from "@nafios/storage";

const { path } = await uploadAvatar({
  uid: session.user.id,        // from the verified server session
  scope: "account",
  bytes: fittedWebpBytes,
  contentType: "image/webp",
});
// path === "avatars/<uid>/avatar.webp"  → write into profiles.avatar_url
```

SERVER-ONLY (bypasses RLS). See [`spec.md`](./spec.md) and
[`CLAUDE.md`](./CLAUDE.md). Requires the `avatars` bucket on staging and
`SUPABASE_SERVICE_ROLE_KEY` in the server env.
