"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowUpRight } from "lucide-react";
import { ICON, PageHeader, primaryButton, TabPage } from "../form-ui";

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
    <TabPage top={<PageHeader title="Library" subtitle="Live data from UCL Library Services" />} bodyClassName="flex flex-col pb-4 pt-4">
      {USE_IFRAME && status !== "failed" ? (
        <>
          <div className="relative min-h-80 w-full flex-1 overflow-hidden rounded-xl border border-line bg-surface">
            {status === "loading" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-sunken text-sm text-muted">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-square" />
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
          <a
            href={SEATS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex min-h-11 items-center gap-1 self-end text-sm font-medium text-square hover:underline"
          >
            Open on UCL site
            <ArrowUpRight {...ICON} />
          </a>
        </>
      ) : (
        <section className="border-t border-line py-6">
          <h2 className="font-medium">The seat map won&apos;t load here</h2>
          <p className="mt-1 text-sm text-muted">
            UCL&apos;s site blocked it from showing inside Bloomsbuddy. Open it there to see which libraries
            have space right now.
          </p>
          <a
            href={SEATS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${primaryButton} mt-4`}
          >
            View live seats on UCL
            <ArrowUpRight {...ICON} />
          </a>
        </section>
      )}
    </TabPage>
  );
}
