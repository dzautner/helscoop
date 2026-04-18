import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ToastProvider";
import { LocaleProvider } from "@/components/LocaleProvider";

export const metadata: Metadata = {
  title: "Helscoop — Näe talosi. Muuta. Rakenna.",
  description:
    "3D-mallinna talosi ja suunnittele remontti reaaliaikaisilla hinnoilla",
  icons: {
    icon: { url: "/icon.svg", type: "image/svg+xml" },
    apple: "/icon.svg",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "Helscoop",
    description: "Näe talosi 3D:nä, suunnittele remontti suomeksi",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fi">
      <head>
        <style
          dangerouslySetInnerHTML={{ __html: "html{background:#12110f}" }}
        />
      </head>
      <body className="grain">
        <LocaleProvider>
          <ToastProvider>{children}</ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
