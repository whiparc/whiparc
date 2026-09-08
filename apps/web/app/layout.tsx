import type { Metadata } from "next";
import "./globals.css";

const geistSans = { variable: "font-sans" };
const geistMono = { variable: "font-mono" };

export const metadata: Metadata = {
  title: "Whiparc - Visual Infrastructure Provisioning",
  description: "Design and provision infrastructure with a modern visual editor. Generate Ansible playbooks visually.",
};

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  // Parallel route slot for app/@modal — populated by the intercepting route
  // at app/@modal/(.)templates/[id]/page.tsx when a template card is opened
  // via client-side navigation from /templates, empty (app/@modal/default.tsx)
  // otherwise. See product-memory 10.1 for the full "Canva-style popup with a
  // shareable URL" rationale.
  modal: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {modal}
      </body>
    </html>
  );
}
