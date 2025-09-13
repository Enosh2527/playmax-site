import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Badge } from "./components/ui/badge";
import {
  Play,
  Star,
  Phone,
  Mail,
  MapPin,
  Instagram,
  Youtube,
  Menu,
  X,
  Music,
  MessageCircle,
} from "lucide-react";

/* ----------------------------- NAV + STATIC DATA ---------------------------- */
const nav = [
  { id: "home", label: "Home" },
  { id: "about", label: "About" },
  { id: "services", label: "Services" },
  { id: "gallery", label: "Gallery" },
  { id: "testimonials", label: "Testimonials" },
  { id: "genres", label: "Genres" },
  { id: "contact", label: "Contact" },
];

const services = [
  { icon: <Music className="w-6 h-6" />, title: "Weddings", desc: "From romantic first dances to high-energy receptions, we create the soundtrack to your love story." },
  { icon: <Music className="w-6 h-6" />, title: "Corporate Events", desc: "Professional yet vibrant sound experiences for product launches, conferences, and holiday parties." },
  { icon: <Music className="w-6 h-6" />, title: "Private Parties", desc: "Birthdays, anniversaries, or just a night to remember—Playmax brings the beats that keep the dance floor alive." },
  { icon: <Music className="w-6 h-6" />, title: "Custom Packages", desc: "Tailored solutions to fit your event size, theme, and budget." },
];

const gallery = [
  { type: "image", src: "/gallery/img2.jpg" },
  { type: "image", src: "/gallery/img3.jpg" },
  { type: "image", src: "/gallery/img4.jpg" },
  { type: "image", src: "/gallery/img5.jpg" },
  { type: "image", src: "/gallery/img6.jpg" },
  { type: "image", src: "/gallery/img7.jpg" },
  { type: "image", src: "/gallery/img8.jpg" },
  { type: "image", src: "/gallery/img9.jpg" },
];

const testimonials = [
  { quote: "Playmax turned our wedding reception into the best night of our lives. The music was perfect!", name: "Pravenn", role: "RaddisonBlue, Egmore" },
  { quote: "Our corporate event wouldn’t have been the same without Playmax. Professional and energetic!", name: "Ajay (KMC Medical College)", role: "Savera Hotel" },
];

const genres = ["Tamil","Telugu","Bollywood","Malayalam","Kannadam","Punjabi","English (International Hits)","EDM","PsyTrance","Techno"];
const playsFor = ["College Culturals","School Farewells","Corporate Events","Wedding Reception","Sangeet Function","Baraat Procession (DJ on Wheels)","Mehendi Function","Haldi Ceremonies","Birthday Parties","Fashion Shows","Award Functions","Private Parties"];

/* -------------------------------- UI HELPERS -------------------------------- */
function SectionHeading({ eyebrow, title, subtitle }) {
  return (
    <div className="mx-auto max-w-3xl text-center mb-16">
      {eyebrow && <div className="mb-4 text-sm tracking-widest uppercase text-muted-foreground">{eyebrow}</div>}
      <h2 className="text-4xl sm:text-5xl font-bold leading-snug mb-4">{title}</h2>
      {subtitle && <p className="mt-2 text-lg text-muted-foreground leading-relaxed">{subtitle}</p>}
    </div>
  );
}
const fadeUp = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.6 } } };

