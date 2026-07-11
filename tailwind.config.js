/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#1a2b33',
          900: '#1d2e36',
          800: '#20323b',
          700: '#233741',
          600: '#273d48',
          500: '#395969',
          400: '#547c8f',
          300: '#799eb0',
          200: '#acbec6',
          100: '#cbd5db',
          50: '#eef1f1',
        },
        accent: {
          DEFAULT: '#28464F',
          hover: '#1A2B33',
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
