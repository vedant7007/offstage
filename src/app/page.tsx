// Placeholder until the public landing page lands (owned by Thanishka).
export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">Sutradhar</h1>
      <p>Agents propose. Policy decides. Humans approve. Code executes.</p>
      <p>
        Platform status:{" "}
        <a className="underline" href="/api/health">
          /api/health
        </a>
      </p>
    </main>
  );
}
