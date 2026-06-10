'use client';

const ENERGY_COLORS: Record<string, string> = {
  A: '#319a3b', B: '#5fb84f', C: '#a8d04a', D: '#fde64b',
  E: '#fbb33d', F: '#ee732f', G: '#e30613',
};

// Energy class A–G badge (DPE). Dark text on the light/yellow classes.
export function EnergyBadge({ classe, size = 20 }: { classe?: string | null; size?: number }) {
  if (!classe) return <span className="text-slate-300">—</span>;
  const bg = ENERGY_COLORS[classe] ?? '#94a3b8';
  const dark = ['C', 'D', 'E'].includes(classe);
  return (
    <span
      className="inline-flex items-center justify-center rounded font-bold"
      style={{ background: bg, color: dark ? '#1e293b' : '#fff', width: size, height: size, fontSize: size * 0.55 }}
      title={`DPE ${classe}`}
    >
      {classe}
    </span>
  );
}
