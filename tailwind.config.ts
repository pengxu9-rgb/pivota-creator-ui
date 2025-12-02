import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/styles/**/*.{ts,tsx,css}",
  ],
  theme: {
    extend: {
      colors: {
        border: "rgba(255,255,255,0.08)",
        card: "rgba(255,255,255,0.04)",
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
