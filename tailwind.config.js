/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0a0a0a',
          900: '#141414',
          800: '#1e1e1e',
          700: '#2a2a2a',
          600: '#3a3a3a',
          500: '#555555',
          400: '#777777',
          300: '#999999',
          200: '#bbbbbb',
          100: '#d4d4d4',
          50: '#f0f0f0',
        },
        accent: {
          DEFAULT: '#EC5620',
          hover: '#a83222',
          light: 'var(--accent-light)',
        },
        teal: {
          DEFAULT: '#1a7a6d',
          hover: '#146358',
          light: 'var(--teal-light)',
        },
        surface: {
          DEFAULT: 'var(--surface-default)',
          raised: 'var(--surface-raised)',
          overlay: 'var(--surface-overlay)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      borderWidth: {
        '3': '3px',
      },
      boxShadow: {
        brutal: 'var(--shadow-brutal)',
        'brutal-sm': 'var(--shadow-brutal-sm)',
        'brutal-lg': 'var(--shadow-brutal-lg)',
      },
    },
  },
  plugins: [],
};
