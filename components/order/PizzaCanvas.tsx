"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { MenuItem } from "@/lib/types";

/**
 * Holographic pizza that assembles live as the customer picks items.
 * Every layer is deterministic (seeded by item id) so the pizza never
 * re-scatters on re-render, and unknown menu ids fall back to a hashed
 * palette — the menu lives in the DB and can change under us.
 */

const CX = 160;
const CY = 160;

// --- deterministic randomness -------------------------------------------

function seedFrom(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Piece {
  x: number;
  y: number;
  rot: number;
  s: number;
}

function scatter(seedKey: string, count: number, maxR = 84): Piece[] {
  const rand = mulberry32(seedFrom(seedKey));
  return Array.from({ length: count }, () => {
    const angle = rand() * Math.PI * 2;
    const r = 16 + Math.sqrt(rand()) * (maxR - 16);
    return {
      x: CX + Math.cos(angle) * r,
      y: CY + Math.sin(angle) * r,
      rot: rand() * 360,
      s: 0.8 + rand() * 0.5,
    };
  });
}

function blobPath(r: number, seedKey: string, points = 14): string {
  const rand = mulberry32(seedFrom(seedKey));
  const radii = Array.from({ length: points }, () => r * (0.92 + rand() * 0.12));
  const pts = radii.map((radius, i) => {
    const a = (i / points) * Math.PI * 2;
    return [CX + Math.cos(a) * radius, CY + Math.sin(a) * radius];
  });
  let d = "";
  for (let i = 0; i < points; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % points];
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    if (i === 0) d = `M ${mx} ${my} `;
    else d += `Q ${x1} ${y1} ${mx} ${my} `;
  }
  const [qx, qy] = pts[0];
  d += `Q ${qx} ${qy} ${d.split(" ")[1]} ${d.split(" ")[2]} Z`;
  return d;
}

// --- visual vocabularies -------------------------------------------------

type PieceKind =
  | "dot" | "ring" | "strip" | "clove" | "cap"
  | "shred" | "oval" | "leaf" | "arc" | "chunk" | "drizzle";

interface PieceSpec {
  kind: PieceKind;
  color: string;
  color2?: string;
  count: number;
}

interface CrustStyle {
  rim: string;
  rimHi: string;
  surface: string;
  rimWidth: number;
  seeds?: boolean;
  glow?: boolean;
}

const CRUST_FALLBACK: CrustStyle = {
  rim: "#c98a4b", rimHi: "#e8b06b", surface: "#f0c987", rimWidth: 14,
};

const CRUST_STYLES: Record<string, CrustStyle> = {
  B1: { rim: "#d19a5b", rimHi: "#eec287", surface: "#f3d49a", rimWidth: 8 },
  B2: { rim: "#c98a4b", rimHi: "#e8b06b", surface: "#f0c987", rimWidth: 20 },
  B3: { rim: "#9c6b3c", rimHi: "#b98652", surface: "#d3a76a", rimWidth: 14 },
  B4: { rim: "#8a5a34", rimHi: "#a9784a", surface: "#c99b60", rimWidth: 14, seeds: true },
  B5: { rim: "#e8a33d", rimHi: "#ffd166", surface: "#f5c95c", rimWidth: 22, glow: true },
};

interface PizzaStyle {
  sauce: string;
  cheese: string;
  bits: PieceSpec[];
}

const PIZZA_FALLBACK: PizzaStyle = {
  sauce: "#b91c1c",
  cheese: "#f7d060",
  bits: [{ kind: "dot", color: "#e2534b", count: 6 }],
};

