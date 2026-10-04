import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Scholarship } from "@/components/landing/Scholarship";
import { TryIt } from "@/components/landing/TryIt";
import { LazyTamperLab } from "@/components/landing/LazyTamperLab";
import { AttackMarquee, FinalCta, Personas, Pillars, Stats, Verdicts } from "@/components/landing/Sections";


export default function Home() {
  return (
    <>
      <Hero />
      <div className="mt-20 sm:mt-28">
        <AttackMarquee />
      </div>
      <Scholarship />
      <TryIt />
      <div className="cv-auto">
        <Pillars />
      </div>
      <div className="cv-auto">
        <LazyTamperLab />
      </div>
      <div className="cv-auto">
        <Stats />
      </div>
      <HowItWorks />
      <div className="cv-auto">
        <Verdicts />
      </div>
      <div className="cv-auto">
        <Personas />
      </div>
      <FinalCta />
    </>
  );
}
