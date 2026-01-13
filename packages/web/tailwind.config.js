/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand colors
        field: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        // Accent for CTAs and highlights
        accent: {
          cyan: '#06b6d4',
          purple: '#a855f7',
          pink: '#ec4899',
          orange: '#f97316',
        },
        // Surface colors - light theme
        surface: {
          DEFAULT: '#ffffff',
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
        },
      },
      backgroundImage: {
        // Soft gradient mesh for light theme
        'gradient-mesh': 'radial-gradient(at 40% 20%, hsla(174,80%,85%,0.5) 0px, transparent 50%), radial-gradient(at 80% 0%, hsla(200,80%,90%,0.4) 0px, transparent 50%), radial-gradient(at 0% 50%, hsla(174,70%,88%,0.3) 0px, transparent 50%), radial-gradient(at 80% 50%, hsla(190,80%,90%,0.3) 0px, transparent 50%), radial-gradient(at 50% 100%, hsla(174,80%,85%,0.4) 0px, transparent 50%)',
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
};
