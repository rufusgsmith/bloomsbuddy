"use client";

import { useState } from "react";
import { slugFromLink } from "@/lib/societies/slug";
import type { Society } from "@/lib/types";
import { Field, inputClass, primaryButton } from "./form-ui";

// Paste a society's SU page link, check the page exists, and hand back { slug, name }.
// The name comes from the page itself, so nothing is guessed. Used by setup (step 3) and the Societies tab.

type LookupState = { status: "idle" } | { status: "checking" } | { status: "error"; message: string };

const OFFLINE = "Couldn't reach the SU website. Try again.";

export function SocietyPicker({ existing, onAdd }: { existing: Society[]; onAdd: (society: Society) => void }) {
  const [link, setLink] = useState("");
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });

  async function add() {
    if (!link.trim() || lookup.status === "checking") return;
    const slug = slugFromLink(link);
    if (!slug) {
      setLookup({
        status: "error",
        message: "That doesn't look like a society page. It should start with studentsunionucl.org/clubs-societies/",
      });
      return;
    }
    if (existing.some((s) => s.slug === slug)) {
      setLink("");
      setLookup({ status: "idle" });
      return;
    }
    setLookup({ status: "checking" });
    try {
      const res = await fetch(`/api/societies/lookup?slug=${encodeURIComponent(slug)}`);
      if (res.status === 404) {
        setLookup({ status: "error", message: `No society page at /clubs-societies/${slug}. Check the link.` });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onAdd((await res.json()) as Society);
      setLink("");
      setLookup({ status: "idle" });
    } catch (err) {
      console.warn("[societies]", err);
      setLookup({ status: "error", message: OFFLINE });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="flex-1">
          <Field label="SU page link">
            <input
              className={inputClass}
              inputMode="url"
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                if (lookup.status === "error") setLookup({ status: "idle" });
              }}
              placeholder="studentsunionucl.org/clubs-societies/…"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </Field>
        </div>
        <button
          type="submit"
          disabled={!link.trim() || lookup.status === "checking"}
          className={primaryButton}
        >
          {lookup.status === "checking" ? "Checking…" : "Add"}
        </button>
      </form>
      {lookup.status === "error" ? (
        <p role="alert" className="text-sm text-danger">
          {lookup.message}
        </p>
      ) : (
        <p className="text-xs text-muted">Open your society on studentsunionucl.org and paste the address.</p>
      )}
    </div>
  );
}
