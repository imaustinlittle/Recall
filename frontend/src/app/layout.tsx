import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recall",
  description: "Record, transcribe, and recall your meetings.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