const PIZZA_STYLES: Record<string, PizzaStyle> = {
  P1: { sauce: "#c22c26", cheese: "#f9dd7e", bits: [
    { kind: "leaf", color: "#3f9142", count: 5 },
    { kind: "dot", color: "#fffbeb", color2: "#f1e4b8", count: 4 },
  ]},
  P2: { sauce: "#c2410c", cheese: "#f7d060", bits: [
    { kind: "strip", color: "#4ade80", count: 5 },
    { kind: "dot", color: "#facc15", count: 5 },
    { kind: "oval", color: "#ef4444", count: 4 },
  ]},
  P3: { sauce: "#b91c1c", cheese: "#f7d060", bits: [
    { kind: "cap", color: "#e7d6bd", color2: "#b49a76", count: 4 },
    { kind: "strip", color: "#34d399", count: 4 },
    { kind: "arc", color: "#e9c0f5", count: 4 },
  ]},
  P4: { sauce: "#d1490f", cheese: "#f6c453", bits: [
    { kind: "chunk", color: "#fdf3d7", color2: "#e0862e", count: 6 },
    { kind: "strip", color: "#22c55e", count: 3 },
  ]},
  P5: { sauce: "#a3392f", cheese: "#f3e2b3", bits: [
    { kind: "ring", color: "#292524", count: 5 },
    { kind: "chunk", color: "#fafaf0", color2: "#d9d9c7", count: 4 },
  ]},
  P6: { sauce: "#b91c1c", cheese: "#f7d060", bits: [
    { kind: "dot", color: "#d63c35", color2: "#a82722", count: 9 },
  ]},
  P7: { sauce: "#7c3f13", cheese: "#f0c04f", bits: [
    { kind: "chunk", color: "#c98850", color2: "#8f5a2b", count: 6 },
    { kind: "drizzle", color: "#5c2e0d", count: 1 },
  ]},
  P8: { sauce: "#9f1c14", cheese: "#f0b53e", bits: [
    { kind: "chunk", color: "#c22c26", color2: "#8f1812", count: 7 },
  ]},
};

const TOPPING_FALLBACK_COLORS = ["#f472b6", "#60a5fa", "#4ade80", "#facc15", "#fb923c"];

const TOPPING_STYLES: Record<string, PieceSpec> = {
  T1: { kind: "arc", color: "#b45309", count: 8 },
  T2: { kind: "dot", color: "#fbbf24", color2: "#f59e0b", count: 11 },
  T3: { kind: "ring", color: "#1c1917", count: 7 },
  T4: { kind: "strip", color: "#22c55e", count: 7 },
  T5: { kind: "ring", color: "#4ade80", count: 7 },
  T6: { kind: "clove", color: "#fef3c7", color2: "#e7c996", count: 8 },
  T7: { kind: "cap", color: "#e7d6bd", color2: "#a98d68", count: 6 },
  T8: { kind: "drizzle", color: "#ef4444", count: 1 },
  T9: { kind: "shred", color: "#fde047", count: 14 },
  T10: { kind: "oval", color: "#dc2626", color2: "#991b1b", count: 7 },
};

function toppingSpec(id: string): PieceSpec {
  const known = TOPPING_STYLES[id];
  if (known) return known;
  const color = TOPPING_FALLBACK_COLORS[seedFrom(id) % TOPPING_FALLBACK_COLORS.length];
  return { kind: "dot", color, count: 8 };
}

// --- piece renderers ------------------------------------------------------

const DRIZZLE_PATHS = [
  "M 92 118 Q 132 96 168 122 T 232 130",
  "M 88 168 Q 140 148 178 176 T 236 172",
  "M 98 214 Q 146 198 186 222 T 224 210",
];

