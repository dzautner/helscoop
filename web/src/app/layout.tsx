import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ToastProvider";

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
      <body className="grain">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
