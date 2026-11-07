// Mechanical build snapshot: the reviewed schema folder remains the source of truth.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const files = ['shared.types.ts', 'user-schema/users.types.ts', 'organization-schema/organizations.types.ts',
  'project-schema/projects.types.ts', 'billing-schema/billing.types.ts', 'contact-schema/contacts.types.ts',
  'inbox-schema/inbox.types.ts', 'tool-run-schema/tool_runs.types.ts',
  'notification-schema/notifications.types.ts', 'audit-schema/audit_events.types.ts',
  'knowledge-source-schema/knowledge_sources.types.ts', 'assistant-schema/assistants.types.ts',
  'workflow-schema/workflows.types.ts'];
for (const file of files) {
  const source = await readFile(resolve(root, 'Schema_liftofsol', file), 'utf8');
  const expected = '// Generated from Schema_liftofsol; run npm run schema:sync. Do not edit by hand.\n' +
    source.replace(/from "(\.[^"]+)"/g, (_, path) => `from "${path}.js"`).trimEnd() + '\n';
  const target = resolve(root, 'platform-api/src/domain/schema', file);
  if (process.argv.includes('--check')) {
    if (await readFile(target, 'utf8') !== expected) throw new Error(`Stale schema snapshot: ${file}`);
  } else {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, expected);
  }
}
console.log(`Schema snapshots ${process.argv.includes('--check') ? 'checked' : 'updated'} (${files.length}).`);
