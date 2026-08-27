import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "liftofsolutions-123",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
});

after(async () => {
  await environment?.cleanup();
});

test("signed-out browsers cannot access Firestore", async () => {
  const database = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(database, "organizations", "org-a")));
  await assertFails(setDoc(doc(database, "users", "user-a"), { email: "a@example.com" }));
});

test("signed-in browsers still use Node instead of direct Firestore", async () => {
  const database = environment.authenticatedContext("user-a").firestore();
  await assertFails(getDoc(doc(database, "organizations", "org-a", "agents", "agent-a")));
  await assertFails(setDoc(doc(database, "organizations", "org-a", "customers", "customer-a"), { name: "Blocked" }));
});
