'use client';

// Lightweight, dependency-free SVG charts tuned for the editorial theme.

const BRAND = '#0d9488';
const PALETTE = ['#0d9488', '#0ea5e9', '#6366f1', '#f59e0b', '#ef4444', '#84cc16', '#ec4899', '#14b8a6'];

const nf = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arc(cx: number, cy: number, rIn: number, rOut: number, a0: number, a1: number): string {
  const [x0o, y0o] = polar(cx, cy, rOut, a0);
  const [x1o, y1o] = polar(cx, cy, rOut, a1);
  const [x1i, y1i] = polar(cx, cy, rIn, a1);
  const [x0i, y0i] = polar(cx, cy, rIn, a0);
  const large = a1 - a0 <= 180 ? 0 : 1;
  return `M${x0o} ${y0o} A${rOut} ${rOut} 0 ${large} 1 ${x1o} ${y1o} L${x1i} ${y1i} A${rIn} ${rIn} 0 ${large} 0 ${x0i} ${y0i} Z`;
}

/** Area + line chart (e.g. median €/m² by year). */
export function AreaChart({ data, unit = '' }: { data: { label: string; value: number | null }[]; unit?: string }) {
  const pts = data.filter((d) => d.value != null) as { label: string; value: number }[];
  if (pts.length < 2) return <Empty />;
  const W = 520, H = 200, pad = 28;
  const max = Math.max(...pts.map((p) => p.value)) * 1.08;
  const min = Math.min(...pts.map((p) => p.value)) * 0.92;
  const x = (i: number) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(p.value)}`).join(' ');
  const area = `${line} L${x(pts.length - 1)} ${H - pad} L${x(0)} ${H - pad} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BRAND} stopOpacity="0.22" />
          <stop offset="100%" stopColor={BRAND} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#areaFill)" />
      <path d={line} fill="none" stroke={BRAND} strokeWidth={2.5} strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={p.label}>
          <circle cx={x(i)} cy={y(p.value)} r={3} fill="#fff" stroke={BRAND} strokeWidth={2} />
          <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-slate-400" fontSize={10}>{p.label}</text>
        </g>
      ))}
      <text x={pad} y={14} className="fill-slate-400" fontSize={10}>{nf.format(max)}{unit}</text>
    </svg>
  );
}

/** Vertical bars (e.g. sales volume by year, seasonality). */
export function BarChart({ data, color = BRAND }: { data: { label: string; value: number }[]; color?: string }) {
  if (!data.length) return <Empty />;
  const W = 520, H = 200, pad = 28;
  const max = Math.max(...data.map((d) => d.value)) || 1;
  const bw = (W - pad * 2) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {data.map((d, i) => {
        const h = ((d.value / max) * (H - pad * 2));
        const bx = pad + i * bw;
        return (
          <g key={d.label}>
            <rect x={bx + bw * 0.18} y={H - pad - h} width={bw * 0.64} height={h} rx={3} fill={color} opacity={0.85} />
            <text x={bx + bw / 2} y={H - 8} textAnchor="middle" className="fill-slate-400" fontSize={9}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Donut with legend (e.g. sales share by property type). */
export function Donut({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <Empty />;
  const cx = 90, cy = 90, rIn = 48, rOut = 84;
  let a = 0;
  const slices = data.map((d, i) => {
    const a0 = a;
    const a1 = a + (d.value / total) * 360;
    a = a1;
    return { d: arc(cx, cy, rIn, rOut, a0, a1 - 0.6), color: PALETTE[i % PALETTE.length], label: d.label, pct: (d.value / total) * 100 };
  });
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 180 180" className="h-40 w-40 shrink-0">
        {slices.map((s) => <path key={s.label} d={s.d} fill={s.color} />)}
        <text x={cx} y={cy - 2} textAnchor="middle" className="fill-slate-900 font-semibold" fontSize={13}>{nf.format(total)}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="fill-slate-400" fontSize={9}>ventes</text>
      </svg>
      <ul className="space-y-1 text-xs">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-slate-600">{s.label}</span>
            <span className="ml-auto pl-3 tabular-nums font-medium text-slate-800">{s.pct.toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Rose / radial wheel (e.g. departments by sales). Radius ∝ √value. */
export function RadialWheel({ data }: { data: { label: string; value: number }[] }) {
  const items = data.slice(0, 12);
  if (!items.length) return <Empty />;
  const cx = 120, cy = 120, rIn = 22, rMax = 108;
  const max = Math.max(...items.map((d) => d.value)) || 1;
  const step = 360 / items.length;
  return (
    <svg viewBox="0 0 240 240" className="mx-auto w-full max-w-[260px]">
      {items.map((d, i) => {
        const rOut = rIn + Math.sqrt(d.value / max) * (rMax - rIn);
        const a0 = i * step, a1 = a0 + step - 2;
        const [lx, ly] = polar(cx, cy, rOut + 8, a0 + step / 2);
        return (
          <g key={d.label}>
            <path d={arc(cx, cy, rIn, rOut, a0, a1)} fill={PALETTE[i % PALETTE.length]} opacity={0.85} />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-slate-500" fontSize={9}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Mirrored horizontal bars — the "pyramid" (price-band distribution). */
export function Pyramid({ data }: { data: { label: string; value: number }[] }) {
  if (!data.length) return <Empty />;
  const max = Math.max(...data.map((d) => d.value)) || 1;
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const w = (d.value / max) * 50; // each side up to 50%
        return (
          <div key={d.label} className="flex items-center gap-2 text-[11px]">
            <span className="w-20 shrink-0 text-right text-slate-500">{d.label}</span>
            <div className="flex flex-1 items-center justify-center">
              <div className="flex w-1/2 justify-end">
                <div className="h-4 rounded-l" style={{ width: `${w * 2}%`, background: PALETTE[i % PALETTE.length], opacity: 0.85 }} />
              </div>
              <div className="flex w-1/2 justify-start">
                <div className="h-4 rounded-r" style={{ width: `${w * 2}%`, background: PALETTE[i % PALETTE.length], opacity: 0.85 }} />
              </div>
            </div>
            <span className="w-14 shrink-0 tabular-nums text-slate-700">{nf.format(d.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Empty() {
  return <div className="grid h-40 place-items-center text-xs text-slate-300">—</div>;
}
