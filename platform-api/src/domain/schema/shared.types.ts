// Generated from Schema_liftofsol; run npm run schema:sync. Do not edit by hand.
// Types used by more than one schema folder. Imported as "../shared.types".

// Role inside an organization (Organization schema, users.membership).
export type OrgRole = "owner" | "admin" | "member";

// Sign-in methods inside Firebase; organizations can limit them (organizations.settings.allowed_providers).
export type AuthProvider = "google" | "email" | "github"; // "email" = email + password

// Firebase puts the method in the token claim firebase.sign_in_provider under its own names.
// Map it before comparing with allowed_providers; an unknown value is not allowed.
export const FIREBASE_SIGN_IN_PROVIDERS: Record<string, AuthProvider> = {
  "google.com": "google",
  password: "email",
  "github.com": "github",
};

// Where a contact talks to an agent. Matches the agent schema's io node handlers, plus the web chat widget.
export type Channel = "web_widget" | "whatsapp" | "email" | "line";
