/**
 * Lookup key for a recorded response in the showcase fixtures (src/showcase/fixtures/README.md).
 * name, plus " " and the params and query as JSON with sorted keys when either is given. The body
 * is never part of the key. Pure, so the recorder and the playback engine always agree.
 */
export interface KeyArgs {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
}

function sorted(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sorted((v as Record<string, unknown>)[k])]),
    );
  return v;
}

export function responseKey(name: string, args: KeyArgs = {}): string {
  const { params, query } = args;
  if (!params && !query) return name;
  return `${name} ${JSON.stringify(sorted({ params, query }))}`;
}

/** Keys of responses that depend on who is signed in (me, myTicket, personaFeed...). */
export function personaKey(persona: string, name: string, args: KeyArgs = {}): string {
  return `persona:${persona} ${responseKey(name, args)}`;
}
