import { Suspense } from "react";
import { BusMapApp } from "@/features/bus-map/BusMapApp";

export default function Home() {
  return (
    <main className="relative h-dvh w-full overflow-clip">
      {/* BusMapApp 讀取網址參數，需要 Suspense 才能讓外框先預先渲染 */}
      <Suspense>
        <BusMapApp />
      </Suspense>
    </main>
  );
}
