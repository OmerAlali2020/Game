import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dodge the Falling Objects",
  description: "A kid-friendly 2D browser game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
