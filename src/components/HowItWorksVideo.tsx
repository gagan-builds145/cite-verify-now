import { motion } from "framer-motion";
import { ArrowUpRight, Clock3, Film, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

const VIDEO_SRC = "/videos/citeverify-how-it-works.mp4";
const POSTER_SRC = "/videos/citeverify-video-poster.svg";

type VideoState = "checking" | "available" | "missing";

export function HowItWorksVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<VideoState>("checking");
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(VIDEO_SRC, { method: "HEAD", cache: "no-store" })
      .then((response) => {
        const type = response.headers.get("content-type") ?? "";
        const available =
          response.ok && (type.startsWith("video/") || type.includes("mp4"));
        if (active) setState(available ? "available" : "missing");
      })
      .catch(() => {
        if (active) setState("missing");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto mt-12 max-w-[1080px]"
    >
      <div className="mx-auto max-w-2xl text-center">
        <p className="eyebrow">Product walkthrough</p>
        <h3 className="mt-3 font-display text-[clamp(1.65rem,3vw,2.25rem)] leading-tight tracking-[-0.03em]">
          See CiteVerify in Action
        </h3>
        <p className="mx-auto mt-3 max-w-xl text-[13px] leading-6 text-muted-foreground">
          Watch how a research paper becomes a transparent, evidence-backed verification report.
        </p>
      </div>

      <div className="mt-7 overflow-hidden rounded-2xl border border-border bg-[#0F1F36] shadow-[0_24px_70px_-30px_rgba(20,35,61,0.55)]">
        <div
          className={`relative ${
            state === "available" ? "aspect-video" : "aspect-[4/3] sm:aspect-video"
          }`}
        >
          {state === "available" ? (
            <>
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                controls
                playsInline
                preload="none"
                poster={POSTER_SRC}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                aria-label="CiteVerify 30-second product walkthrough"
              >
                <source src={VIDEO_SRC} type="video/mp4" />
                Your browser does not support the video element.
              </video>
              {!playing && (
                <button
                  type="button"
                  onClick={() => void videoRef.current?.play()}
                  className="absolute left-1/2 top-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-[#FBFAF7]/95 text-[#14233D] shadow-[0_16px_40px_rgba(0,0,0,0.3)] backdrop-blur transition-transform hover:scale-105"
                  aria-label="Play the CiteVerify product walkthrough"
                >
                  <Play className="ml-1 size-8 fill-current" />
                </button>
              )}
            </>
          ) : (
            <div className="group relative h-full w-full">
              <img
                src={POSTER_SRC}
                alt="Preview of a CiteVerify verification report showing a claim, retrieved evidence and a partially supported verdict."
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#07111f]/85 via-[#07111f]/10 to-transparent" />
              <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#07111f]/55 px-3 py-1.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[#FBFAF7]/80 backdrop-blur sm:left-6 sm:top-6">
                <Film className="size-3.5 text-[#8CBDF2]" />
                30-second walkthrough
              </div>
              <div className="absolute inset-x-4 bottom-4 flex flex-col gap-3 rounded-xl border border-white/10 bg-[#07111f]/60 p-4 backdrop-blur sm:inset-x-6 sm:bottom-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[12px] font-semibold text-[#FBFAF7]">
                    The screen recording is being prepared.
                  </p>
                                    <p className="mt-1 max-w-md text-[10.5px] leading-5 text-[#FBFAF7]/60">
                    Explore the complete workflow now. The final 30-second recording will replace
                    this preview when added.
                    <span className="hidden sm:inline">
                      {" "}
                      Expected asset:{" "}
                      <code className="break-all rounded bg-white/10 px-1 py-0.5 text-[9.5px] text-[#A9C8EC]">
                        public/videos/citeverify-how-it-works.mp4
                      </code>
                    </span>
                  </p>
                </div>
                <Link
                  to="/analyze?demo=1"
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#FBFAF7] px-4 py-2 text-[11px] font-semibold text-[#14233D] transition-colors hover:bg-[#A9C8EC]"
                >
                  Open the live demo
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="size-3.5" />
          Approximately 30 seconds
        </span>
        <span className="size-1 rounded-full bg-border" />
        <span>Actual CiteVerify interface and workflows</span>
        <span className="size-1 rounded-full bg-border" />
        <span>Captions ready when available</span>
      </div>
    </motion.div>
  );
}
