import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "XAU AI Trading Agent",
  description: "Data-driven XAUUSD analysis engine"
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Arial, sans-serif", margin: 40 }}>
        {children}
      </body>
    </html>
  );
}