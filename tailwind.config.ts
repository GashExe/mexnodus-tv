import type { Config } from "tailwindcss";

/**
 * MexNodus TV — sistema visual "Obsidiana + Rosa Mexicano".
 * Identidad original: fondos de obsidiana volcánica, acento rosa mexicano
 * (no el rojo de Netflix), oro cempasúchil como color de datos/realce.
 * Todo se consume vía tokens CSS definidos en globals.css.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--mx-bg) / <alpha-value>)",
        surface: "rgb(var(--mx-surface) / <alpha-value>)",
        "surface-2": "rgb(var(--mx-surface-2) / <alpha-value>)",
        line: "rgb(var(--mx-line) / <alpha-value>)",
        ink: "rgb(var(--mx-ink) / <alpha-value>)",
        "ink-2": "rgb(var(--mx-ink-2) / <alpha-value>)",
        "ink-3": "rgb(var(--mx-ink-3) / <alpha-value>)",
        accent: "rgb(var(--mx-accent) / <alpha-value>)",
        "accent-2": "rgb(var(--mx-accent-2) / <alpha-value>)",
        gold: "rgb(var(--mx-gold) / <alpha-value>)",
        good: "rgb(var(--mx-good) / <alpha-value>)",
        warn: "rgb(var(--mx-warn) / <alpha-value>)",
        crit: "rgb(var(--mx-crit) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "14px",
        pill: "999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,.5), 0 18px 40px -22px rgba(0,0,0,.75)",
        glow: "0 0 0 1px rgb(var(--mx-accent) / .35), 0 8px 30px -8px rgb(var(--mx-accent) / .35)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up .4s ease both",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
