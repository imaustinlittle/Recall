/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Hanken Grotesk", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Space Grotesk", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        // Design tokens — resolved at runtime from the active [data-theme].
        accent: {
          DEFAULT: "var(--accent)",
          weak: "var(--accent-weak)",
          line: "var(--accent-line)",
        },
        "on-accent": "var(--on-accent)",
        bg: {
          DEFAULT: "var(--bg)",
          2: "var(--bg-2)",
        },
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
        },
        inset: "var(--inset)",
        ink: {
          DEFAULT: "var(--ink)",
          2: "var(--ink-2)",
          3: "var(--ink-3)",
        },
        line: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        wave: "var(--wave)",
        // Status / fixed accents — identical across both themes.
        status: {
          green: "#1F9D6B",
          blue: "#3B82F6",
          amber: "#C8862A",
          red: "#E0533A",
        },
        record: "#E0533A",
        // Legacy brand scale aliased to the accent so any stray class still
        // renders on-brand during/after the migration.
        brand: {
          50: "color-mix(in srgb, var(--accent) 8%, transparent)",
          100: "var(--accent-weak)",
          200: "var(--accent-line)",
          300: "var(--accent-line)",
          400: "var(--accent)",
          500: "var(--accent)",
          600: "var(--accent)",
          700: "var(--accent)",
          800: "var(--accent)",
        },
      },
      boxShadow: {
        card: "var(--shadow)",
        "card-sm": "var(--shadow-sm)",
        glow: "var(--glow)",
      },
      borderColor: {
        DEFAULT: "var(--border)",
      },
      keyframes: {
        recpulse: {
          "0%": { transform: "scale(.85)", opacity: ".8" },
          "70%": { transform: "scale(2.2)", opacity: "0" },
          "100%": { opacity: "0" },
        },
        meter: {
          "0%,100%": { transform: "scaleY(.22)" },
          "50%": { transform: "scaleY(1)" },
        },
        rise: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        recpulse: "recpulse 1.6s ease-out infinite",
        meter: "meter .9s ease-in-out infinite",
        rise: "rise .25s ease both",
      },
    },
  },
  plugins: [],
};
