// TEMPORARY: a page for eyeballing mock data in the browser. Delete before the demo.
import type { ReactNode } from "react";
import { BUILDINGS, travelLabel, travelTime, type BuildingId } from "@/lib/buildings";
import { isDemoMode } from "@/lib/config";
import { estimateBusyness, LIBRARY_SNAPSHOT } from "@/lib/library-busyness";
import { londonIso, londonTodayKey } from "@/lib/london-time";
import { MOCK_DEADLINES, MOCK_SOCIETY_EVENTS, MOCK_TIMETABLE } from "@/lib/mock";

const londonDateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});
const londonTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
});

const dt = (iso: string) => londonDateTime.format(new Date(iso));
const t = (iso: string) => londonTime.format(new Date(iso));
const BUSYNESS_TIMES = ["09:00", "12:00", "15:00", "18:00"];
const buildingName = (id?: BuildingId) => (id ? BUILDINGS[id].shortName : "—");

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xl font-semibold">
        {title} <span className="text-sm font-normal text-zinc-500">({count})</span>
      </h2>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead>
        <tr className="border-b border-zinc-300 dark:border-zinc-700">
          {headers.map((h) => (
            <th key={h} className="whitespace-nowrap px-2 py-1.5 font-medium text-zinc-500">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, i) => (
          <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800">
            {cells.map((c, j) => (
              <td key={j} className="px-2 py-1.5 align-top">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DebugPage() {
  const buildingIds = Object.keys(BUILDINGS) as BuildingId[];

  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <h1 className="text-3xl font-semibold">Bloomsbuddy debug</h1>
      <p className="mb-8 mt-1 text-sm text-zinc-500">
        Mock data only. All times shown in Europe/London. Demo mode:{" "}
        <strong>{isDemoMode() ? "ON" : "OFF"}</strong>
      </p>

      <Section title="Timetable" count={MOCK_TIMETABLE.length}>
        <Table
          headers={["When", "Until", "Module", "Title", "Kind", "Building", "Room"]}
          rows={MOCK_TIMETABLE.map((e) => [
            dt(e.start),
            t(e.end),
            e.moduleCode,
            e.title,
            e.kind,
            buildingName(e.buildingId),
            e.room,
          ])}
        />
      </Section>

      <Section title="Deadlines" count={MOCK_DEADLINES.length}>
        <Table
          headers={["Due", "Module", "Title", "Weight", "Est. hours", "Source"]}
          rows={MOCK_DEADLINES.map((d) => [
            dt(d.due),
            d.moduleCode,
            d.title,
            d.weight != null ? `${d.weight}%` : "—",
            d.estimatedHours ?? "—",
            d.source,
          ])}
        />
      </Section>

      <Section title="Society events" count={MOCK_SOCIETY_EVENTS.length}>
        <Table
          headers={["When", "Until", "Society", "Title", "Venue", "Building", "Free", "Tags"]}
          rows={MOCK_SOCIETY_EVENTS.map((s) => [
            dt(s.start),
            t(s.end),
            s.society,
            s.title,
            s.venue,
            buildingName(s.buildingId),
            s.free === undefined ? "—" : s.free ? "yes" : "no",
            s.tags.join(", "),
          ])}
        />
      </Section>

      <Section title={`Library busyness (estimated for ${londonTodayKey()})`} count={LIBRARY_SNAPSHOT.length}>
        <Table
          headers={["Library", "Tue 11:40 snapshot", ...BUSYNESS_TIMES]}
          rows={LIBRARY_SNAPSHOT.map((s) => [
            s.name,
            `${s.free} / ${s.total} free`,
            ...BUSYNESS_TIMES.map((time) => {
              const e = estimateBusyness(s.libraryId, londonIso(londonTodayKey(), time));
              return e ? `${e.level} (${Math.round(e.occupancy * 100)}%)` : "—";
            }),
          ])}
        />
      </Section>

      <Section title="Buildings" count={buildingIds.length}>
        <Table
          headers={["Id", "Name", "Area", "Kind", "Lat", "Lng", "Library", "Travel from Roberts"]}
          rows={buildingIds.map((id) => [
            <code key="id">{id}</code>,
            BUILDINGS[id].name,
            BUILDINGS[id].area,
            BUILDINGS[id].kind,
            BUILDINGS[id].lat.toFixed(4),
            BUILDINGS[id].lng.toFixed(4),
            BUILDINGS[id].isLibrary ? "yes" : "",
            ((trip) => travelLabel(trip.mins, trip.mode))(travelTime("roberts", id)),
          ])}
        />
      </Section>
    </main>
  );
}