function PieceShape({ spec, piece }: { spec: PieceSpec; piece: Piece }) {
  const t = `translate(${piece.x} ${piece.y}) rotate(${piece.rot}) scale(${piece.s})`;
  switch (spec.kind) {
    case "dot":
      return (
        <g transform={t}>
          <circle r={5.5} fill={spec.color} stroke={spec.color2 ?? "rgba(0,0,0,0.25)"} strokeWidth={1.2} />
        </g>
      );
    case "ring":
      return (
        <g transform={t}>
          <circle r={6} fill="none" stroke={spec.color} strokeWidth={3} />
        </g>
      );
    case "strip":
      return <rect transform={t} x={-8} y={-2.4} width={16} height={4.8} rx={2.4} fill={spec.color} />;
    case "clove":
      return <ellipse transform={t} rx={4.5} ry={6.2} fill={spec.color} stroke={spec.color2} strokeWidth={1.2} />;
    case "cap":
      return (
        <g transform={t}>
          <circle r={7} fill={spec.color} />
          <path d="M -6 2 A 6.5 6.5 0 0 0 6 2 L 6 4 A 7 3 0 0 1 -6 4 Z" fill={spec.color2 ?? "#a98d68"} />
        </g>
      );
    case "shred":
      return <rect transform={t} x={-6.5} y={-1.4} width={13} height={2.8} rx={1.4} fill={spec.color} opacity={0.95} />;
    case "oval":
      return <ellipse transform={t} rx={6.5} ry={4} fill={spec.color} stroke={spec.color2} strokeWidth={1.2} />;
    case "leaf":
      return (
        <g transform={t}>
          <ellipse rx={7} ry={4} fill={spec.color} />
          <line x1={-6} y1={0} x2={6} y2={0} stroke="rgba(255,255,255,0.35)" strokeWidth={0.8} />
        </g>
      );
    case "arc":
      return <path transform={t} d="M -8 2 Q 0 -7 8 2" fill="none" stroke={spec.color} strokeWidth={3} strokeLinecap="round" />;
    case "chunk":
      return <rect transform={t} x={-5.5} y={-5.5} width={11} height={11} rx={2.5} fill={spec.color} stroke={spec.color2} strokeWidth={1.4} />;
    case "drizzle":
      return null; // rendered separately with path-draw animation
  }
}

function PieceGroup({ seedKey, spec, delayBase = 0 }: { seedKey: string; spec: PieceSpec; delayBase?: number }) {
  if (spec.kind === "drizzle") {
    return (
      <g>
        {DRIZZLE_PATHS.map((d, i) => (
          <motion.path
            key={i}
            d={d}
            fill="none"
            stroke={spec.color}
            strokeWidth={3.4}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.9 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, delay: delayBase + i * 0.18, ease: "easeOut" }}
          />
        ))}
      </g>
    );
  }
  const pieces = scatter(seedKey, spec.count);
  return (
    <g>
      {pieces.map((piece, i) => (
        <motion.g
          key={i}
          initial={{ opacity: 0, scale: 0, y: -34 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0, transition: { duration: 0.18 } }}
          transition={{ type: "spring", stiffness: 420, damping: 22, delay: delayBase + i * 0.035 }}
        >
          <PieceShape spec={spec} piece={piece} />
        </motion.g>
      ))}
    </g>
  );
}

// --- beverages ------------------------------------------------------------

interface CupStyle {
  liquid: string;
  liquidHi: string;
  fizzy: boolean;
}

const CUP_FALLBACK: CupStyle = { liquid: "#f59e0b", liquidHi: "#fbbf24", fizzy: true };

const CUP_STYLES: Record<string, CupStyle> = {
  D1: { liquid: "#3b1f0e", liquidHi: "#6b3a1a", fizzy: true },   // Cola
  D2: { liquid: "#f5f0dc", liquidHi: "#fdfaf0", fizzy: false },  // Masala Chaas
  D3: { liquid: "#bef264", liquidHi: "#d9f99d", fizzy: true },   // Fresh Lime Soda
  D4: { liquid: "#fb923c", liquidHi: "#fdba74", fizzy: true },   // Orange Crush
  D5: { liquid: "#b45309", liquidHi: "#d97706", fizzy: false },  // Iced Tea
  D6: { liquid: "#a16207", liquidHi: "#ca8a04", fizzy: false },  // Cold Coffee
};

