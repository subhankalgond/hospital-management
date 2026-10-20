import * as React from "react";

/**
 * Custom Icon component providing SVG icons without the lucide-react dependency.
 * All icons are designed at 24x24 viewBox for consistency with the design system.
 * Used as a replacement for lucide-react icons to comply with the "no lucide icons" requirement.
 */
export interface IconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

/**
 * Map of icon names to their SVG path data.
 * Each path is designed at 24x24 viewBox for consistency.
 */
const iconPaths: Record<string, string> = {
  // Navigation/interface icons
  home: "M12 2L15.09 8.26L22 9.27L17.73 13.14L19.9 21.03L12 17.77L4.06 21.03L6.23 13.14L2 9.27L8.91 8.26L12 2ZM12 22C8.14 22 5 19.86 5 16S8.14 10 12 10s7 3.86 7 7-2 7-7 7zm0-8a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
  calendar: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2",
  menu: "M4 6h16M4 12h16M4 18h16",
  search: "M21 21l-5.3-5.3a1.15 1.15 0 0 1 0-1.64l5.32-5.32a1.15 1.15 0 1 1 1.64 1.64l-5.32 5.32A11.02 11.02 0 0 1 12 2c-3.3 0-6.32 2.67-7.18 6.02l-5.32 5.32a1.15 1.15 0 0 1-1.64 0l5.32-5.32a1.15 1.15 0 1 1 1.64 1.64l-5.32 5.32zM12 2a20 20 0 1 0 0 40 20 20 0 0 0 0-40z",
  users: "M17.5 7.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm-6.089 2.497a2.5 2.5 0 0 0-1.35 1.825H5.25a2.5 2.5 0 0 0 0 5h13.032a2.5 2.5 0 0 0 0-5H11.42zM12 3v2m0 16v2M4.93 4.93l.03.03L23.5 19.05",
  calendar2: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2",
  info: "M12 2c-7.73 0-14 6.27-14 14s6.27 14 14 14 14-6.27 14-14-6.27-14-14-14zm0-2c-4.41 0-8 3.59-8 8s3.59 8 8 8 8-3.59 8-8-3.59-8-8-8zm0-2c-6.637 0-12 5.363-12 12s5.363 12 12 12 5.363-12 12-12-5.363-12-12-12z",
  arrowRight: "M12 19l9 2-9-18 15 2-15-2z",
  arrowLeft: "M15 19l-9-2 9 18-15-2 15 2z",
  chevronDown: "M6 9l6 6 6-6",
  chevronUp: "M6 15l6-6 6 6",
  chevronLeft: "M15 12l-6-6 6-6",
  chevronRight: "M9 12l6-6 6 6",
  // Medical/health icons
  stethoscope: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm0-2c-6.637 0-12 5.363-12 12s5.363 12 12 12 5.363-12 12-12-5.363-12-12-12zM4.93 4.93l.03.03l21.94 21.94",
  heart: "M12 2l3.09 6.26L22 9.27l-6.41 3.62L11.97 13.05l-5.81 3.09L2 9.27l6.94-2.46L12 2ZM2 4.27l15.06 8.07L2 15.73l15.06-8.07Z",
  pill: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 4.27l15.06 8.07L2 15.73l15.06-8.07z",
  shieldCheck: "M12 2L4 6l8 8 8-8L12 2zm4.22 3.45a2.22 2.22 0 0 0-3.16 0L12 9l-2.75-1.375a1.75 1.75 0 0 0-1.738.57L8.75 13.5a1.75 1.75 0 0 0 0 2.75l2.75 1.375a2.22 2.22 0 0 0 3.16 0l3.5-1.75a1.75 1.75 0 0 0 .246-1.655L15.25 12l2.42 3.025a1.75 1.75 0 0 0 1.577-.87l3.5-1.75a2.22 2.22 0 0 0 0-3.157l-3.5-1.75z",
  shieldCross: "M12 2L4 6m8 8L12 14m-8 8l8-8",
  // Action icons
  plus: "M12 2v10M2 12h10",
  minus: "M2 12h10",
  close: "M18 6L6 18",
  xMark: "M18 6L6 18M6 6l12 12",
  // Communication icons
  phone: "M17.5 7.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm-6.089 2.497a2.5 2.5 0 0 0-1.35 1.825H5.25a2.5 2.5 0 0 0 0 5h13.032a2.5 2.5 0 0 0 0-5H11.42zM12 3v2m0 16v2M4.93 4.93l.03.03L23.5 19.05",
  mail: "M22 7l-7-4-4-5-5-7-7-4-4-5-5-7 7 4 4 5 5zM5 20a6 6 0 0 0 6-6h2a6 6 0 0 0 6-6V6a6 6 0 0 0-12 0v8a6 6 0 0 0 6 6zM8 12s-2.19 1.06-3 .89a6 6 0 0 0 .88 5.53L4 18l5 2 1.06-3 .88-5.53a6 6 0 0 0-.89-3H2a6 6 0 0 0-6 6v4z",
  // File/document icons
  fileText: "M14 2H6a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2L18 7M14 2L10 7",
  // Settings/cog icon
  settings: "M12 3v c 0 .58-.15 1.12-.43 1.66l-.67.33a2 2 0 0 0 .66 1.83l.66-.33a2 2 0 0 0-1.66-.43L12 7v5.37m0 4h.01m0 0h.01m0 0c.39-.85.57-1.61.43-2.32l-.67-.33a2 2 0 0 0-1.66-.43l.66.33a2 2 0 0 0 1.66.43c.5 1.07.37 2.15.1 3.18H12v3H9v-3c0-.93.18-1.85.53-2.57l.64-.33c.66-.33.66-1.18 0-1.53v-5m0 4a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  // Lock icon
  lock: "M11 7a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-3v-2a2 2 0 0 0-2-2H8a2 2 0 0 1-2-2V7zM3 7v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7z",
};

export function Icon({ name, className, title, ...props }: { name: keyof typeof iconPaths; className?: string; title?: string; }) {
  const path = iconPaths[name];
  if (!path) {
    // Fallback: render a generic rectangle
    return (
      <svg className={className} viewBox="0 0 24 24" aria-hidden="true" role="img" {...props}>
        <rect width="24" height="24" fill="currentColor" rx="4" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" role="img" {...props}>
      <path d={path} fill="currentColor" />
      {title && <title>{title}</title>}
    </svg>
  );
}