import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "CanvassHQ",
  description: "Multi-tenant door-to-door canvassing workspace",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
