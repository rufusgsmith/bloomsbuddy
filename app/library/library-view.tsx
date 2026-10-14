// The Library tab. Links out to UCL's live seat page: UCL sends X-Frame-Options: SAMEORIGIN
// (and Cloudflare's bot check), so it can't be embedded in an iframe here.
// Nothing is fetched server-side: recommendations keep using the mock seat estimates.

const SEATS_URL = "https://www.ucl.ac.uk/library/forms/indigo-seat-availability.php?loc=all";

export function LibraryView() {
  return (
    <main className="mx-auto w-full max-w-md px-4 pb-28 pt-8">
      <header className="mb-5">
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Bloomsbuddy</p>
        <h1 className="text-3xl font-semibold tracking-tight">📚 Live library seats</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Live data from UCL Library Services
        </p>
      </header>
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-4xl" aria-hidden>
          🪑
        </p>
        <h2 className="mt-3 text-lg font-semibold">Hunting for a seat?</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          UCL won&apos;t let me show their seat map in here, but it&apos;s one tap away. Check
          which libraries have space before you trek across Bloomsbury.
        </p>
        <a
          href={SEATS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 flex min-h-14 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-base font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
        >
          View live seats on UCL ↗
        </a>
      </section>
    </main>
  );
}
