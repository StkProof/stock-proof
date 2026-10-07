import { ExampleShowcase } from "@/components/example-showcase";
import { SiteFooter, SiteHero, SiteStory } from "@/components/site-sections";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <div id="top">
      <SiteHeader />
      <main id="main">
        <SiteHero />
        <ExampleShowcase />
        <SiteStory />
      </main>
      <SiteFooter />
    </div>
  );
}
