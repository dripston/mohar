import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        raised: v("raised"),
        ink: v("ink"),
        muted: v("muted"),
        line: v("line"),
        seal: v("seal"),
        gold: v("gold"),
        paper: v("paper"),
        ok: v("ok"),
        bad: v("bad"),
        warn: v("warn"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        cert: ["var(--font-cert)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { xl: "14px", "2xl": "20px", "3xl": "28px" },
      boxShadow: {
        card: "inset 0 1px 0 rgb(255 255 255 / 0.04), 0 24px 48px -32px rgb(0 0 0 / 0.9)",
        paper: "0 1px 0 rgb(255 255 255 / 0.6) inset, 0 40px 80px -30px rgb(0 0 0 / 0.85), 0 12px 24px -12px rgb(0 0 0 / 0.6)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-10px)" } },
        ping: { "75%,100%": { transform: "scale(2.2)", opacity: "0" } },
        scan: { "0%": { top: "8%" }, "50%": { top: "88%" }, "100%": { top: "8%" } },
        spin: { to: { transform: "rotate(360deg)" } },
      },
      animation: {
        shimmer: "shimmer 1.4s infinite",
        marquee: "marquee 40s linear infinite",
        "marquee-slow": "marquee 70s linear infinite",
        float: "float 7s ease-in-out infinite",
        "ping-slow": "ping 2.2s cubic-bezier(0,0,0.2,1) infinite",
        scan: "scan 3.2s ease-in-out infinite",
        "spin-slow": "spin 40s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
