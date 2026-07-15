/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2f8',
          100: '#dbe4ef',
          200: '#b8c9e0',
          300: '#94aed0',
          400: '#7a97bd',
          500: '#6081ad',
          600: '#4d6a92',
          700: '#3d5477',
          800: '#2d3f5c',
          900: '#233145',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f5f7fa',
        },
        border: {
          DEFAULT: '#e2e8f0',
          strong: '#cbd5e1',
        },
        status: {
          green: '#16a34a',
          'green-bg': '#dcfce7',
          yellow: '#ca8a04',
          'yellow-bg': '#fef9c3',
          red: '#dc2626',
          'red-bg': '#fee2e2',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans"', 'sans-serif'],
        heading: ['"Work Sans"', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '4px',
        lg: '8px',
        xl: '12px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.08)',
        'card-hover': '0 4px 12px 0 rgb(0 0 0 / 0.1)',
        dropdown: '0 4px 16px 0 rgb(0 0 0 / 0.12)',
        modal: '0 8px 30px 0 rgb(0 0 0 / 0.15)',
      },
    },
  },
  plugins: [],
}
