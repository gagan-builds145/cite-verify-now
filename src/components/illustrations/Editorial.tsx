import { motion, useReducedMotion } from "framer-motion";

const NAVY = "#14233D";
const BLUE = "#2463B5";
const ACCENT = "#3B82D6";
const SKY = "#EEF4FC";
const CREAM = "#FBFAF7";
const GREEN = "#DDF3E7";
const GREEN_INK = "#2F7A57";
const YELLOW = "#FFF0CF";
const YELLOW_INK = "#9A6A17";
const RED = "#FCE2E2";
const RED_INK = "#AE4A44";
const GRAY = "#F1F2F4";
const SKIN = "#F3D3B8";

function Sparkle({ x, y, size = 9, color = BLUE }: { x: number; y: number; size?: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y})`} stroke={color} strokeWidth="2" strokeLinecap="round">
      <path d={`M0 ${-size} V${size}`} />
      <path d={`M${-size} 0 H${size}`} />
      <path d={`M${-size * 0.6} ${-size * 0.6} L${size * 0.6} ${size * 0.6}`} opacity="0.45" />
      <path d={`M${size * 0.6} ${-size * 0.6} L${-size * 0.6} ${size * 0.6}`} opacity="0.45" />
    </g>
  );
}

function Dots({ d }: { d: string }) {
  return <path d={d} fill="none" stroke={NAVY} strokeWidth="2" strokeDasharray="2 9" strokeLinecap="round" opacity="0.45" />;
}

/* ------------------------------------------------------------------ */
/* Hero scene                                                          */
/* ------------------------------------------------------------------ */

function HeroArt() {
  return (
    <svg viewBox="0 0 720 580" className="h-auto w-full" aria-hidden="true">
      <path
        d="M74 222C48 149 97 66 185 52c82-13 123 33 201 16 78-18 157-18 225 36 70 55 60 156 14 222-49 70-54 146-142 177-83 29-156-12-236 6-88 20-166-22-183-103-12-57 37-111 10-184Z"
        fill={SKY}
      />
      <path
        d="M93 427c18-74 95-79 146-113 46-31 33-95 101-114 65-18 112 34 177 41 52 5 98-11 127 32 32 48-6 110-49 145-51 42-83 108-158 111-83 3-140-21-218-17-68 3-140 29-126-85Z"
        fill="#FFF8E9"
        opacity="0.85"
      />
      <Dots d="M45 358C122 268 53 178 167 118c98-52 174-8 241 43 62 48 148 15 222 82 49 44 46 113-8 158" />
      <Dots d="M388 528c24-49 100-47 148-82 32-23 50-61 42-100" />

      {/* citation constellation */}
      <g transform="translate(435 55)">
        <path d="M33 50 91 18l66 29 48-14M91 18v55l58 21 56-31M33 50l24 55 92-11" fill="none" stroke={NAVY} strokeWidth="1.8" opacity="0.55" />
        {[
          [33, 50],
          [91, 18],
          [157, 47],
          [205, 33],
          [91, 73],
          [149, 94],
        ].map(([cx, cy], index) => (
          <g key={index}>
            <circle cx={cx} cy={cy} r={index % 2 === 0 ? 8 : 6} fill={index === 1 ? YELLOW : index === 3 ? GREEN : CREAM} stroke={NAVY} strokeWidth="2" />
            <circle cx={cx} cy={cy} r="2" fill={NAVY} opacity="0.55" />
          </g>
        ))}
        <rect x="165" y="72" width="38" height="30" rx="4" fill={CREAM} stroke={NAVY} strokeWidth="1.6" transform="rotate(8 184 87)" />
        <path d="M173 82h18M173 88h14M173 94h20" stroke={NAVY} strokeWidth="1.2" opacity="0.5" transform="rotate(8 184 87)" />
      </g>

      {/* pinboard paper */}
      <g transform="rotate(-2 476 286)">
        <rect x="358" y="132" width="242" height="300" rx="12" fill={CREAM} stroke={NAVY} strokeWidth="2.8" />
        <path d="M382 172h128M382 188h188M382 204h166M382 220h190" stroke={NAVY} strokeWidth="5" opacity="0.12" strokeLinecap="round" />
        <path d="M382 252h164" stroke={NAVY} strokeWidth="5" opacity="0.12" strokeLinecap="round" />
        <rect x="382" y="236" width="128" height="15" rx="4" fill={YELLOW} />
        <path d="M382 280h188M382 296h142" stroke={NAVY} strokeWidth="5" opacity="0.12" strokeLinecap="round" />
        <rect x="382" y="312" width="178" height="16" rx="4" fill={GREEN} />
        <path d="M382 348h188M382 364h124M382 380h168" stroke={NAVY} strokeWidth="5" opacity="0.12" strokeLinecap="round" />
        <rect x="378" y="396" width="108" height="15" rx="4" fill={SKY} />
        <circle cx="572" cy="150" r="6" fill={RED} stroke={NAVY} strokeWidth="1.8" />
        <path d="M568 137c-11-15 15-21 8-3" fill="none" stroke={RED_INK} strokeWidth="2" strokeLinecap="round" />
        <path d="M542 404l34 12M560 392l16 24" stroke={BLUE} strokeWidth="2.4" strokeLinecap="round" opacity="0.7" />
        <circle cx="575" cy="414" r="24" fill="none" stroke={BLUE} strokeWidth="2.4" opacity="0.7" />
      </g>

      {/* magnifying glass held over paper */}
      <path d="M258 327c34 8 62 13 89 2" fill="none" stroke={SKIN} strokeWidth="19" strokeLinecap="round" />
      <path d="M258 327c34 8 62 13 89 2" fill="none" stroke={NAVY} strokeWidth="2.2" strokeLinecap="round" strokeDasharray="4 3" opacity="0.55" />
      <circle cx="398" cy="318" r="45" fill={SKY} fillOpacity="0.34" stroke={NAVY} strokeWidth="3.2" />
      <circle cx="398" cy="318" r="36" fill="none" stroke={ACCENT} strokeWidth="1.4" opacity="0.7" />
      <path d="M430 350l30 31" stroke={NAVY} strokeWidth="10" strokeLinecap="round" />
      <path d="M378 303c10-12 29-12 39 1" fill="none" stroke={CREAM} strokeWidth="4" strokeLinecap="round" opacity="0.9" />

      {/* researcher */}
      <path
        d="M139 430c-4-68 21-117 70-121 52-4 80 46 78 121"
        fill={SKY}
        stroke={NAVY}
        strokeWidth="2.8"
      />
      <path d="M209 309v42M181 344c10 8 48 8 59-2" fill="none" stroke={NAVY} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M177 390c-24 8-53 4-73 17-13 8-6 23 10 23h104" fill={CREAM} stroke={NAVY} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="210" cy="244" r="55" fill={SKIN} stroke={NAVY} strokeWidth="2.8" />
      <path
        d="M160 224c6-47 92-57 104 2 4 20-1 36-7 45-4-22-11-36-25-42-22-9-50 3-63 18-3-9-8-15-9-23Z"
        fill={NAVY}
      />
      <path d="M201 202c5-19 32-28 47-12 7 8 4 18-6 21-14 5-30-2-41-9Z" fill={NAVY} />
      <circle cx="191" cy="247" r="13" fill={CREAM} stroke={NAVY} strokeWidth="2.2" />
      <circle cx="232" cy="247" r="13" fill={CREAM} stroke={NAVY} strokeWidth="2.2" />
      <path d="M204 247h15M178 245l-8-2M245 245l8-2" stroke={NAVY} strokeWidth="2" strokeLinecap="round" />
      <circle cx="193" cy="249" r="2.5" fill={NAVY} />
      <circle cx="230" cy="249" r="2.5" fill={NAVY} />
      <path d="M201 273c8 7 18 7 26 0" fill="none" stroke={NAVY} strokeWidth="2.3" strokeLinecap="round" />
      <path d="M166 262c-7 22-14 41-19 61" fill="none" stroke={NAVY} strokeWidth="1.6" opacity="0.4" strokeLinecap="round" />

      {/* laptop */}
      <g>
        <path d="M105 376h205l23 47H82l23-47Z" fill={GRAY} stroke={NAVY} strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M125 376V276c0-7 6-12 13-12h142c7 0 13 5 13 12v100" fill={CREAM} stroke={NAVY} strokeWidth="2.5" />
        <path d="M142 291h118M142 306h86" stroke={NAVY} strokeWidth="2" opacity="0.3" strokeLinecap="round" />
        <rect x="148" y="324" width="58" height="35" rx="5" fill={GREEN} opacity="0.9" />
        <path d="M158 345l10 9 20-22" fill="none" stroke={GREEN_INK} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M216 330h38M216 340h28M216 350h34" stroke={NAVY} strokeWidth="1.8" opacity="0.35" strokeLinecap="round" />
        <path d="M164 423h57" stroke={NAVY} strokeWidth="2" opacity="0.25" strokeLinecap="round" />
      </g>

      {/* desk */}
      <path d="M55 448h584" stroke={NAVY} strokeWidth="3" strokeLinecap="round" />
      <path d="M86 449v54M607 449v54" stroke={NAVY} strokeWidth="2.6" strokeLinecap="round" opacity="0.55" />

      {/* books */}
      <g>
        <rect x="95" y="469" width="112" height="21" rx="4" fill={YELLOW} stroke={NAVY} strokeWidth="2.2" transform="rotate(-2 151 479)" />
        <rect x="103" y="446" width="119" height="21" rx="4" fill={SKY} stroke={NAVY} strokeWidth="2.2" transform="rotate(1.5 162 456)" />
        <rect x="89" y="492" width="128" height="23" rx="4" fill={RED} stroke={NAVY} strokeWidth="2.2" transform="rotate(-1 153 503)" />
        <path d="M108 480h74M116 457h76M105 503h77" stroke={NAVY} strokeWidth="1.5" opacity="0.35" strokeLinecap="round" />
        <path d="M214 461c20-3 31 3 38 11" fill="none" stroke={GREEN_INK} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      </g>

      {/* plant */}
      <g transform="translate(584 380)">
        <path d="M34 68c-2-25 0-43 6-61M40 38c-19-2-29-18-29-31 18-2 32 10 29 31ZM41 45c17-7 24-22 20-37-16 1-25 15-20 37Z" fill={GREEN} stroke={NAVY} strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M8 66h60l-8 34c-1 6-6 9-12 9H28c-6 0-11-3-12-9L8 66Z" fill={CREAM} stroke={NAVY} strokeWidth="2.4" />
        <path d="M9 76h58" stroke={NAVY} strokeWidth="1.6" opacity="0.35" />
      </g>

      {/* mug + notes */}
      <g transform="translate(312 415)">
        <path d="M0 0h30v25c0 6-5 10-11 10H11C5 35 0 31 0 25V0Z" fill={CREAM} stroke={NAVY} strokeWidth="2.2" />
        <path d="M30 8h7c6 0 8 4 8 8s-3 8-9 8h-6" fill="none" stroke={NAVY} strokeWidth="2.2" />
        <path d="M8-8c3-4-2-7 1-11M18-8c3-4-2-7 1-11" stroke={NAVY} strokeWidth="1.6" strokeLinecap="round" opacity="0.45" />
      </g>
      <g transform="translate(288 459) rotate(-5)">
        <rect width="64" height="40" rx="3" fill={YELLOW} stroke={NAVY} strokeWidth="2" />
        <path d="M10 12h42M10 21h34M10 30h40" stroke={NAVY} strokeWidth="1.5" opacity="0.4" strokeLinecap="round" />
        <circle cx="50" cy="7" r="3" fill={RED_INK} opacity="0.7" />
      </g>

      <Sparkle x={78} y={180} size={8} color={ACCENT} />
      <Sparkle x={640} y={370} size={7} color={BLUE} />
      <Sparkle x={332} y={84} size={6} color={YELLOW_INK} />
      <path d="M80 500c12-9 24-9 35 0" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

const HERO_LABELS = [
  { label: "Supported", tone: GREEN, ink: GREEN_INK, className: "left-0 top-[9%] sm:left-[1%]", delay: 0 },
  { label: "Partially Supported", tone: YELLOW, ink: YELLOW_INK, className: "right-0 top-[21%] sm:right-[1%]", delay: 0.8 },
  { label: "Contradictory", tone: RED, ink: RED_INK, className: "bottom-[16%] left-[2%]", delay: 1.4 },
  { label: "Unverified", tone: SKY, ink: BLUE, className: "bottom-[38%] right-0 sm:right-[4%]", delay: 0.4 },
];

export function HeroIllustration() {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto w-full max-w-[660px]">
      <motion.div
        animate={reduce ? undefined : { y: [0, -7, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      >
        <HeroArt />
      </motion.div>

      {HERO_LABELS.map((item) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 8 }}
          animate={
            reduce
              ? { opacity: 1, y: 0 }
              : { opacity: 1, y: [0, -4, 0] }
          }
          transition={
            reduce
              ? { duration: 0.2 }
              : { duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: item.delay }
          }
          className={`absolute ${item.className} rotate-[-2deg]`}
        >
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold shadow-[0_5px_14px_rgba(20,35,61,0.08)] sm:px-3 sm:py-1.5 sm:text-[10.5px]"
            style={{ backgroundColor: item.tone, color: item.ink, borderColor: `${NAVY}22` }}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: item.ink }} />
            {item.label}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Feature spot illustrations                                          */
/* ------------------------------------------------------------------ */

export type FeatureKind =
  | "claims"
  | "citations"
  | "evidence"
  | "references"
  | "retraction"
  | "discovery";

export function FeatureIllustration({ kind }: { kind: FeatureKind }) {
  return (
    <div className="relative h-[108px] overflow-hidden rounded-xl border border-[#14233D]/10 bg-[#FBFAF7]">
      <svg viewBox="0 0 190 110" className="h-full w-full" aria-hidden="true">
        <path d="M24 84c-8-18 3-39 22-45 18-6 30-22 54-18 30 5 52 23 58 43 5 17-5 31-24 34-28 4-96 10-110-14Z" fill={SKY} opacity="0.65" />

        {kind === "claims" && (
          <g transform="translate(48 13)">
            <rect x="18" y="4" width="72" height="86" rx="6" fill={CREAM} stroke={NAVY} strokeWidth="2.2" transform="rotate(-4 54 47)" />
            <path d="M32 24h43M32 35h35" stroke={NAVY} strokeWidth="4" opacity="0.16" strokeLinecap="round" transform="rotate(-4 54 47)" />
            <rect x="30" y="43" width="45" height="10" rx="3" fill={YELLOW} transform="rotate(-4 54 47)" />
            <path d="M32 62h44M32 72h30" stroke={NAVY} strokeWidth="4" opacity="0.16" strokeLinecap="round" transform="rotate(-4 54 47)" />
            <rect x="30" y="78" width="34" height="9" rx="3" fill={GREEN} transform="rotate(-4 54 47)" />
            <path d="M96 23c11 8 15 21 10 36" fill="none" stroke={BLUE} strokeWidth="2.2" strokeLinecap="round" strokeDasharray="3 5" />
            <circle cx="116" cy="18" r="12" fill={SKY} stroke={NAVY} strokeWidth="2" />
            <path d="M111 18h10M116 13v10" stroke={BLUE} strokeWidth="2" strokeLinecap="round" />
            <Sparkle x={138} y={30} size={5} color={YELLOW_INK} />
          </g>
        )}

        {kind === "citations" && (
          <g>
            <rect x="27" y="25" width="50" height="63" rx="5" fill={CREAM} stroke={NAVY} strokeWidth="2.2" transform="rotate(-6 52 56)" />
            <path d="M38 42h28M38 52h22M38 62h26" stroke={NAVY} strokeWidth="3" opacity="0.16" strokeLinecap="round" transform="rotate(-6 52 56)" />
            <rect x="106" y="23" width="49" height="64" rx="5" fill={CREAM} stroke={NAVY} strokeWidth="2.2" transform="rotate(5 130 55)" />
            <path d="M116 40h29M116 50h22M116 60h26" stroke={NAVY} strokeWidth="3" opacity="0.16" strokeLinecap="round" transform="rotate(5 130 55)" />
            <path d="M77 54c12-11 21-11 31 0" fill="none" stroke={BLUE} strokeWidth="2.2" strokeLinecap="round" strokeDasharray="3 4" />
            <circle cx="93" cy="50" r="13" fill={SKY} stroke={NAVY} strokeWidth="2" />
            <path d="M86 50h9M90 45l5 5-5 5" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="151" cy="27" r="13" fill={GREEN} stroke={NAVY} strokeWidth="2" />
            <path d="M145 27l4 4 7-8" fill="none" stroke={GREEN_INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}

        {kind === "evidence" && (
          <g transform="translate(30 24)">
            <path d="M4 13c20-8 43-8 63 0v66c-20-8-43-8-63 0V13Z" fill={CREAM} stroke={NAVY} strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M130 13c-20-8-43-8-63 0v66c20-8 43-8 63 0V13Z" fill={CREAM} stroke={NAVY} strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M16 25c13-3 26-3 38 1M16 35c13-3 26-3 38 1M16 45c9-2 20-2 29 0" stroke={NAVY} strokeWidth="2.4" opacity="0.18" strokeLinecap="round" />
            <path d="M73 26c12-4 24-4 36-1M73 36c12-4 24-4 36-1" stroke={NAVY} strokeWidth="2.4" opacity="0.18" strokeLinecap="round" />
            <rect x="75" y="45" width="29" height="8" rx="2" fill={YELLOW} />
            <circle cx="133" cy="59" r="24" fill={SKY} fillOpacity="0.3" stroke={NAVY} strokeWidth="2.6" />
            <path d="M150 76l15 15" stroke={NAVY} strokeWidth="7" strokeLinecap="round" />
            <path d="M122 48c7-6 16-4 20 3" fill="none" stroke={CREAM} strokeWidth="3" strokeLinecap="round" />
            <Sparkle x={168} y={25} size={6} color={ACCENT} />
          </g>
        )}

        {kind === "references" && (
          <g transform="translate(26 20)">
            <rect x="12" y="12" width="128" height="12" rx="3" fill={SKY} stroke={NAVY} strokeWidth="2" />
            <path d="M18 33h118M18 46h118M18 59h118" stroke={NAVY} strokeWidth="1.6" opacity="0.3" strokeLinecap="round" />
            {[
              [24, 32, 15, 43, YELLOW],
              [44, 32, 15, 43, GREEN],
              [64, 32, 15, 43, SKY],
              [84, 32, 15, 43, RED],
              [104, 32, 15, 43, YELLOW],
            ].map(([x, y, w, h, fill], index) => (
              <rect key={index} x={x} y={y} width={w} height={h} rx="2" fill={fill as string} stroke={NAVY} strokeWidth="1.8" />
            ))}
            <rect x="18" y="66" width="128" height="12" rx="3" fill={SKY} stroke={NAVY} strokeWidth="2" />
            <circle cx="144" cy="19" r="14" fill={GREEN} stroke={NAVY} strokeWidth="2" />
            <path d="M137 19l5 5 8-9" fill="none" stroke={GREEN_INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}

        {kind === "retraction" && (
          <g transform="translate(52 12)">
            <rect x="11" y="4" width="68" height="86" rx="6" fill={CREAM} stroke={NAVY} strokeWidth="2.2" />
            <path d="M25 22h40M25 33h32M25 44h38M25 55h26" stroke={NAVY} strokeWidth="4" opacity="0.16" strokeLinecap="round" />
            <rect x="23" y="64" width="32" height="9" rx="3" fill={SKY} />
            <path d="M73 42c22-8 34 2 32 17-2 15-18 17-31 11" fill="none" stroke={RED_INK} strokeWidth="2.2" strokeLinecap="round" strokeDasharray="3 4" />
            <circle cx="99" cy="75" r="15" fill={RED} stroke={NAVY} strokeWidth="2.2" />
            <path d="M99 67v10M99 82v.5" stroke={RED_INK} strokeWidth="2.6" strokeLinecap="round" />
            <path d="M4 13l8-8 8 8-8 8-8-8Z" fill={YELLOW} stroke={NAVY} strokeWidth="1.8" />
            <Sparkle x={126} y={38} size={6} color={RED_INK} />
          </g>
        )}

        {kind === "discovery" && (
          <g transform="translate(40 18)">
            <circle cx="58" cy="52" r="35" fill={CREAM} stroke={NAVY} strokeWidth="2.2" />
            <circle cx="58" cy="52" r="25" fill={SKY} fillOpacity="0.5" stroke={NAVY} strokeWidth="1.5" />
            <path d="M58 20v12M58 72v12M26 52h12M78 52h12" stroke={NAVY} strokeWidth="2" strokeLinecap="round" />
            <path d="M58 52l18-17" stroke={RED_INK} strokeWidth="2.4" strokeLinecap="round" />
            <path d="M58 52l-14 21" stroke={BLUE} strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="58" cy="52" r="4.5" fill={NAVY} />
            <path d="M86 78l17 17" stroke={NAVY} strokeWidth="7" strokeLinecap="round" />
            <circle cx="111" cy="97" r="17" fill={SKY} stroke={NAVY} strokeWidth="2" />
            <path d="M103 97h16M111 89v16" stroke={BLUE} strokeWidth="2" strokeLinecap="round" />
            <path d="M108 31c13-17 34-21 49-10" fill="none" stroke={NAVY} strokeWidth="1.8" strokeDasharray="3 5" opacity="0.4" />
            <Sparkle x={150} y={12} size={6} color={YELLOW_INK} />
            <Sparkle x={12} y={22} size={5} color={ACCENT} />
          </g>
        )}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Workflow spot illustrations                                         */
/* ------------------------------------------------------------------ */

export type StepKind = "upload" | "extract" | "retrieve" | "report";

export function StepIllustration({ step }: { step: StepKind }) {
  return (
    <svg viewBox="0 0 180 130" className="h-auto w-full" aria-hidden="true">
      <path d="M18 100c-7-24 9-52 36-57 22-4 29-22 55-22 34 0 57 25 56 52-1 30-29 47-74 47-38 0-67-3-73-20Z" fill={SKY} opacity="0.65" />

      {step === "upload" && (
        <g transform="translate(34 13)">
          <rect x="14" y="12" width="92" height="65" rx="7" fill={CREAM} stroke={NAVY} strokeWidth="2.4" />
          <path d="M14 28h92" stroke={NAVY} strokeWidth="2.2" />
          <circle cx="24" cy="20" r="2" fill={RED_INK} />
          <circle cx="31" cy="20" r="2" fill={YELLOW_INK} />
          <circle cx="38" cy="20" r="2" fill={GREEN_INK} />
          <path d="M39 44h42v21H39z" fill={YELLOW} opacity="0.65" />
          <path d="M48 40v24M60 40v24M72 40v24" stroke={NAVY} strokeWidth="1.2" opacity="0.25" />
          <rect x="60" y="68" width="37" height="34" rx="4" fill={CREAM} stroke={NAVY} strokeWidth="2.2" />
          <path d="M69 79h19M69 86h15M69 93h18" stroke={NAVY} strokeWidth="2" opacity="0.25" strokeLinecap="round" />
          <circle cx="121" cy="55" r="16" fill={GREEN} stroke={NAVY} strokeWidth="2.2" />
          <path d="M121 47v17M114 57l7 7 7-7" fill="none" stroke={GREEN_INK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M106 78c8 4 17 5 26 2" fill="none" stroke={NAVY} strokeWidth="1.6" opacity="0.3" />
          <Sparkle x={127} y={27} size={5} color={ACCENT} />
        </g>
      )}

      {step === "extract" && (
        <g transform="translate(37 9)">
          <rect x="20" y="3" width="74" height="102" rx="7" fill={CREAM} stroke={NAVY} strokeWidth="2.4" transform="rotate(-3 57 54)" />
          <path d="M34 24h44M34 34h33" stroke={NAVY} strokeWidth="4" opacity="0.15" strokeLinecap="round" transform="rotate(-3 57 54)" />
          <rect x="32" y="43" width="46" height="11" rx="3" fill={YELLOW} transform="rotate(-3 57 54)" />
          <path d="M34 64h44M34 74h28" stroke={NAVY} strokeWidth="4" opacity="0.15" strokeLinecap="round" transform="rotate(-3 57 54)" />
          <rect x="32" y="83" width="35" height="10" rx="3" fill={GREEN} transform="rotate(-3 57 54)" />
          <path d="M96 46c17-4 30 2 35 15M95 61c13 1 23 6 29 16" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeDasharray="3 4" />
          <path d="M115 26c10 3 17 10 20 20" fill="none" stroke={NAVY} strokeWidth="1.8" strokeDasharray="3 5" opacity="0.35" />
          <circle cx="139" cy="44" r="14" fill={SKY} stroke={NAVY} strokeWidth="2" />
          <path d="M133 44l4 4 7-8" fill="none" stroke={BLUE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <Sparkle x={145} y={84} size={5} color={YELLOW_INK} />
          <path d="M13 81l-8 9M9 74l-11 3" stroke={NAVY} strokeWidth="2" strokeLinecap="round" opacity="0.35" />
        </g>
      )}

      {step === "retrieve" && (
        <g transform="translate(24 20)">
          <path d="M10 19c23-10 49-10 71 0v68c-22-10-48-10-71 0V19Z" fill={CREAM} stroke={NAVY} strokeWidth="2.2" />
          <path d="M142 19c-23-10-49-10-71 0v68c22-10 48-10 71 0V19Z" fill={CREAM} stroke={NAVY} strokeWidth="2.2" />
          <path d="M24 32c14-3 29-3 42 1M24 43c14-3 29-3 42 1M86 33c11-4 23-4 35-1M86 44c11-4 23-4 35-1" stroke={NAVY} strokeWidth="2.2" opacity="0.18" strokeLinecap="round" />
          <circle cx="126" cy="53" r="29" fill={SKY} fillOpacity="0.25" stroke={NAVY} strokeWidth="2.6" />
          <path d="M147 74l19 19" stroke={NAVY} strokeWidth="8" strokeLinecap="round" />
          <path d="M113 44c8-7 19-5 24 3" fill="none" stroke={CREAM} strokeWidth="3" strokeLinecap="round" />
          <rect x="76" y="58" width="32" height="9" rx="3" fill={YELLOW} />
          <path d="M81 79c12 4 23 4 34 0" fill="none" stroke={GREEN_INK} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
          <Sparkle x={158} y={25} size={6} color={ACCENT} />
        </g>
      )}

      {step === "report" && (
        <g transform="translate(44 8)">
          <rect x="11" y="8" width="76" height="106" rx="6" fill={CREAM} stroke={NAVY} strokeWidth="2.4" />
          <rect x="31" y="2" width="36" height="13" rx="4" fill={SKY} stroke={NAVY} strokeWidth="2" />
          <path d="M26 31h47M26 41h31" stroke={NAVY} strokeWidth="3" opacity="0.16" strokeLinecap="round" />
          <path d="M25 84V59M40 84V67M55 84V52M70 84V73" stroke={BLUE} strokeWidth="5" strokeLinecap="round" />
          <path d="M22 91h52" stroke={NAVY} strokeWidth="1.8" opacity="0.3" />
          <circle cx="89" cy="90" r="15" fill={GREEN} stroke={NAVY} strokeWidth="2.2" />
          <path d="M82 90l5 5 8-9" fill="none" stroke={GREEN_INK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M97 31c12-4 20 3 20 14M99 47c9 1 15 5 18 12" fill="none" stroke={NAVY} strokeWidth="1.7" strokeDasharray="3 4" opacity="0.35" />
          <Sparkle x={111} y={67} size={5} color={YELLOW_INK} />
        </g>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Upload, privacy, processing                                         */
/* ------------------------------------------------------------------ */

export function UploadIllustration() {
  return (
    <svg viewBox="0 0 280 190" className="h-auto w-full" aria-hidden="true">
      <path d="M35 148c-11-30 8-63 43-71 27-6 37-30 68-33 42-4 74 26 78 63 4 38-31 63-91 64-47 1-86-2-98-23Z" fill={SKY} />
      <path d="M52 145c8-19 29-26 51-28" fill="none" stroke={NAVY} strokeWidth="1.8" strokeDasharray="3 6" opacity="0.35" />
      <g transform="translate(73 23) rotate(-3 68 68)">
        <rect x="12" y="4" width="88" height="112" rx="7" fill={CREAM} stroke={NAVY} strokeWidth="2.6" />
        <path d="M76 4v25h24" fill={YELLOW} stroke={NAVY} strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M27 38h35M27 50h46M27 62h33" stroke={NAVY} strokeWidth="4" opacity="0.15" strokeLinecap="round" />
        <rect x="25" y="74" width="53" height="12" rx="3" fill={GREEN} />
        <path d="M27 97h41" stroke={NAVY} strokeWidth="4" opacity="0.15" strokeLinecap="round" />
        <circle cx="131" cy="95" r="24" fill={GREEN} stroke={NAVY} strokeWidth="2.6" />
        <path d="M131 83v24M120 95l11 11 11-11" fill="none" stroke={GREEN_INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="translate(200 36)">
        <path d="M0 22C0 10 9 1 21 1s21 9 21 21c0 13-9 22-21 22S0 35 0 22Z" fill={YELLOW} stroke={NAVY} strokeWidth="2.2" />
        <path d="M21 9v19M13 20l8-8 8 8" fill="none" stroke={YELLOW_INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="translate(193 110)">
        <rect x="0" y="0" width="54" height="42" rx="4" fill={CREAM} stroke={NAVY} strokeWidth="2" transform="rotate(9 27 21)" />
        <path d="M11 15h32M11 24h24M11 33h29" stroke={NAVY} strokeWidth="1.8" opacity="0.3" strokeLinecap="round" transform="rotate(9 27 21)" />
      </g>
      <path d="M57 58c-10-4-17-13-19-24" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeDasharray="3 5" opacity="0.6" />
      <Sparkle x={47} y={36} size={6} color={ACCENT} />
      <Sparkle x={236} y={86} size={5} color={YELLOW_INK} />
      <path d="M216 154c12-8 25-8 36 0" fill="none" stroke={GREEN_INK} strokeWidth="2" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

export function PrivacyIllustration() {
  return (
    <svg viewBox="0 0 220 190" className="h-auto w-full" aria-hidden="true">
      <path d="M25 142c-8-28 10-54 39-60 26-6 33-27 59-29 37-4 61 25 60 57-1 35-28 55-79 55-44 0-70-4-79-23Z" fill={GREEN} opacity="0.55" />
      <path d="M110 26l58 22v40c0 36-25 61-58 74-33-13-58-38-58-74V48l58-22Z" fill={CREAM} stroke={NAVY} strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M110 37l47 18v33c0 29-20 50-47 61-27-11-47-32-47-61V55l47-18Z" fill={SKY} fillOpacity="0.45" stroke={NAVY} strokeWidth="1.6" />
      <rect x="91" y="79" width="38" height="30" rx="5" fill={CREAM} stroke={NAVY} strokeWidth="2.4" />
      <path d="M99 79v-8c0-14 22-14 22 0v8" fill="none" stroke={NAVY} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="110" cy="92" r="3.5" fill={NAVY} />
      <path d="M110 96v5" stroke={NAVY} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M43 60c-10-5-15-14-15-25" fill="none" stroke={NAVY} strokeWidth="1.8" strokeDasharray="3 5" opacity="0.35" />
      <path d="M175 86c12-3 19-12 21-22" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeDasharray="3 5" opacity="0.55" />
      <circle cx="179" cy="50" r="9" fill={YELLOW} stroke={NAVY} strokeWidth="2" />
      <path d="M175 50l3 3 5-6" fill="none" stroke={YELLOW_INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <Sparkle x={39} y={93} size={6} color={ACCENT} />
      <Sparkle x={183} y={132} size={5} color={GREEN_INK} />
      <path d="M55 166c22-7 44-7 66 0" fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" opacity="0.25" />
    </svg>
  );
}

export function ProcessingIllustration() {
  return (
    <svg viewBox="0 0 260 150" className="h-auto w-full" aria-hidden="true">
      <path d="M30 116c-9-25 8-49 37-54 22-4 29-20 53-20 36 0 56 22 56 48 0 29-27 43-71 43-36 0-66-2-75-17Z" fill={SKY} opacity="0.7" />
      <g transform="translate(48 15)">
        <rect x="18" y="8" width="70" height="91" rx="6" fill={CREAM} stroke={NAVY} strokeWidth="2.4" transform="rotate(-3 53 53)" />
        <path d="M32 27h38M32 38h29M32 49h40M32 60h24" stroke={NAVY} strokeWidth="3.6" opacity="0.16" strokeLinecap="round" transform="rotate(-3 53 53)" />
        <rect x="30" y="70" width="36" height="10" rx="3" fill={YELLOW} transform="rotate(-3 53 53)" />
        <circle cx="124" cy="55" r="38" fill={SKY} fillOpacity="0.25" stroke={NAVY} strokeWidth="2.6" />
        <path d="M151 82l22 23" stroke={NAVY} strokeWidth="8" strokeLinecap="round" />
        <path d="M107 49c11-13 27-11 34 3" fill="none" stroke={CREAM} strokeWidth="3" strokeLinecap="round" />
        <g fill={BLUE}>
          <circle cx="205" cy="34" r="4">
            <animate attributeName="opacity" values="0.25;1;0.25" dur="1.8s" repeatCount="indefinite" begin="0s" />
          </circle>
          <circle cx="220" cy="51" r="4">
            <animate attributeName="opacity" values="0.25;1;0.25" dur="1.8s" repeatCount="indefinite" begin="0.3s" />
          </circle>
          <circle cx="205" cy="68" r="4">
            <animate attributeName="opacity" values="0.25;1;0.25" dur="1.8s" repeatCount="indefinite" begin="0.6s" />
          </circle>
        </g>
      </g>
      <Sparkle x={37} y={40} size={5} color={ACCENT} />
      <Sparkle x={226} y={115} size={5} color={YELLOW_INK} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Empty states                                                        */
/* ------------------------------------------------------------------ */

export type EmptyKind = "dashboard" | "search" | "library" | "citations" | "assistant" | "reports";

export function EmptyStateIllustration({ kind }: { kind: EmptyKind }) {
  return (
    <svg viewBox="0 0 220 160" className="mx-auto h-auto w-full max-w-[220px]" aria-hidden="true">
      <path d="M31 122c-8-24 8-48 35-53 23-4 30-21 55-21 35 0 56 22 56 47 0 28-27 42-70 42-36 0-68-1-76-15Z" fill={SKY} opacity="0.75" />

      {kind === "dashboard" && (
        <g transform="translate(48 19)">
          <rect x="9" y="13" width="84" height="96" rx="6" fill={CREAM} stroke={NAVY} strokeWidth="2.2" transform="rotate(-4 51 61)" />
          <path d="M23 33h49M23 44h33" stroke={NAVY} strokeWidth="4" opacity="0.16" strokeLinecap="round" transform="rotate(-4 51 61)" />
          <rect x="21" y="54" width="50" height="10" rx="3" fill={YELLOW} transform="rotate(-4 51 61)" />
          <path d="M23 76h45M23 87h29" stroke={NAVY} strokeWidth="4" opacity="0.16" strokeLinecap="round" transform="rotate(-4 51 61)" />
          <path d="M93 109c-3-19 2-32 14-43M107 82c-11-1-18-10-17-20 12 0 20 8 17 20ZM107 84c11-5 15-15 12-25-11 2-16 12-12 25Z" fill={GREEN} stroke={NAVY} strokeWidth="1.8" />
          <rect x="94" y="103" width="27" height="20" rx="3" fill={CREAM} stroke={NAVY} strokeWidth="2" />
          <Sparkle x={27} y={110} size={5} color={ACCENT} />
        </g>
      )}

      {kind === "search" && (
        <g transform="translate(45 26)">
          <rect x="13" y="7" width="76" height="96" rx="6" fill={CREAM} stroke={NAVY} strokeWidth="2.2" transform="rotate(-3 51 55)" />
          <path d="M27 27h46M27 39h30M27 51h41M27 63h21" stroke={NAVY} strokeWidth="4" opacity="0.15" strokeLinecap="round" transform="rotate(-3 51 55)" />
          <circle cx="105" cy="79" r="31" fill={SKY} fillOpacity="0.25" stroke={NAVY} strokeWidth="2.6" />
          <path d="M127 101l17 17" stroke={NAVY} strokeWidth="8" strokeLinecap="round" />
          <path d="M94 71c8-7 18-5 23 2" fill="none" stroke={CREAM} strokeWidth="3" strokeLinecap="round" />
          <path d="M84 28c13-15 30-19 45-9" fill="none" stroke={BLUE} strokeWidth="1.8" strokeDasharray="3 5" opacity="0.5" />
          <Sparkle x={139} y={31} size={6} color={YELLOW_INK} />
          <Sparkle x={3} y={38} size={5} color={ACCENT} />
        </g>
      )}

      {kind === "library" && (
        <g transform="translate(32 26)">
          <rect x="11" y="7" width="136" height="12" rx="3" fill={SKY} stroke={NAVY} strokeWidth="2" />
          <path d="M17 33h126M17 46h126M17 59h126" stroke={NAVY} strokeWidth="1.6" opacity="0.25" strokeLinecap="round" />
          {[
            [23, 32, 15, 40, YELLOW],
            [43, 32, 15, 40, GREEN],
            [63, 32, 15, 40, SKY],
            [83, 32, 15, 40, RED],
            [103, 32, 15, 40, YELLOW],
            [123, 32, 15, 40, GREEN],
          ].map(([x, y, w, h, fill], index) => (
            <rect key={index} x={x} y={y} width={w} height={h} rx="2" fill={fill as string} stroke={NAVY} strokeWidth="1.8" />
          ))}
          <rect x="17" y="72" width="126" height="12" rx="3" fill={SKY} stroke={NAVY} strokeWidth="2" />
          <path d="M111 88v24l9-6 9 6V88" fill={RED} stroke={NAVY} strokeWidth="2" strokeLinejoin="round" />
          <path d="M17 91h84" stroke={NAVY} strokeWidth="1.6" opacity="0.25" strokeLinecap="round" />
          <Sparkle x={145} y={99} size={5} color={ACCENT} />
        </g>
      )}

      {kind === "citations" && (
        <g transform="translate(48 25)">
          <rect x="6" y="13" width="53" height="70" rx="5" fill={CREAM} stroke={NAVY} strokeWidth="2.2" transform="rotate(-6 32 48)" />
          <path d="M18 31h30M18 42h22M18 53h26" stroke={NAVY} strokeWidth="3.6" opacity="0.16" strokeLinecap="round" transform="rotate(-6 32 48)" />
          <rect x="85" y="13" width="53" height="70" rx="5" fill={CREAM} stroke={NAVY} strokeWidth="2.2" transform="rotate(6 111 48)" />
          <path d="M96 31h30M96 42h22M96 53h26" stroke={NAVY} strokeWidth="3.6" opacity="0.16" strokeLinecap="round" transform="rotate(6 111 48)" />
          <path d="M62 43c7-7 12 7 19 0s12 7 19 0" fill="none" stroke={RED_INK} strokeWidth="2.2" strokeLinecap="round" strokeDasharray="4 3" />
          <circle cx="75" cy="91" r="14" fill={YELLOW} stroke={NAVY} strokeWidth="2.2" />
          <path d="M70 86c-2 4-2 8 1 10M80 86c2 4 2 8-1 10" fill="none" stroke={YELLOW_INK} strokeWidth="2" strokeLinecap="round" />
          <Sparkle x={14} y={94} size={5} color={ACCENT} />
        </g>
      )}

      {kind === "assistant" && (
        <g transform="translate(40 26)">
          <path d="M19 12h101c8 0 14 6 14 14v43c0 8-6 14-14 14H73l-24 17 4-17H19c-8 0-14-6-14-14V26c0-8 6-14 14-14Z" fill={CREAM} stroke={NAVY} strokeWidth="2.3" strokeLinejoin="round" />
          <path d="M24 32h72M24 45h89M24 58h52" stroke={NAVY} strokeWidth="3.8" opacity="0.15" strokeLinecap="round" />
          <circle cx="128" cy="74" r="21" fill={SKY} stroke={NAVY} strokeWidth="2.3" />
          <path d="M120 67h17M120 73h13M120 79h16" stroke={BLUE} strokeWidth="2" strokeLinecap="round" />
          <path d="M145 18c8-8 17-9 25-3" fill="none" stroke={GREEN_INK} strokeWidth="2" strokeLinecap="round" opacity="0.55" />
          <Sparkle x={168} y={35} size={5} color={YELLOW_INK} />
        </g>
      )}

      {kind === "reports" && (
        <g transform="translate(52 21)">
          <rect x="16" y="10" width="76" height="106" rx="6" fill={CREAM} stroke={NAVY} strokeWidth="2.3" />
          <rect x="36" y="3" width="36" height="13" rx="4" fill={SKY} stroke={NAVY} strokeWidth="2" />
          <path d="M31 34h46M31 45h30" stroke={NAVY} strokeWidth="3.6" opacity="0.16" strokeLinecap="round" />
          <path d="M29 87V63M44 87V73M59 87V55M74 87V77" stroke={BLUE} strokeWidth="5" strokeLinecap="round" />
          <path d="M25 95h56" stroke={NAVY} strokeWidth="1.8" opacity="0.3" />
          <circle cx="98" cy="94" r="15" fill={GREEN} stroke={NAVY} strokeWidth="2.2" />
          <path d="M91 94l5 5 8-9" fill="none" stroke={GREEN_INK} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <Sparkle x={8} y={35} size={5} color={ACCENT} />
        </g>
      )}
    </svg>
  );
}

export function AlertIllustration() {
  return (
    <svg viewBox="0 0 160 110" className="h-auto w-full" aria-hidden="true">
      <path d="M20 85c-7-20 7-41 30-46 20-4 27-18 48-18 29 0 47 18 47 40 0 24-23 36-60 36-31 0-57-1-65-12Z" fill={RED} opacity="0.7" />
      <g transform="translate(33 17)">
        <rect x="17" y="8" width="58" height="75" rx="5" fill={CREAM} stroke={NAVY} strokeWidth="2.2" transform="rotate(-4 46 45)" />
        <path d="M29 26h33M29 37h24M29 48h30" stroke={NAVY} strokeWidth="3.6" opacity="0.16" strokeLinecap="round" transform="rotate(-4 46 45)" />
        <circle cx="103" cy="34" r="23" fill={YELLOW} stroke={NAVY} strokeWidth="2.4" />
        <path d="M103 22v14M103 44v1.5" stroke={YELLOW_INK} strokeWidth="2.8" strokeLinecap="round" />
        <path d="M92 53c8 4 16 5 24 2" fill="none" stroke={RED_INK} strokeWidth="2" strokeLinecap="round" opacity="0.65" />
        <path d="M76 76c8 4 15 6 22 6" fill="none" stroke={NAVY} strokeWidth="1.6" strokeDasharray="3 5" opacity="0.35" />
        <path d="M12 78l-8 9" stroke={NAVY} strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      </g>
      <Sparkle x={137} y={16} size={5} color={ACCENT} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Footer doodle                                                       */
/* ------------------------------------------------------------------ */

export function FooterDoodle() {
  return (
    <svg viewBox="0 0 260 100" className="h-auto w-full max-w-[260px]" aria-hidden="true">
      <path d="M8 78c44-42 117-57 192-38" fill="none" stroke={NAVY} strokeWidth="1.8" strokeDasharray="3 7" opacity="0.35" />
      <path d="M198 19l42 18-38 21 3-17-7-22Z" fill={SKY} stroke={NAVY} strokeWidth="2" strokeLinejoin="round" />
      <path d="M205 59l-9 22M205 59l14 13" stroke={NAVY} strokeWidth="1.6" opacity="0.4" strokeLinecap="round" />
      <circle cx="29" cy="67" r="8" fill={YELLOW} stroke={NAVY} strokeWidth="2" />
      <circle cx="128" cy="47" r="6" fill={GREEN} stroke={NAVY} strokeWidth="2" />
      <Sparkle x={82} y={28} size={6} color={BLUE} />
      <Sparkle x={172} y={80} size={5} color={YELLOW_INK} />
    </svg>
  );
}
