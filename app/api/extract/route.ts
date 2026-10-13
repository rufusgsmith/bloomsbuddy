// POST /api/extract  body: { kind: "timetable" | "deadlines", image: { mediaType, data } }
//   → { classes: WeeklyClass[] } or { deadlines: Deadline[] }
// data is base64 without the "data:" prefix. The client shrinks screenshots before sending,
// so this stays well under Vercel's 4.5MB request limit.
import { extractDeadlines, extractTimetable, type ImageInput } from "@/lib/extract/extract";
import { londonTodayKey } from "@/lib/london-time";

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
// ~3MB of image once decoded. Claude's own limit is 5MB, Vercel's body limit is 4.5MB.
const MAX_BASE64_CHARS = 4_000_000;

function isImage(x: unknown): x is ImageInput {
  const i = x as Partial<ImageInput> | null;
  return (
    typeof i?.mediaType === "string" &&
    MEDIA_TYPES.includes(i.mediaType) &&
    typeof i.data === "string" &&
    i.data.length > 0
  );
}

export async function POST(request: Request) {
  let body: { kind?: unknown; image?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON: { kind, image }" }, { status: 400 });
  }
  if (body.kind !== "timetable" && body.kind !== "deadlines") {
    return Response.json({ error: "`kind` must be timetable or deadlines" }, { status: 400 });
  }
  if (!isImage(body.image)) {
    return Response.json({ error: "Missing or malformed `image`" }, { status: 400 });
  }
  if (body.image.data.length > MAX_BASE64_CHARS) {
    return Response.json({ error: "That screenshot is too big. Try cropping it." }, { status: 413 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[extract] ANTHROPIC_API_KEY is not set");
    return Response.json({ error: "Screenshot reading is unavailable right now" }, { status: 502 });
  }

  try {
    if (body.kind === "timetable") {
      return Response.json({ classes: await extractTimetable(body.image) });
    }
    return Response.json({ deadlines: await extractDeadlines(body.image, londonTodayKey()) });
  } catch (err) {
    console.error("[extract] failed:", err);
    return Response.json({ error: "Couldn't read that screenshot" }, { status: 502 });
  }
}
