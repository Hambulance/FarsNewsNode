import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        panel: "#111827",
        line: "#1f2937",
        accent: "#10a37f",
        accentSoft: "#16332d"
      },
      boxShadow: {
        panel: "0 18px 44px rgba(0, 0, 0, 0.28)"
      }
    }
  },
  plugins: []
};

export default config;
