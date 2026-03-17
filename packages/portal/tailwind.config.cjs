/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './src/**/*.{vue,ts}'],
    theme: {
        extend: {
            fontFamily: {
                body: ['"Public Sans"', 'ui-sans-serif', 'sans-serif'],
                display: ['"Sora"', 'ui-sans-serif', 'sans-serif'],
                mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
            },
            colors: {
                canvas: '#f3f7fb',
                card: '#ffffff',
                ink: '#12263a',
                muted: '#5a6b7f',
                accent: '#1997e7',
                accentSoft: '#e8f4ff',
                accentWarm: '#f15a24',
            },
            boxShadow: {
                soft: '0 14px 30px -20px rgba(17, 43, 70, 0.45)',
                insetSoft: 'inset 0 0 0 1px rgba(18, 38, 58, 0.07)',
            },
            keyframes: {
                fadeSlide: {
                    '0%': {opacity: '0', transform: 'translateY(12px)'},
                    '100%': {opacity: '1', transform: 'translateY(0px)'},
                },
                pulseGlow: {
                    '0%, 100%': {boxShadow: '0 0 0 rgba(25, 151, 231, 0.0)'},
                    '50%': {boxShadow: '0 0 0 8px rgba(25, 151, 231, 0.12)'},
                },
            },
            animation: {
                fadeSlide: 'fadeSlide 380ms ease-out',
                pulseGlow: 'pulseGlow 2.4s ease-in-out infinite',
            },
        },
    },
    plugins: [],
};
