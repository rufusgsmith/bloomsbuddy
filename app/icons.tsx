import type { ReactNode } from "react";

// Small outline icons in the nav's style, used where the UI wants a picture instead of text.

function Icon({ className = "size-5", children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

export function HomeIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9v11h14V9" />
      <path d="M10 20v-6h4v6" />
    </Icon>
  );
}

export function BuildingIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3 9 12 4l9 5" />
      <path d="M5 9v10M9.5 9v10M14.5 9v10M19 9v10" />
      <path d="M3 20h18" />
    </Icon>
  );
}

export function SlashIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6 6 12 12" />
    </Icon>
  );
}

export function CameraIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </Icon>
  );
}

// Day-list tiles: one per event tone, plus free time and deadlines.

export function CapIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M2.5 9 12 4.5 21.5 9 12 13.5z" />
      <path d="M6.5 11v4.5c1.5 1.3 3.4 2 5.5 2s4-.7 5.5-2V11M21.5 9v5" />
    </Icon>
  );
}

export function PersonIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Icon>
  );
}

export function PeopleIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
    </Icon>
  );
}

export function CheckListIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" />
    </Icon>
  );
}

export function PenIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M15.5 4.5 19.5 8.5 9 19H5v-4z" />
      <path d="m13 7 4 4" />
    </Icon>
  );
}

export function FlagIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </Icon>
  );
}

export function ClockIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

export function BookIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 1 4 17.5z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
    </Icon>
  );
}

export function CupIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2M11 3.5v2M14 3.5v2" />
    </Icon>
  );
}

export function MoonIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />
    </Icon>
  );
}

export function StarIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M12 3.5 14.6 9l5.9.6-4.4 4 1.3 5.9L12 16.5l-5.4 3 1.3-5.9-4.4-4 5.9-.6z" />
    </Icon>
  );
}

export function SparkleIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M12 3.5 13.8 9l5.7 1.9-5.7 1.9L12 18.5l-1.8-5.7L4.5 11l5.7-1.9z" />
      <path d="M18.5 15.5v4M16.5 17.5h4" />
    </Icon>
  );
}

export function PlusIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}
