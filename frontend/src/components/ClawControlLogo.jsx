/**
 * ClawControl logo — 3 curved claw marks with a gauge needle overlaid.
 *
 * Design:
 *   - Three curved scratch lines fan from bottom to top (the gauge arc)
 *   - A straight gauge needle angles from the pivot point toward the upper-right
 *   - A filled circle marks the needle pivot at the base
 *   - All elements use a single color (default #E8472A)
 */
export default function ClawControlLogo({ size = 24, color = '#E8472A' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="ClawControl"
      style={{ flexShrink: 0 }}
    >
      {/* Three claw marks — curved fan */}
      <path
        d="M 8 22 C 3 16 1 9 4 3"
        stroke={color}
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M 12 22 C 13 15 11 8 12 2"
        stroke={color}
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M 16 22 C 21 16 23 9 20 3"
        stroke={color}
        strokeWidth="1.9"
        strokeLinecap="round"
      />

      {/* Gauge needle — straight line angled between center and right claw */}
      <line
        x1="12"
        y1="20"
        x2="18"
        y2="8"
        stroke={color}
        strokeWidth="1.35"
        strokeLinecap="round"
      />

      {/* Pivot dot */}
      <circle cx="12" cy="20" r="1.55" fill={color} />
    </svg>
  )
}
