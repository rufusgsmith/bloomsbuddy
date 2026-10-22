import type { Gap, Recommendation } from "../types";

// Ready-made picks for every gap in the demo week, so the demo never calls Claude (no API credits).
// Written from the same tool data Claude would see for each gap (library busyness, travel times,
// deadlines, the demo to-dos, mock society events, lunch, the trip home to Ifor Evans Hall) and in
// the same voice as SYSTEM_PROMPT. Keyed by gap id (gap-<previous event>-<next event>, see findGaps).
// The demo week is read-only, so these ids never change.
//
// Reasons name weekdays, never dates: the demo week moves to the current week on every visit.

type Picks = Pick<Recommendation, "top" | "alternatives">;

const DEMO_PICKS: Record<string, Picks> = {
  // Mon 11:00–11:30, 25 min usable, Roberts to Drayton House (ECON0013 tutorial).
  "gap-tt-mon-1-tt-mon-2": {
    top: {
      title: "Email your personal tutor about PHIL0045",
      type: "rest",
      place: "Outside Drayton House",
      travelMins: 5,
      travelMode: "walk",
      reason: "It's due tomorrow and takes 10 minutes. Walk the 5 min to Drayton House, send it from the steps and you're early for the tutorial.",
      todoId: "todo-demo-email-tutor",
    },
    alternatives: [
      {
        title: "Skim this morning's micro notes",
        type: "study",
        place: "Main Library",
        travelMins: 4,
        travelMode: "walk",
        reason: "4 min from Roberts and 2 from Drayton House, usually moderate at 11:00. Go over the lecture so the ECON0013 tutorial actually makes sense.",
        relatedId: "main-library",
        busyness: "moderate",
      },
      {
        title: "Coffee on the way",
        type: "rest",
        place: "Print Room Cafe",
        travelMins: 4,
        travelMode: "walk",
        reason: "4 min there, 2 on to Drayton House. Two hours of micro deserves a coffee.",
        relatedId: "food-print-room",
      },
    ],
  },

  // Mon 12:30–14:00, 1h 22m usable, Drayton House to IOE Logan Hall (ECON0019). Lunch window.
  "gap-tt-mon-2-tt-mon-3": {
    top: {
      title: "Coffee & CVs: spring week applications",
      type: "event",
      place: "Student Centre",
      travelMins: 2,
      travelMode: "walk",
      reason: "Free coffee and spring week CV tips from EconFin, 12:30–13:30, 2 min away. Nothing's due till Thursday, so grab a sandwich after and you're at Logan Hall for 14:00 with time to spare.",
      relatedId: "soc-econ-coffee-cvs",
    },
    alternatives: [
      {
        title: "Knock out STAT0002 Quiz 3",
        type: "study",
        place: "Bartlett Library",
        travelMins: 3,
        travelMode: "walk",
        reason: "Quiz 3 is due Thursday at 23:59 and takes about an hour. Main Library is usually busy at lunch, so try Bartlett: usually moderate and 3 min away.",
        relatedId: "dl-stat0002-quiz3",
        busyness: "moderate",
      },
      {
        title: "Proper hot lunch",
        type: "food",
        place: "Lower Refectory",
        travelMins: 3,
        travelMode: "walk",
        reason: "It's lunchtime and you're free till 14:00. Hot meals and loads of seats, then 8 min to Logan Hall.",
        relatedId: "food-lower-refectory",
      },
    ],
  },

  // Tue 11:00–15:00, 3h 55m usable, Christopher Ingold to Cruciform (ECON0027). Lunch window, home worth it.
  "gap-tt-tue-1-tt-tue-2": {
    top: {
      title: "Proper session on ECON0019 Problem Set 2",
      type: "study",
      place: "SSEES Library",
      travelMins: 2,
      travelMode: "walk",
      reason: "PS2 is due Friday at 12:00 and needs about 4 hours, and this is your longest gap before then. SSEES is usually quiet at 11:00 and 2 min away, so put in 2 hours, then go find lunch.",
      relatedId: "dl-econ0019-ps2",
      busyness: "quiet",
    },
    alternatives: [
      {
        title: "Autumn bake sale",
        type: "event",
        place: "Wilkins South Cloisters",
        travelMins: 3,
        travelMode: "walk",
        reason: "The Baking Society's on 13:00–14:30, 2 min from your Game Theory lecture. A study block then cake for lunch is a solid plan.",
        relatedId: "soc-baking-sale",
      },
      {
        title: "Head home for lunch and a reset",
        type: "home",
        place: "Ifor Evans Hall",
        travelMins: 28,
        travelMode: "tube",
        reason: "You'd get 3 hours and 6 minutes at Ifor Evans after the tube both ways: proper lunch, ditch the heavy bag, maybe a nap. Leave by 14:30 for Game Theory at 15:00.",
      },
    ],
  },

  // Wed 10:00–11:00, 56 min usable, 25 Gordon St to Darwin (STAT0002 problem class).
  "gap-tt-wed-1-tt-wed-2": {
    top: {
      title: "Get STAT0002 Quiz 3 done",
      type: "study",
      place: "Science Library",
      travelMins: 3,
      travelMode: "walk",
      reason: "Quiz 3 is due tomorrow at 23:59 and takes about an hour. The Science Library is usually quiet at 10:00 and 2 min from Darwin, and your afternoon is free for PS2.",
      relatedId: "dl-stat0002-quiz3",
      busyness: "quiet",
    },
    alternatives: [
      {
        title: "Print the Game Theory problem set",
        type: "rest",
        place: "Students' Union (Gordon St)",
        travelMins: 2,
        travelMode: "walk",
        reason: "It's on your list for tomorrow and the SU is 2 min away. Ten minutes at the printer, a coffee, then on to Darwin.",
        todoId: "todo-demo-print-ps",
      },
      {
        title: "Flashcards for Friday's midterm",
        type: "study",
        place: "Bartlett Library",
        travelMins: 2,
        travelMode: "walk",
        reason: "Friday's STAT0002 midterm is at 15:00 and you're off to a probability class anyway. 45 minutes on conditional probability now and the problem class will click.",
        relatedId: "dl-stat0002-midterm",
        busyness: "moderate",
      },
    ],
  },

  // Thu 11:00–12:00, 53 min usable, Bentham House to Roberts (ECON0013). Quiz 3 closes tonight.
  "gap-tt-thu-1-tt-thu-2": {
    top: {
      title: "Finish STAT0002 Quiz 3",
      type: "study",
      place: "SSEES Library",
      travelMins: 3,
      travelMode: "walk",
      reason: "Quiz 3 closes tonight at 23:59. SSEES is usually quiet at 11:00 and 3 min from Bentham, so get it done now and save your 14:00 gap for PS2.",
      relatedId: "dl-stat0002-quiz3",
      busyness: "quiet",
    },
    alternatives: [
      {
        title: "Print the Game Theory problem set",
        type: "rest",
        place: "Students' Union (Gordon St)",
        travelMins: 3,
        travelMode: "walk",
        reason: "It's on your list for today and the SU is right on the way to Roberts. Ten minutes, job done.",
        todoId: "todo-demo-print-ps",
      },
      {
        title: "Make a start on ECON0019 PS2",
        type: "study",
        place: "Main Library",
        travelMins: 4,
        travelMode: "walk",
        reason: "PS2 is due tomorrow at 12:00. Usually moderate at 11:00 and 4 min from Roberts, and you can carry on in your 14:00 gap.",
        relatedId: "dl-econ0019-ps2",
        busyness: "moderate",
      },
    ],
  },

  // Thu 14:00–16:00, 1h 55m usable, Roberts to IOE 20 Bedford Way (ECON0027 tutorial).
  "gap-tt-thu-2-tt-thu-3": {
    top: {
      title: "Push ECON0019 Problem Set 2 over the line",
      type: "study",
      place: "IOE Library",
      travelMins: 4,
      travelMode: "walk",
      reason: "PS2 is due tomorrow at 12:00. The IOE Library is usually moderate at 14:00 and 2 min from your Game Theory tutorial. If Quiz 3 isn't in yet, do that first: it closes tonight at 23:59.",
      relatedId: "dl-econ0019-ps2",
      busyness: "moderate",
    },
    alternatives: [
      {
        title: "Speaker event: life as a Bank of England economist",
        type: "event",
        place: "IOE Logan Hall",
        travelMins: 5,
        travelMode: "walk",
        reason: "Free, 14:15–15:15, and in the same building as your 16:00 tutorial, so there's no walk after. Worth it if PS2 is nearly done.",
        relatedId: "soc-econ-boe-speaker",
      },
      {
        title: "Revise for tomorrow's STAT0002 midterm",
        type: "study",
        place: "Science Library",
        travelMins: 2,
        travelMode: "walk",
        reason: "The midterm is tomorrow at 15:00. PS2 comes first, but if it's in hand, an hour of past questions at the Science Library (2 min from Roberts) is a good shout.",
        relatedId: "dl-stat0002-midterm",
        busyness: "moderate",
      },
    ],
  },

  // Fri 10:00–10:30, 22 min usable, IOE to Drayton House (ECON0013 tutorial). PS2 due at 12:00.
  "gap-tt-fri-1-tt-fri-2": {
    top: {
      title: "Last check on ECON0019 PS2",
      type: "study",
      place: "Main Library",
      travelMins: 7,
      travelMode: "walk",
      reason: "PS2 is due at 12:00. The Main Library is 2 min from Drayton House, so you'll have 15 minutes to check your answers before the tutorial.",
      relatedId: "dl-econ0019-ps2",
      busyness: "moderate",
    },
    alternatives: [
      {
        title: "Formula flashcards for the midterm",
        type: "study",
        place: "Student Centre",
        travelMins: 7,
        travelMode: "walk",
        reason: "The STAT0002 midterm is at 15:00. A quick formula run 2 min from your tutorial.",
        relatedId: "dl-stat0002-midterm",
        busyness: "moderate",
      },
      {
        title: "Coffee on the way",
        type: "rest",
        place: "Print Room Cafe",
        travelMins: 7,
        travelMode: "walk",
        reason: "7 min there, 2 on to Drayton House. Big day, so start it caffeinated.",
        relatedId: "food-print-room",
      },
    ],
  },

  // Fri 11:30–13:00, 1h 28m usable, Drayton House to Christopher Ingold (STAT0002). Lunch window.
  "gap-tt-fri-2-tt-fri-3": {
    top: {
      title: "Submit ECON0019 PS2",
      type: "study",
      place: "Main Library",
      travelMins: 2,
      travelMode: "walk",
      reason: "PS2 is due at 12:00, so this first half hour is for final tweaks and hitting submit. The Main Library is 2 min from Drayton House and usually moderate now.",
      relatedId: "dl-econ0019-ps2",
      busyness: "moderate",
    },
    alternatives: [
      {
        title: "Revise for this afternoon's midterm",
        type: "study",
        place: "SSEES Library",
        travelMins: 4,
        travelMode: "walk",
        reason: "Once PS2's in, give the 15:00 STAT0002 midterm an hour. SSEES is usually quiet and only 2 min from Chris Ingold.",
        relatedId: "dl-stat0002-midterm",
        busyness: "quiet",
      },
      {
        title: "Lunch before the big afternoon",
        type: "food",
        place: "Student Centre Cafe",
        travelMins: 2,
        travelMode: "walk",
        reason: "Don't sit a midterm on an empty stomach. Grab-and-go wraps 2 min away, and 2 min on to your lecture.",
        relatedId: "food-student-centre",
      },
    ],
  },

  // Fri 14:00–15:00, 55 min usable, Christopher Ingold to the STAT0002 midterm (Cruciform).
  "gap-tt-fri-3-exam-dl-stat0002-midterm": {
    top: {
      title: "Final recap before the midterm",
      type: "study",
      place: "Cruciform Hub",
      travelMins: 5,
      travelMode: "walk",
      reason: "Usually moderate at 14:00 and 2 min from the exam. Formulas, one past question, then walk in calm at 15:00.",
      relatedId: "dl-stat0002-midterm",
      busyness: "moderate",
    },
    alternatives: [
      {
        title: "Quiet run-through",
        type: "study",
        place: "SSEES Library",
        travelMins: 2,
        travelMode: "walk",
        reason: "Usually quiet at 14:00, if the Cruciform Hub is full of nervous statisticians. Leave by 14:50: it's 6 min to the Cruciform.",
        relatedId: "dl-stat0002-midterm",
        busyness: "quiet",
      },
      {
        title: "Snack and water",
        type: "rest",
        place: "Print Room Cafe",
        travelMins: 3,
        travelMode: "walk",
        reason: "An hour-long exam on no fuel is a bad idea. 3 min there, 2 on to the Cruciform.",
        relatedId: "food-print-room",
      },
    ],
  },

  // Fri 16:00–17:00, 53 min usable, Cruciform (just sat the midterm) to Bentham House (PHIL0045).
  "gap-exam-dl-stat0002-midterm-tt-fri-4": {
    top: {
      title: "Markets mixer (free pizza)",
      type: "event",
      place: "Student Centre",
      travelMins: 4,
      travelMode: "walk",
      reason: "Midterm done. The Investment Society's mixer runs till 16:30 with free pizza, 4 min away and 3 min from Bentham House. You've earned it.",
      relatedId: "soc-invest-markets-mixer",
    },
    alternatives: [
      {
        title: "Tidy up this week's lecture notes",
        type: "study",
        place: "Science Library",
        travelMins: 3,
        travelMode: "walk",
        reason: "Your usual Friday tidy-up, about 30 minutes. The Science Library is usually quiet at 16:00 and 6 min from Bentham House.",
        relatedId: "science-library",
        busyness: "quiet",
        todoId: "todo-demo-notes",
      },
      {
        title: "Make a start on Game Theory PS1",
        type: "study",
        place: "Main Library",
        travelMins: 3,
        travelMode: "walk",
        reason: "PS1 is due Wednesday at 17:00 and it's a 5-hour one. One question now takes the edge off.",
        relatedId: "dl-econ0027-ps1",
        busyness: "moderate",
      },
    ],
  },
};

/** The ready-made picks for a demo gap, or undefined for a gap that isn't in the demo week. */
export function demoRecommendation(gap: Gap): Recommendation | undefined {
  const picks = DEMO_PICKS[gap.id];
  if (!picks) return undefined;
  return { gapId: gap.id, ...picks, generatedAt: new Date().toISOString() };
}

/** For checks: every gap id with picks. */
export const DEMO_GAP_IDS = Object.keys(DEMO_PICKS);
