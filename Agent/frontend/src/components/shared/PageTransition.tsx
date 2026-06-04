import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  stepKey: string | number;
}

export default function PageTransition({ children, stepKey }: Props) {
  const firstRender = useRef(true);
  const prevKey = useRef(stepKey);
  const [animClass, setAnimClass] = useState<string | null>(null);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const direction = (stepKey as number) > (prevKey.current as number) ? "forward" : "back";
    prevKey.current = stepKey;
    setAnimClass(`page-turn-${direction}`);
    const t = setTimeout(() => setAnimClass(null), 400);
    return () => clearTimeout(t);
  }, [stepKey]);

  return (
    <div className={animClass ?? undefined} style={{ willChange: "transform, opacity" }}>
      {children}
    </div>
  );
}
