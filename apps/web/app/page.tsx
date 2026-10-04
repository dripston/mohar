import { Hero } from "@/components/landing/Hero";
import { TamperLab } from "@/components/landing/TamperLab";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Scholarship } from "@/components/landing/Scholarship";
import { TryIt } from "@/components/landing/TryIt";
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
      <Pillars />
      <TamperLab />
      <Stats />
      <HowItWorks />
      <Verdicts />
      <Personas />
      <FinalCta />
    </>
  );
}
