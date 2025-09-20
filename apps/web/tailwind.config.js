/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        // FlowReader color palette
        primary: {
          50: '#eff6ff',
          100: '#dbeafe', 
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb', // Main primary
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#1a365d'
        },
        accent: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#e56b1f', // Main accent
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407'
        },
        reading: {
          light: '#f7f6f3', // Cream background
          dark: '#1a1a1a',   // Dark reading mode
          text: '#2d3748',    // High contrast text
          'text-light': '#e2e8f0' // Light mode text
        },
        ai: {
          500: '#8b5cf6',
          600: '#805ad5',
          700: '#6b46c1'
        }
      },
      fontFamily: {
        'reading': ['Charter', 'Georgia', 'serif'],
        'interface': ['Inter', 'system-ui', 'sans-serif'],
        'code': ['JetBrains Mono', 'monospace']
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            maxWidth: '65ch',
            lineHeight: '1.7',
            fontSize: '18px',
            color: theme('colors.reading.text'),
            '[data-theme="dark"]': {
              color: theme('colors.reading.text-light'),
            }
          }
        }
      })
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/forms')
  ],
  darkMode: ['class', '[data-theme="dark"]']
}