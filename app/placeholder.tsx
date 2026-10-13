/** A tab that isn't built yet. Server component: no state, just a friendly note. */
export function Placeholder({ title, blurb }: { title: string; blurb: string }) {
  return (
    <main className="mx-auto w-full max-w-md px-4 pb-28 pt-8">
      <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Bloomsbuddy</p>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
        <p className="font-medium">Coming soon</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{blurb}</p>
      </div>
    </main>
  );
}
