import React from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

export const ProgressBars = ({ solvedCount, failCount, categories }: { solvedCount: number, failCount: number, categories: {name: string, value: number, color: string}[] }) => {
  const total = solvedCount + failCount;
  const solvedPercent = (solvedCount / total) * 100;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
      <div className="space-y-2">
        <div className="flex h-2 rounded-full overflow-hidden bg-cyber-sidebar/50">
          <div 
            className="bg-green-500 transition-all" 
            style={{ width: `${solvedPercent}%` }}
          />
          <div 
            className="bg-red-500 transition-all" 
            style={{ width: `${100 - solvedPercent}%` }}
          />
        </div>
        <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest">
           <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> Solves ({solvedPercent.toFixed(2)}%)</span>
           <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Fails ({(100 - solvedPercent).toFixed(2)}%)</span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex h-2 rounded-full overflow-hidden bg-cyber-sidebar/50">
          {categories.map((cat, i) => (
            <div 
              key={i}
              className="transition-all" 
              style={{ width: `${cat.value}%`, backgroundColor: cat.color }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold uppercase tracking-widest text-cyber-muted">
           {categories.map((cat, i) => (
             <span key={i} className="flex items-center gap-1.5">
               <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
               {cat.name} ({cat.value.toFixed(2)}%)
             </span>
           ))}
        </div>
      </div>
    </div>
  );
};

export const SolvesTable = ({ solves }: { solves: any[] }) => (
  <div className="mb-12">
    <h3 className="text-xl font-bold text-white mb-6">Solves</h3>
    <div className="overflow-hidden rounded-lg border border-cyber-border bg-cyber-card">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-cyber-sidebar/50 border-b border-cyber-border text-[10px] font-bold text-cyber-muted uppercase tracking-[0.2em]">
            <th className="px-6 py-4">Challenge</th>
            <th className="px-6 py-4">Category</th>
            <th className="px-6 py-4">Value</th>
            {solves.some(s => s.solver) && <th className="px-6 py-4">Solver</th>}
            <th className="px-6 py-4">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cyber-border/50">
          {solves.map((solve, i) => (
            <tr key={i} className="hover:bg-cyber-sidebar/30 transition-colors text-xs">
              <td className="px-6 py-4 text-cyber-neon hover:underline cursor-pointer">{solve.title}</td>
              <td className="px-6 py-4 text-cyber-muted">{solve.category}</td>
              <td className="px-6 py-4 text-white font-bold">{solve.value}</td>
              {solves.some(s => s.solver) && <td className="px-6 py-4 text-cyber-muted">{solve.solver ?? '—'}</td>}
              <td className="px-6 py-4 text-cyber-muted">{solve.time}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export const ScoreChart = ({ data }: { data: any[] }) => (
  <div className="bg-cyber-card border border-cyber-border rounded-lg p-8 h-[400px] shadow-2xl relative mb-12">
    <h3 className="text-[10px] font-bold text-cyber-muted uppercase tracking-[0.2em] mb-8 text-center">Score over Time</h3>
    <ResponsiveContainer width="100%" height="90%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorPoints" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0033cc" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#0033cc" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1d2b3a" vertical={false} />
        <XAxis dataKey="time" hide />
        <YAxis stroke="#4b5563" fontSize={10} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ backgroundColor: '#0d161f', border: '1px solid #1d2b3a', borderRadius: '4px', fontSize: '12px' }}
        />
        <Area 
          type="monotone" 
          dataKey="score" 
          stroke="#0033cc" 
          fillOpacity={1} 
          fill="url(#colorPoints)" 
          strokeWidth={3}
          dot={{ r: 4, fill: '#fff' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);
