const { radius } = require("./theme-constants")

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Values live in global.css as CSS variables so light and dark can swap
      // without a rebuild — the same arrangement the web app uses.
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: "var(--destructive)",
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
      },
      borderRadius: {
        sm: `${radius.sm}px`,
        md: `${radius.md}px`,
        lg: `${radius.lg}px`,
        xl: `${radius.xl}px`,
        "2xl": `${radius["2xl"]}px`,
        "3xl": `${radius["3xl"]}px`,
      },
      fontFamily: {
        // Android has no synthetic bold, so every weight is its own family.
        sans: ["Geist-Regular"],
        medium: ["Geist-Medium"],
        semibold: ["Geist-SemiBold"],
        mono: ["GeistMono-Regular"],
        "mono-medium": ["GeistMono-Medium"],
        heading: ["Geist-Medium"],
        wordmark: ["Montserrat-Bold"],
      },
    },
  },
  plugins: [],
}
