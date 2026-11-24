import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BW-Template-FE — Client Templates",
  description:
    "Provision Bitwarden client Shared Folders and clone admin templates into Software/Hardware.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Loaded at runtime to avoid flaky next/font Google URL parsing during Docker builds. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Open+Sans:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