function Cup({ id }: { id: string }) {
  const style = CUP_STYLES[id] ?? CUP_FALLBACK;
  const rand = mulberry32(seedFrom(`${id}-fizz`));
  const bubbles = Array.from({ length: 4 }, () => ({
    x: 13 + rand() * 14,
    delay: rand() * 1.4,
    dur: 1.2 + rand() * 0.8,
  }));
  return (
    <svg viewBox="0 0 40 52" className="h-12 w-9 drop-shadow-[0_4px_10px_rgba(255,92,26,0.25)]">
      {/* straw */}
      <rect x="24" y="1" width="4" height="16" rx="2" fill="#ff5c1a" transform="rotate(12 26 8)" />
      {/* glass */}
      <path d="M 7 12 L 11 50 L 29 50 L 33 12 Z" fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" />
      {/* liquid pours in */}
      <motion.g initial={{ clipPath: "inset(100% 0 0 0)" }} animate={{ clipPath: "inset(30% 0 0 0)" }} transition={{ duration: 0.7, ease: "easeOut" }}>
        <path d="M 8 16 L 11.5 48 L 28.5 48 L 32 16 Z" fill={style.liquid} />
        <ellipse cx="20" cy="21" rx="10" ry="2.4" fill={style.liquidHi} />
      </motion.g>
      {/* fizz */}
      {style.fizzy && bubbles.map((b, i) => (
        <motion.circle
          key={i}
          cx={b.x}
          r={1.4}
          fill="rgba(255,255,255,0.8)"
          initial={{ cy: 46, opacity: 0 }}
          animate={{ cy: 24, opacity: [0, 0.9, 0] }}
          transition={{ duration: b.dur, delay: 0.7 + b.delay, repeat: Infinity, ease: "easeOut" }}
        />
      ))}
      {/* ice cube glint for still drinks */}
      {!style.fizzy && (
        <motion.rect
          x="16" y="26" width="7" height="7" rx="1.6"
          fill="rgba(255,255,255,0.35)"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, type: "spring", stiffness: 300, damping: 15 }}
        />
      )}
    </svg>
  );
}

// --- main canvas ----------------------------------------------------------

