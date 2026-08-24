import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GymGroup",
  description: "Log lifts, keep your friends honest.",
  appleWebApp: {
    capable: true,
    title: "GymGroup",
    // Matches the app background so the iOS status bar blends into the header.
    statusBarStyle: "black-translucent",
  },
  // iOS ignores the manifest icons for the home-screen tile and uses this.
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0b0f14",
  width: "device-width",
  initialScale: 1,
  // Required for env(safe-area-inset-*) to report non-zero values on notched iPhones.
  viewportFit: "cover",
  // Double-tap zoom in the middle of a set is never intentional.
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
