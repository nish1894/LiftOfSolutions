import { useState } from "react";

/**
 * Wraps one async action with the busy and error state every form and button
 * needs. `run` resolves to true on success so callers can close a dialog or
 * reset a form without their own try/catch.
 */
export function useAction<Args extends unknown[]>(action: (...args: Args) => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(...args: Args): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action(...args);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { run, busy, error, clearError: () => setError(null) };
}
