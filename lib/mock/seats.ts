import type { SeatAvailability } from "../types";

// A snapshot from a busy Friday morning. Student Centre is nearly full (as usual),
// and SSEES is the hidden gem with loads of space.
const UPDATED_AT = "2026-10-16T10:15:00+01:00";

export const MOCK_SEATS: SeatAvailability[] = [
  { libraryId: "student-centre", name: "Student Centre", available: 18, total: 1000, updatedAt: UPDATED_AT },
  { libraryId: "main-library", name: "Main Library", available: 64, total: 450, updatedAt: UPDATED_AT },
  { libraryId: "science-library", name: "Science Library", available: 212, total: 600, updatedAt: UPDATED_AT },
  { libraryId: "ioe-library", name: "IOE Library", available: 287, total: 800, updatedAt: UPDATED_AT },
  { libraryId: "cruciform-hub", name: "Cruciform Hub", available: 7, total: 140, updatedAt: UPDATED_AT },
  { libraryId: "bartlett-library", name: "Bartlett Library", available: 31, total: 90, updatedAt: UPDATED_AT },
  { libraryId: "ssees-library", name: "SSEES Library", available: 128, total: 160, updatedAt: UPDATED_AT },
];
