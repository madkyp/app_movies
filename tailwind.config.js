/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#0f0f1a",
          secondary: "#16213e",
          card: "#1e1e30",
          hover: "#252540",
        },
        accent: {
          DEFAULT: "#7b5ea7",
          light: "#9b7ec8",
          dark: "#5a3e8a",
        },
        text: {
          primary: "#ffffff",
          secondary: "#a0a0b8",
          muted: "#5a5a7a",
        },
        border: "#2a2a45",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "gradient-accent": "linear-gradient(135deg, #7b5ea7 0%, #4a90d9 100%)",
        "gradient-card": "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.9) 100%)",
      },
    },
  },
  plugins: [],
};
