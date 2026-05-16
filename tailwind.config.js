/** @type {import('tailwindcss').Config} */
export default {
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
          DEFAULT: '#c23c2a',
          hover: '#a83222',
          light: '#f5e6e3',
        },
        teal: {
          DEFAULT: '#1a7a6d',
          hover: '#146358',
          light: '#e6f2f0',
        },
        surface: {
          DEFAULT: '#fafafa',
          raised: '#ffffff',
          overlay: '#f5f5f5',
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
        brutal: '4px 4px 0px 0px #0a0a0a',
        'brutal-sm': '2px 2px 0px 0px #0a0a0a',
        'brutal-lg': '6px 6px 0px 0px #0a0a0a',
      },
    },
  },
  plugins: [],
};
