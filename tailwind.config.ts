import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gc: {
          dark:     '#17130F',   // warm near-black
          card:     '#221D17',   // warm dark brown
          green:    'rgb(var(--league-primary-rgb) / <alpha-value>)',
          gold:     'rgb(var(--league-secondary-rgb) / <alpha-value>)',
          red:      '#C12820',   // brick red
          burgundy: '#8A1C38',   // dark burgundy
          cream:    '#F0E8D0',   // off-white accent
          muted:    '#9A8870',   // warm muted text
        },
      },
      fontFamily: {
        sans:    ['Barlow', 'system-ui', 'sans-serif'],
        body:    ['Barlow', 'system-ui', 'sans-serif'],
        display: ['Barlow Condensed', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
