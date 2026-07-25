/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#041C3C',
          900: '#0a2647',
          800: '#0f2f52',
          700: '#14395d',
          600: '#1a4268',
          500: '#2a557d',
          400: '#4a7297',
          300: '#7a97b4',
          200: '#aebfcb',
          100: '#d3dce3',
          50: '#f0f2f4',
        },
        accent: {
          DEFAULT: '#041C3C',
          hover: '#030e1e',
          light: 'var(--accent-light)',
        },
        gold: {
          DEFAULT: '#EBBB57',
          hover: '#d4a83e',
          light: 'var(--gold-light)',
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
