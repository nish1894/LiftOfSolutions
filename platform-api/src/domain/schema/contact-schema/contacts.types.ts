// Generated from Schema_liftofsol; run npm run schema:sync. Do not edit by hand.
// contacts and contact_identities collections: the people who chat with agents.
// "Contact", not "customer": a customer is our paying user (User schema).
// Connected to the Project schema (project_id) and the Inbox schema (conversations.contact_id).
// Keys: PK = primary key, FK = foreign key, UNIQUE = no two documents share the value.
//
// Rules enforced in code:
// - Contacts belong to a project, so they move with it if the project moves to another organization.
//   The same person writing to two projects is two contacts.
// - An incoming message is matched by (project_id, channel, external_id) in contact_identities.
//   Not found: create the contact and the identity in one transaction.
// - external_id is normalised before matching with normaliseExternalId(): a phone number in E.164
//   ("+919812345678"), an email address in lowercase. Anything that isn't valid afterwards (empty,
//   "abc", a bare "+") is refused before lookup or insert, so junk can't all match one contact.
// - A contact with status "blocked" is ignored: their messages are not stored and no agent runs.
// - Erasure (a contact asks to be forgotten): delete their identities, clear display_name, email,
//   phone and metadata, set status "deleted" and deleted_at. What happens to their messages is an
//   open decision (see ../README.md section 15).
// - Merging two contacts (the same person on web chat and WhatsApp) moves the identities to one
//   contact and marks the other "merged" with merged_into. Not needed at launch.

import type { Channel } from "../shared.types.js";

export type ContactStatus = "active" | "blocked" | "merged" | "deleted";

export interface Contact {
  _id: string;                 // PK. UUID v4
  project_id: string;          // FK → projects._id
  display_name?: string;       // from the channel profile, or typed in by a teammate
  email?: string;              // lowercase
  phone?: string;              // E.164
  country?: string;            // ISO 3166-1 alpha-2, e.g. "IN"; from the phone number or set by a teammate
  language?: string;           // BCP 47, e.g. "hi"
  metadata: Record<string, unknown>; // anything the business wants to keep, e.g. { plan: "gold" }
  status: ContactStatus;
  merged_into?: string;        // FK → contacts._id, with status "merged"
  created_at: Date;            // first contact
  updated_at: Date;
  deleted_at?: Date;           // with status "deleted"
}

// One way to reach a contact. UNIQUE together: project_id + channel + external_id.
export interface ContactIdentity {
  _id: string;                 // PK. UUID v4
  project_id: string;          // FK → projects._id
  contact_id: string;          // FK → contacts._id
  channel: Channel;
  external_id: string;         // WhatsApp/phone: E.164; email: address; web_widget: visitor id; LINE: user id
  created_at: Date;
}

// ---------- Helpers ----------

const E164 = /^\+[1-9][0-9]{6,14}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// external_id in the form used for matching. Throws when the result isn't a valid id for the channel.
export function normaliseExternalId(channel: Channel, value: string): string {
  const trimmed = value.trim();
  const result =
    channel === "email" ? trimmed.toLowerCase()
    : channel === "whatsapp" ? `+${trimmed.replace(/[^0-9]/g, "").replace(/^00/, "")}` // "+91 98123-45678" → "+919812345678"
    : trimmed;
  const valid = channel === "email" ? EMAIL.test(result) : channel === "whatsapp" ? E164.test(result) : result.length > 0;
  if (!valid) throw new Error(`invalid ${channel} id: "${value}"`);
  return result;
}
