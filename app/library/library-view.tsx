"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { PageHeader, secondaryButtonClass, TabPage } from "../form-ui";

// The Library tab. Embeds UCL's live seat page as an iframe in the student's browser.
// The page can't be fetched server-side (Cloudflare's bot check), so recommendations keep
// using the mock seat estimates. The fallback card shows only if the iframe errors or
// doesn't load within LOAD_TIMEOUT_MS. A frame the browser refuses still fires onLoad,
// so that case can't be detected here.

const SEATS_URL = "https://www.ucl.ac.uk/library/forms/indigo-seat-availability.php?loc=all";
const LOAD_TIMEOUT_MS = 8000;

// Set false to always show the fallback card.
const USE_IFRAME: boolean = true;

const noopSubscribe = () => () => {};

export function LibraryView() {
  // The iframe is client-only: a server-rendered one can finish loading before hydration,
  // so onLoad would be missed and the timeout would wrongly show the fallback card.
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");

  useEffect(() => {
    if (!USE_IFRAME) return;
    const timer = setTimeout(
      () => setStatus((s) => (s === "loading" ? "failed" : s)),
      LOAD_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, []);

  return (
    // The body is a column, so the seat map can take all the height left.
    <TabPage
      width="max-w-7xl"
      top={
        <PageHeader
          title="Library"
          subtitle="Live seats from UCL Library Services"
          action={
            <a href={SEATS_URL} target="_blank" rel="noopener noreferrer" className={secondaryButtonClass}>
              Open on UCL site ↗
            </a>
          }
        />
      }
      bodyClassName="flex flex-col pb-6 pt-5"
    >
      {USE_IFRAME && status !== "failed" ? (
        <>
          <div className="relative min-h-80 w-full flex-1 overflow-hidden rounded-xl border border-line bg-surface">
            {status === "loading" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-50 text-sm text-muted dark:bg-zinc-900 dark:text-zinc-400">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-emerald-600 dark:border-zinc-700 dark:border-t-emerald-400" />
                Loading seats…
              </div>
            )}
            {isClient && (
              <iframe
                src={SEATS_URL}
                title="UCL library seat availability"
                onLoad={() => setStatus("loaded")}
                onError={() => setStatus("failed")}
                className="absolute inset-0 h-full w-full"
              />
            )}
          </div>
        </>
      ) : (
        <section className="max-w-xl rounded-xl border border-line bg-surface p-5">
          <h2 className="text-lg font-semibold">Library seats</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            The UCL seat map can&apos;t be shown here. Open it on the UCL site to see which
            libraries have space.
          </p>
          <a
            href={SEATS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-on-primary hover:bg-primary-hover"
          >
            View live seats on UCL ↗
          </a>
        </section>
      )}
    </TabPage>
  );
}