/* --------------------------- GALLERY CAROUSEL --------------------------- */
function GalleryCarousel({ items = [] }) {
  const viewportRef = useRef(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const goTo = (i) => {
    const el = viewportRef.current; if (!el) return;
    const clamped = Math.max(0, Math.min(items.length - 1, i));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    setIndex(clamped);
  };

  return (
    <div className="relative">
      <div
        ref={viewportRef}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar scroll-smooth rounded-2xl shadow-lg"
        style={{ scrollbarWidth: "none" }}
      >
        <style>{`.no-scrollbar::-webkit-scrollbar{display:none}`}</style>
        {items.map((g, i) => (
          <div key={`${g.src}-${i}`} className="min-w-full snap-center relative">
            <img src={g.src} alt="" className="w-full aspect-[16/9] object-cover" loading="lazy" decoding="async" />
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          </div>
        ))}
      </div>

      <button
        onClick={() => goTo(index - 1)}
        aria-label="Previous"
        className="absolute left-3 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80"
      >
        ‹
      </button>
      <button
        onClick={() => goTo(index + 1)}
        aria-label="Next"
        className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80"
      >
        ›
      </button>

      <div className="mt-4 flex justify-center gap-2">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`h-2.5 rounded-full transition-all ${i === index ? "w-6 bg-[#E4AA06]" : "w-2.5 bg-neutral-300"}`}
          />
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- APP ROOT --------------------------------- */
export default function App() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("home");

  useEffect(() => {
    const handler = () => {
      const sections = nav.map((n) => document.getElementById(n.id)).filter(Boolean);
      const scrollY = window.scrollY + 120;
      for (const sec of sections) {
        if (sec.offsetTop <= scrollY && sec.offsetTop + sec.offsetHeight > scrollY) { setActive(sec.id); break; }
      }
    };
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const handleNavClick = (id) => {
    setActive(id); setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ✅ WhatsApp integration for Contact form
  const onSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    const name = formData.get("name") || "";
    const email = formData.get("email") || "";
    const phone = formData.get("phone") || "";
    const eventType = formData.get("eventType") || "";
    const city = formData.get("city") || "";
    const date = formData.get("date") || "";
    const message = formData.get("message") || "";

    const text = `New Event Inquiry:
Name: ${name}
Email: ${email}
Phone: ${phone}
Event: ${eventType}
City: ${city}
Date: ${date}
Message: ${message}`;

    const whatsappNumber = "919884113283"; // +91 98841 13283
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;

    window.open(whatsappUrl, "_blank");
  };

  return (
    <div className="min-h-screen text-foreground scroll-smooth relative bg-gradient-to-b from-[#E6DBFA] via-[#F3EFFF] to-white">
      {/* GLOBAL FIXED LOGO WATERMARK */}
      <div className="fixed inset-0 z-0 pointer-events-none flex items-center justify-center">
        <img src="/logo.png" alt="" aria-hidden="true" className="opacity-10 w-[110vmin] max-w-none" />
      </div>

      <div className="relative z-10">
        {/* HEADER */}
        <header className="sticky top-0 z-50 bg-white/85 backdrop-blur border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 grid grid-cols-[auto,1fr,auto] items-center gap-3">
            {/* Logo + Name (name always visible now) */}
            <a
              href="#home"
              className="flex items-center gap-3 font-bold text-base sm:text-lg whitespace-nowrap shrink-0"
              onClick={() => handleNavClick("home")}
            >
              <img src="/logo.png" alt="Playmax Logo" className="h-8 sm:h-10 w-auto object-contain" />
              <span>Playmax</span>
            </a>

            {/* Nav (desktop only) */}
            <nav className="hidden md:flex items-center justify-center gap-8 min-w-0">
              {nav.map((n) => (
                <a
                  key={n.id}
                  href={`#${n.id}`}
                  onClick={() => handleNavClick(n.id)}
                  className={`text-base hover:text-primary ${active === n.id ? "text-primary font-semibold" : ""}`}
                >
                  {n.label}
                </a>
              ))}
            </nav>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 sm:gap-3 shrink-0">
              <Button
                asChild
                size="sm"
                className="sm:hidden rounded-xl px-3 py-1.5 text-xs font-semibold bg-[#1C449C] hover:bg-[#16357a] text-white whitespace-nowrap"
              >
                <a href="#contact" onClick={() => handleNavClick("contact")}>Book</a>
              </Button>
              <Button
                asChild
                size="sm"
                className="hidden sm:inline-flex rounded-2xl px-4 py-2 text-sm font-medium bg-[#1C449C] hover:bg-[#16357a] text-white whitespace-nowrap"
              >
                <a href="#contact" onClick={() => handleNavClick("contact")}>Book Your Event Now</a>
              </Button>
              <a
                href="https://wa.me/919884113283"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex p-2 rounded-full border bg-[#25D366] text-white hover:bg-[#1ebe5d]"
                aria-label="WhatsApp"
                title="Chat on WhatsApp"
              >
                <MessageCircle className="w-5 h-5" />
              </a>
              <button
                className="md:hidden inline-flex items-center justify-center rounded-xl p-2 border"
                aria-label="Toggle menu"
                onClick={() => setOpen((v) => !v)}
              >
                {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>

          {/* Mobile nav */}
          {open && (
            <div className="md:hidden border-t bg-white">
              <div className="max-w-7xl mx-auto px-4 py-3 grid gap-2">
                {nav.map((n) => (
                  <a
                    key={n.id}
                    href={`#${n.id}`}
                    onClick={() => handleNavClick(n.id)}
                    className={`py-2 ${active === n.id ? "text-primary font-medium" : ""}`}
                  >
                    {n.label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </header>

        {/* HERO */}
        <section id="home" className="relative overflow-hidden py-28 sm:py-36">
          <div className="absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/20 via-transparent to-transparent" />
          </div>
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="text-center">
              <Badge className="mb-6 rounded-full px-4 py-2 text-sm" variant="secondary">Premium DJ • Pro Sound • Lighting</Badge>
              <h1 className="text-5xl sm:text-7xl font-extrabold leading-tight mb-6">Elevating Events with Sound</h1>
              <p className="mt-4 text-xl text-muted-foreground leading-relaxed">Premium DJ Services for Weddings, Corporate Events, and Private Celebrations</p>
              <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-3xl mx-auto">
                At Playmax, we transform every event into an unforgettable experience through the power of music. From weddings and private parties to corporate galas, we set the perfect tone with professional sound, seamless mixes, and unmatched energy.
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-4">
                <Button size="lg" className="rounded-2xl px-6 py-3 text-lg font-semibold bg-[#1C449C] hover:bg-[#16357a] text-white" asChild>
                  <a href="#contact" onClick={() => handleNavClick("contact")}><Play className="w-5 h-5" /> Book Your Event Now</a>
                </Button>
                <Button size="lg" variant="outline" className="rounded-2xl px-6 py-3 text-lg font-semibold" asChild>
                  <a href="#services" onClick={() => handleNavClick("services")}>Explore Services</a>
                </Button>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ABOUT */}
        <section id="about" className="py-28">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}>
                <SectionHeading eyebrow="Who We Are" title="Curators of Atmosphere. Creators of Memories." />
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Playmax is more than just DJ services—we are curators of atmosphere and creators of memories. With years of experience, we blend the art of mixing with high-quality sound engineering to deliver events that resonate with your audience.
                </p>
                <div className="mt-8 space-y-6">
                  <div>
                    <h4 className="font-semibold text-lg">Our Mission</h4>
                    <p className="text-base text-muted-foreground leading-relaxed">To elevate every event with flawless sound, dynamic beats, and personalized playlists.</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg">Why Choose Us?</h4>
                    <ul className="mt-3 grid sm:grid-cols-2 gap-4 text-base text-muted-foreground leading-relaxed">
                      {[
                        "Professional DJs with experience across genres",
                        "Premium sound systems for crystal-clear audio",
                        "Tailored playlists to match your vision",
                        "Seamless coordination with event planners",
                      ].map((pt) => (
                        <li key={pt} className="flex items-start gap-3">
                          <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10"><Star className="w-4 h-4" /></span>
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.div>
              <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} className="relative">
                <div className="grid grid-cols-2 gap-6">
                  <img className="rounded-2xl object-cover h-64 w-full shadow-md" src="/about1.jpg" alt="Dance floor" loading="lazy" decoding="async" />
                  <img className="rounded-2xl object-cover h-64 w-full shadow-md" src="/about2.jpg" alt="Corporate stage" loading="lazy" decoding="async" />
                  <img className="rounded-2xl object-cover h-64 w-full shadow-md" src="/about3.jpg" alt="DJ console" loading="lazy" decoding="async" />
                  <img className="rounded-2xl object-cover h-64 w-full shadow-md" src="/about4.jpg" alt="Private party" loading="lazy" decoding="async" />
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* SERVICES */}
        <section id="services" className="py-28">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeading eyebrow="Services" title="Premium DJ Services for Every Occasion" subtitle="Tailored packages for weddings, corporate, and private events." />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {services.map((s) => (
                <motion.div key={s.title} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-50px" }}>
                  <Card className="rounded-2xl h-full shadow-lg hover:shadow-xl transition-shadow">
                    <CardHeader>
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-4">{s.icon}</div>
                      <CardTitle className="text-xl font-semibold">{s.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-base text-muted-foreground leading-relaxed">{s.desc}</CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* GALLERY */}
        <section id="gallery" className="py-28">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeading eyebrow="Gallery / Media" title="Crowd Energy. Clean Mixes. Big Moments." subtitle="Swipe through highlights." />
            <GalleryCarousel items={gallery} />
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section id="testimonials" className="py-28">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeading eyebrow="Testimonials" title="What Clients Say" subtitle="Real words from unforgettable nights." />
            <div className="grid lg:grid-cols-2 gap-8">
              {testimonials.map((t) => (
                <motion.div key={t.name} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}>
                  <Card className="rounded-2xl h-full shadow-md">
                    <CardHeader><CardTitle className="text-xl leading-relaxed">“{t.quote}”</CardTitle></CardHeader>
                    <CardContent><div className="mt-4 text-base text-muted-foreground">{t.name} • {t.role}</div></CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* GENRES + PLAYS FOR */}
        <section id="genres" className="py-28 text-white bg-black/50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-16 text-center md:text-left">
            <div>
              <h2 className="text-4xl font-bold mb-12">🎵 GENRES 🎵</h2>
              <ul className="text-lg leading-relaxed space-y-3">{genres.map((g) => <li key={g}>{g}</li>)}</ul>
            </div>
            <div>
              <h2 className="text-3xl font-bold mb-6 uppercase">PLAYS FOR</h2>
              <div className="w-16 h-1 bg-[#E4AA06] mb-10 mx-auto md:mx-0"></div>
              <ul className="text-lg leading-relaxed space-y-3">{playsFor.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          </div>
        </section>

        {/* CONTACT */}
        <section id="contact" className="py-28">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeading eyebrow="Contact / Booking" title="Let’s Make Your Event Unforgettable!" subtitle="Secure your date with Playmax. We usually reply within 24 hours." />
            <div className="grid lg:grid-cols-2 gap-10">
              <Card className="rounded-2xl shadow-lg">
                <CardContent className="p-6 space-y-4">
                  <form className="space-y-4" onSubmit={onSubmit}>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Input placeholder="Name" name="name" required />
                      <Input placeholder="Email" type="email" name="email" required />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Input placeholder="Phone" type="tel" name="phone" required />
                      <Input placeholder="Event Type (e.g., Wedding)" name="eventType" required />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Input placeholder="City" name="city" />
                      <Input placeholder="Date" name="date" type="date" required />
                    </div>
                    <Textarea placeholder="Message" className="min-h-[140px]" name="message" required />
                    <Button size="lg" className="rounded-2xl w-full bg-[#1C449C] hover:bg-[#16357a] text-white" type="submit">
                      Secure Your Date with Playmax (WhatsApp)
                    </Button>
                    <p className="text-xs text-muted-foreground">By submitting, you'll be redirected to WhatsApp to send your inquiry.</p>
                  </form>
                </CardContent>
              </Card>

              <Card className="rounded-2xl shadow-lg h-fit self-start">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <Phone className="w-5 h-5 mt-1" />
                    <div>
                      <div className="text-sm text-muted-foreground">Phone</div>
                      <a className="font-medium" href="tel:+919884113283">+91 98841 13283</a>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Mail className="w-5 h-5 mt-1" />
                    <div>
                      <div className="text-sm text-muted-foreground">Email</div>
                      <a className="font-medium" href="mailto:Playmaxdjevents@gmail.com">Playmaxdjevents@gmail.com</a>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 mt-1" />
                    <div>
                      <div className="text-sm text-muted-foreground">Base</div>
                      <div className="font-medium">Chennai</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <a
                      href="https://www.instagram.com/playmaxdjevents?igsh=cmRkMG1iYjF1YTY0"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex p-2 rounded-full border hover:bg-[hsl(210_20%_92%)]"
                      aria-label="Instagram"
                    >
                      <Instagram className="w-5 h-5" />
                    </a>
                    <a
                      href="https://www.youtube.com/@playmaxstudio-c8u"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex p-2 rounded-full border hover:bg-[hsl(210_20%_92%)]"
                      aria-label="YouTube"
                    >
                      <Youtube className="w-5 h-5" />
                    </a>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="border-t py-12 mt-12">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="space-y-2 text-center md:text-left">
                <div className="font-bold text-lg">Playmax</div>
                <div className="text-sm text-muted-foreground">Elevating Events with Sound</div>
                <div className="text-sm text-muted-foreground">© {new Date().getFullYear()} All rights reserved.</div>
              </div>
              <div className="flex gap-6 text-sm justify-center md:justify-end">
                {nav.map((n) => (
                  <a key={n.id} href={`#${n.id}`} className="hover:text-primary" onClick={() => handleNavClick(n.id)}>
                    {n.label}
                  </a>
                ))}
              </div>
              <div className="flex items-center gap-3 justify-center md:justify-end">
                <a
                  href="https://www.instagram.com/playmaxdjevents?igsh=cmRkMG1iYjF1YTY0"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex p-2 rounded-full border hover:bg-[hsl(210_20%_92%)]"
                  aria-label="Instagram"
                >
                  <Instagram className="w-5 h-5" />
                </a>
                <a
                  href="https://www.youtube.com/@playmaxstudio-c8u"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex p-2 rounded-full border hover:bg-[hsl(210_20%_92%)]"
                  aria-label="YouTube"
                >
                  <Youtube className="w-5 h-5" />
                </a>
                <a
                  href="https://wa.me/919884113283"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex p-2 rounded-full border bg-[#25D366] text-white hover:bg-[#1ebe5d]"
                  aria-label="WhatsApp"
                  title="Chat on WhatsApp"
                >
                  <MessageCircle className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
