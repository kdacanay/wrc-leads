/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        wrcYellow: "#fff200",
        wrcBlack: "#111111",
      },
    },
  },
  plugins: [],
};
