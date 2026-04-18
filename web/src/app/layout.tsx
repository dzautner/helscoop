import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Helscoop - Rakennusprojektien suunnittelu",
  description: "Suunnittele ja laske rakennusprojektisi reaaliaikaisilla hinnoilla",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fi">
      <body className="grain">{children}</body>
    </html>
  );
}
