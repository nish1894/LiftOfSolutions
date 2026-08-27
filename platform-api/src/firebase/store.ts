import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Query,
} from "firebase-admin/firestore";

export const now = (): FieldValue => FieldValue.serverTimestamp();
export const increment = (value: number): FieldValue =>
  FieldValue.increment(value);

export function serialize(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serialize(item)]),
    );
  return value;
}

export function document<T extends DocumentData>(snapshot: {
  id: string;
  data(): DocumentData | undefined;
}): (T & { id: string }) | null {
  const data = snapshot.data();
  return data
    ? ({ id: snapshot.id, ...(serialize(data) as DocumentData) } as T & {
        id: string;
      })
    : null;
}

export class PlatformStore {
  constructor(readonly db: Firestore) {}
  user(uid: string): DocumentReference {
    return this.db.collection("users").doc(uid);
  }
  organization(organizationId: string): DocumentReference {
    return this.db.collection("organizations").doc(organizationId);
  }
  member(organizationId: string, uid: string): DocumentReference {
    return this.organization(organizationId).collection("members").doc(uid);
  }
  resource(
    organizationId: string,
    collection: string,
    id?: string,
  ): DocumentReference {
    const base = this.organization(organizationId).collection(collection);
    return id === undefined ? base.doc() : base.doc(id);
  }
  collection(organizationId: string, collection: string): Query {
    return this.organization(organizationId).collection(collection);
  }
  async list<T extends DocumentData>(
    query: Query,
  ): Promise<Array<T & { id: string }>> {
    const snapshot = await query.get();
    return snapshot.docs.map((item) => document<T>(item)!).filter(Boolean);
  }
}
