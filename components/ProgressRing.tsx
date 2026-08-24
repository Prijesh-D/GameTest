export function ProgressRing({
  value,
  goal,
  size = 132,
  stroke = 12,
}: {
  value: number;
  goal: number;
  size?: number;
  stroke?: number;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = goal > 0 ? Math.min(value / goal, 1) : 0;
  const done = value >= goal;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
         aria-label={`${value} of ${goal} sessions this week`}>
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="currentColor" strokeWidth={stroke}
        className="text-surface2"
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
        className={done ? "text-accent" : "text-warn"}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct)}
        // Start the arc at 12 o'clock rather than 3.
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%" y="50%" dy="-2"
        textAnchor="middle" dominantBaseline="middle"
        className="fill-text text-2xl font-bold"
        style={{ fontSize: size * 0.26 }}
      >
        {value}/{goal}
      </text>
      <text
        x="50%" y="50%" dy={size * 0.19}
        textAnchor="middle" dominantBaseline="middle"
        className="fill-muted"
        style={{ fontSize: size * 0.095 }}
      >
        this week
      </text>
    </svg>
  );
}
