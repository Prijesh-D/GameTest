import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0f14",
        surface: "#141b23",
        surface2: "#1d2833",
        border: "#2a3846",
        text: "#e8eef4",
        muted: "#8fa3b5",
        accent: "#4ade80",
        accentDim: "#166534",
        warn: "#fbbf24",
      },
      spacing: {
        safeTop: "env(safe-area-inset-top)",
        safeBottom: "env(safe-area-inset-bottom)",
      },
    },
  },
  plugins: [],
} satisfies Config;
