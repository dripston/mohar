"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

// The tamper lab hashes in the browser (viem + @mohar/core). Its code is fetched only when the section nears the viewport.
const TamperLab = dynamic(() => import("./TamperLab").then((m) => m.TamperLab), { ssr: false, loading: () => <div className="h-[720px]" aria-hidden /> });

export function LazyTamperLab() {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setShow(true), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  return <div ref={ref}>{show ? <TamperLab /> : <div className="h-[720px]" aria-hidden />}</div>;
}
