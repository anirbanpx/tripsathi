import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  stepKey: string | number;
}

export default function PageTransition({ children, stepKey }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = "0";
    el.style.transform = "translateX(24px) scale(0.98)";
    const raf = requestAnimationFrame(() => {
      el.style.transition = "opacity 0.28s ease-out, transform 0.28s ease-out";
      el.style.opacity = "1";
      el.style.transform = "translateX(0) scale(1)";
    });
    return () => cancelAnimationFrame(raf);
  }, [stepKey]);

  return (
    <div ref={ref} style={{ willChange: "opacity, transform" }}>
      {children}
    </div>
  );
}
