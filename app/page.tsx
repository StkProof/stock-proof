import { SiteFooter, SiteHero, SiteStory } from "@/components/site-sections";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <div id="top">
      <SiteHeader />
      <main id="main">
        <SiteHero />
        <SiteStory />
      </main>
      <SiteFooter />
    </div>
  );
}
