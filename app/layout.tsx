import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/nav";

export const metadata: Metadata = {
  title: "VR G2M and CRM",
  description: "Valuation Realized G2M and CRM",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-vr-bg">
        <Nav />
        <main className="px-4 sm:px-6 py-6 sm:py-8">{children}</main>
      </body>
    </html>
  );
}
