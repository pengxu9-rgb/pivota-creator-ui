import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/features/**/*.{ts,tsx}",
    "./src/styles/**/*.{ts,tsx,css}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        gold: {
          DEFAULT: "hsl(var(--gold))",
          foreground: "hsl(var(--gold-foreground))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        card: "hsl(var(--card))",
      },
      boxShadow: {
        "glass": "0 20px 60px rgba(0,0,0,0.45)",
        "glass-hover": "0 24px 80px rgba(0,0,0,0.6)",
      },
      backgroundImage: {
        "gradient-mesh":
          "radial-gradient(circle at 20% 20%, rgba(99,102,241,0.25), transparent 30%), radial-gradient(circle at 80% 30%, rgba(56,189,248,0.25), transparent 35%), radial-gradient(circle at 50% 80%, rgba(168,85,247,0.2), transparent 30%)",
      },
    },
  },
  plugins: [],
};

export default config;
