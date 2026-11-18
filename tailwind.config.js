/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        crew: {
          obsidian: '#0F0700',
          slate: '#566167',
          ash: '#464644',
          clay: '#9D8F82',
          ivory: '#F3E8D6',
          lime: '#84CC16',
        },
      },
      fontFamily: {
        display: ['"Instrument Sans"', 'sans-serif'],
        body: ['Satoshi', '"Instrument Sans"', 'system-ui', 'sans-serif'],
        bengali: ['"Noto Sans Bengali"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
