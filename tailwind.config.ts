import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'league-primary': 'var(--league-primary)',
        'league-secondary': 'var(--league-secondary)',
        'bg-dark': 'var(--bg-dark)',
        'bg-card': 'var(--bg-card)',
        'bg-card-hover': 'var(--bg-card-hover)',
        'text-muted': 'var(--text-muted)',
        gc: {
          dark:     'var(--bg-dark)',
          card:     'var(--bg-card)',
          green:    'rgb(var(--league-primary-rgb) / <alpha-value>)',
          gold:     'rgb(var(--league-secondary-rgb) / <alpha-value>)',
          red:      '#C12820',   // brick red
          burgundy: '#8A1C38',   // dark burgundy
          cream:    '#F0E8D0',   // off-white accent
          muted:    'var(--text-muted)',
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
