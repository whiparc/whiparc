import { Navbar } from './Navbar';
import { Footer } from '../page';

// Shared chrome for the short informational pages linked from the footer
// (About, Contact, Privacy, Terms, Security) — same Navbar/Footer as the
// marketing page so these don't feel like they've left the site, with a
// narrow prose column since none of them need a marketing layout.
export function StaticPageLayout({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-background flex flex-col text-slate-100">
      <Navbar />
      <main className="flex-1 pt-40 pb-24">
        <div className="mx-auto max-w-2xl px-6 lg:px-10">
          <p className="text-xs uppercase tracking-widest text-indigo-400 font-semibold">{eyebrow}</p>
          <h1 className="mt-4 text-3xl font-extrabold text-white lg:text-4xl tracking-tight">{title}</h1>
          <div className="mt-8 flex flex-col gap-5 text-sm leading-relaxed text-slate-400">
            {children}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default StaticPageLayout;
