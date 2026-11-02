import type { Metadata } from "next";
import "./theme.css";

export const metadata: Metadata = {
  title: "Weeknote · A little clarity for your team",
  description: "Weekly plans, shared tasks and focused teamwork. All on the same page.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