export default function PizzaCanvas({
  base, pizza, toppings, beverages = [], quantity,
}: {
  base: MenuItem | null;
  pizza: MenuItem | null;
  toppings: MenuItem[];
  beverages?: MenuItem[];
  quantity: number;
}) {
  const crust = base ? (CRUST_STYLES[base.id] ?? CRUST_FALLBACK) : null;
  const style = pizza ? (PIZZA_STYLES[pizza.id] ?? PIZZA_FALLBACK) : null;
  const rimSeeds = base?.id ? scatter(`${base.id}-seeds`, 26, 118).filter((p) => {
    const d = Math.hypot(p.x - CX, p.y - CY);
    return d > 104;
  }) : [];

  return (
    <div className="relative mx-auto w-40 sm:w-56">
      <svg viewBox="0 0 320 320" className="w-full drop-shadow-[0_18px_40px_rgba(255,92,26,0.18)]">
        <defs>
          <radialGradient id="pad-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,92,26,0.22)" />
            <stop offset="70%" stopColor="rgba(255,92,26,0.05)" />
            <stop offset="100%" stopColor="rgba(255,92,26,0)" />
          </radialGradient>
          <radialGradient id="sauce-shade" cx="42%" cy="40%" r="65%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.12)" />
          </radialGradient>
        </defs>

        {/* landing pad */}
        <circle cx={CX} cy={CY} r={150} fill="url(#pad-glow)" />
        <g className="pizza-spin-reverse">
          <circle
            cx={CX} cy={CY} r={140}
            fill="none" stroke="var(--accent)" strokeOpacity={0.28}
            strokeWidth={1.5} strokeDasharray="4 14" strokeLinecap="round"
          />
        </g>
        <circle cx={CX} cy={CY} r={128} fill="none" stroke="white" strokeOpacity={0.06} strokeWidth={1} />

        {/* ghost slot before dough exists */}
        <AnimatePresence>
          {!crust && (
            <motion.g key="ghost" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <circle
                cx={CX} cy={CY} r={110}
                fill="rgba(255,255,255,0.02)"
                stroke="rgba(255,255,255,0.18)" strokeWidth={1.5} strokeDasharray="6 10"
                className="ghost-pulse"
              />
            </motion.g>
          )}
        </AnimatePresence>

        <g className="pizza-spin">
          {/* dough */}
          <AnimatePresence mode="popLayout">
            {crust && base && (
              <motion.g
                key={base.id}
                initial={{ opacity: 0, scale: 0.55 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1, transition: { duration: 0.15 } }}
                transition={{ type: "spring", stiffness: 240, damping: 20 }}
                style={{ transformOrigin: "160px 160px" }}
              >
                {crust.glow && (
                  <circle cx={CX} cy={CY} r={122} fill="none" stroke="#ffd166" strokeWidth={10} strokeOpacity={0.5} className="ghost-pulse" />
                )}
                <circle cx={CX} cy={CY} r={120} fill={crust.rim} />
                <circle cx={CX} cy={CY} r={117} fill={crust.rimHi} />
                <circle cx={CX} cy={CY} r={120 - crust.rimWidth} fill={crust.surface} />
                {crust.seeds && rimSeeds.map((p, i) => (
                  <ellipse key={i} cx={p.x} cy={p.y} rx={2} ry={1.1}
                    transform={`rotate(${p.rot} ${p.x} ${p.y})`} fill="#5c3a1e" opacity={0.8} />
                ))}
              </motion.g>
            )}
          </AnimatePresence>

          {/* sauce + cheese */}
          <AnimatePresence mode="popLayout">
            {crust && style && pizza && (
              <motion.g
                key={pizza.id}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.15 } }}
                transition={{ type: "spring", stiffness: 200, damping: 19 }}
                style={{ transformOrigin: "160px 160px" }}
              >
                <circle cx={CX} cy={CY} r={121 - crust.rimWidth} fill={style.sauce} />
                <path d={blobPath(113 - crust.rimWidth, pizza.id)} fill={style.cheese} />
                <path d={blobPath(113 - crust.rimWidth, pizza.id)} fill="url(#sauce-shade)" />
                {style.bits.map((spec, i) => (
                  <PieceGroup key={i} seedKey={`${pizza.id}-bit-${i}`} spec={spec} delayBase={0.25 + i * 0.1} />
                ))}
              </motion.g>
            )}
          </AnimatePresence>

          {/* toppings rain in one group per selected topping */}
          <AnimatePresence>
            {crust && style && toppings.map((topping) => (
              <motion.g key={topping.id} exit={{ opacity: 0 }}>
                <PieceGroup seedKey={topping.id} spec={toppingSpec(topping.id)} />
              </motion.g>
            ))}
          </AnimatePresence>
        </g>

        {/* steam once the pizza is real */}
        {crust && style && (
          <g>
            {[128, 160, 192].map((x, i) => (
              <motion.path
                key={x}
                d={`M ${x} 96 q 6 -10 0 -20 q -6 -10 0 -20`}
                fill="none" stroke="white" strokeWidth={3} strokeLinecap="round"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.28, 0], y: [-2, -16] }}
                transition={{ duration: 2.6, delay: i * 0.7, repeat: Infinity, ease: "easeInOut" }}
              />
            ))}
          </g>
        )}
      </svg>

      {/* drinks bar — cups slide up beside the pizza */}
      <div className="absolute -left-2 bottom-2 flex items-end gap-1">
        <AnimatePresence>
          {beverages.map((b) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 24, scale: 0.5 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.5 }}
              transition={{ type: "spring", stiffness: 380, damping: 20 }}
              title={b.name}
            >
              <Cup id={b.id} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* quantity hologram badge */}
      <AnimatePresence mode="popLayout">
        {quantity > 1 && (
          <motion.div
            key={quantity}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
            className="absolute -right-1 top-2 rounded-full border border-[var(--accent)]/60 bg-black/70 px-3 py-1 text-sm font-bold text-[var(--accent)] shadow-[0_0_18px_rgba(255,92,26,0.45)] backdrop-blur"
          >
            ×{quantity}
          </motion.div>
        )}
      </AnimatePresence>

      {/* empty-state prompt overlay */}
      {!crust && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="max-w-[10rem] text-center text-sm text-zinc-500">
            Pick a base below — your pizza builds here
          </p>
        </div>
      )}
    </div>
  );
}
