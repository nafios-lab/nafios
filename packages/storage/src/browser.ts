// Public API — BROWSER (RLS-scoped) Supabase Storage access for NafiOS.
//
// Separate barrel from `.` (the SERVER-ONLY, service-role surface) so the two
// postures never mix in one import. These helpers take the caller's own session
// client and are authorized by the `avatars` owner-isolation storage RLS
// policies — safe to import into browser-reachable code. Imported as
// `@nafios/storage/browser`.

export {
  type SignAvatarUrlInput,
  type SignAvatarUrlResult,
  signAvatarUrlFromBrowser,
} from "./browser/sign-avatar-url";
export {
  type AvatarScope,
  type AvatarStorageClient,
  type UploadAvatarFromBrowserInput,
  type UploadAvatarResult,
  uploadAvatarFromBrowser,
} from "./browser/upload-avatar";
