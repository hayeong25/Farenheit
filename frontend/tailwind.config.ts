import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        farenheit: {
          50: "#fff1f1",
          100: "#ffe0e0",
          200: "#ffc7c7",
          300: "#ffa0a0",
          400: "#ff6b6b",
          500: "#f83b3b",
          600: "#e51d1d",
          700: "#c11414",
          800: "#a01414",
          900: "#841818",
          950: "#480707",
        },
        cool: {
          50: "#edfaff",
          100: "#d6f3ff",
          200: "#b5ecff",
          300: "#83e2ff",
          400: "#48cfff",
          500: "#1eb2ff",
          600: "#0695ff",
          700: "#007df4",
          800: "#0864c5",
          900: "#0d559b",
          950: "#0e345d",
        },
      },
    },
  },
  plugins: [],
};

export default config;
