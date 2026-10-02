import { SiteFooter, SiteHero, SiteStory } from "@/components/site-sections";
import { SiteHeader } from "@/components/site-header";
import { StockProofScreen } from "@/components/stock-proof-screen";

export default function Home() {
  return (
    <div id="top">
      <SiteHeader />
      <main id="main">
        <SiteHero />
        <StockProofScreen />
        <SiteStory />
      </main>
      <SiteFooter />
    </div>
  );
}
