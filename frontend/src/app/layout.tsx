import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMARTFLOW AI - Bengaluru Traffic Incident Intelligence Platform",
  description: "Real-time AI-powered traffic incident forecasting, congestion hotspot clustering, and resource deployment recommender for Bengaluru Traffic Police Command Center.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full scroll-smooth">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚦</text></svg>"/>
      </head>
      <body className="h-full bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
        {children}
      </body>
    </html>
  );
}
