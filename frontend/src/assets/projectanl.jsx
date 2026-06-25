import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';

// ─── CONFIG ───
const API_BASE = import.meta.env.VITE_API_BASE;
const PROJECT_CACHE_KEY = 'local_project_data_cache';

// ─── HELPERS ───
const fmt = (n) => {
  if (n == null || isNaN(n)) return '—';
  return n >= 1e7
    ? `₹${(n / 1e7).toFixed(1)}Cr`
    : n >= 1e5
    ? `₹${(n / 1e5).toFixed(1)}L`
    : `₹${(n / 1e3).toFixed(0)}K`;
};

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Light SaaS theme tokens ───
const COLORS = {
  bg:        '#f7f7f8',
  card:      '#ffffff',
  cardAlt:   '#fafafa',
  border:    '#ececec',
  borderSoft:'#f1f1f1',
  grid:      '#eef0f2',
  text:      '#18181b',
  sub:       '#6b7280',
  muted:     '#9ca3af',
};

const PALETTE = {
  expected: '#94a3b8',   // slate (neutral baseline)
  billed:   '#d97706',   // amber
  collected:'#16a34a',   // emerald
  outstanding: '#dc2626',// rose
  accent1: '#d97706',    // amber  (billed)
  accent2: '#16a34a',    // emerald (collected)
  accent3: '#2563eb',    // blue   (trend / billed)
  accent4: '#7c3aed',    // purple (comparison)
};

const PROJECT_COLORS = ['#4f46e5','#0891b2','#7c3aed','#0d9488','#db2777','#ea580c'];

// ─── HOOKS ───
function useProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    // SMART CACHE LOOKUP
    const cachedData = sessionStorage.getItem(PROJECT_CACHE_KEY);
    if (cachedData) {
      setProjects(JSON.parse(cachedData));
      setLoading(false);
      return;
    }

    // Native fetch pipeline implementation directly targeting local port 5000
     fetch(`${API_BASE}/project/all`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        sessionStorage.setItem(PROJECT_CACHE_KEY, JSON.stringify(data));
        setProjects(data);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  return { projects, loading, error };
}

// ─── D3 CHARTS ───

// Grouped Bar Chart
function GroupedBarChart({ data, keys, colors, height = 220 }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!data?.length) return;
    const el = svgRef.current;
    const W = el.clientWidth || 500;
    const H = height;
    const margin = { top: 16, right: 16, bottom: 36, left: 58 };
    const iW = W - margin.left - margin.right;
    const iH = H - margin.top - margin.bottom;

    d3.select(el).selectAll('*').remove();
    const svg = d3.select(el)
      .attr('width', W).attr('height', H)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x0 = d3.scaleBand().domain(data.map(d => d.name)).range([0, iW]).padding(0.28);
    const x1 = d3.scaleBand().domain(keys).range([0, x0.bandwidth()]).padding(0.08);
    const yMax = d3.max(data, d => d3.max(keys, k => d[k])) || 1;
    const y  = d3.scaleLinear().domain([0, yMax * 1.12]).range([iH, 0]);

    svg.append('g').attr('class', 'grid')
      .call(d3.axisLeft(y).tickSize(-iW).tickFormat('').ticks(4))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('line').attr('stroke', COLORS.grid).attr('stroke-dasharray', '3,3'));

    const groups = svg.append('g').selectAll('.group').data(data).join('g')
      .attr('class', 'group')
      .attr('transform', d => `translate(${x0(d.name)},0)`);

    groups.selectAll('rect').data(d => keys.map(k => ({ key: k, value: d[k] || 0 })))
      .join('rect')
      .attr('x', d => x1(d.key))
      .attr('width', x1.bandwidth())
      .attr('y', iH)
      .attr('height', 0)
      .attr('fill', d => colors[keys.indexOf(d.key)])
      .attr('rx', 3)
      .transition().duration(700).delay((_, i) => i * 60)
      .attr('y', d => y(d.value))
      .attr('height', d => iH - y(d.value));

    svg.append('g').attr('transform', `translate(0,${iH})`)
      .call(d3.axisBottom(x0).tickSize(0))
      .call(g => g.select('.domain').attr('stroke', COLORS.border))
      .call(g => g.selectAll('text').attr('fill', COLORS.muted).attr('font-size', 11).attr('dy', 14));

    svg.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(fmt))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('text').attr('fill', COLORS.muted).attr('font-size', 10));
  }, [data, keys, colors, height]);

  return <svg ref={svgRef} style={{ width: '100%', height, display: 'block' }} />;
}

// Area / Line Chart for monthly trend
function TrendAreaChart({ data, height = 200 }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!data?.length) return;
    const el = svgRef.current;
    const W = el.clientWidth || 600;
    const H = height;
    const margin = { top: 16, right: 16, bottom: 36, left: 58 };
    const iW = W - margin.left - margin.right;
    const iH = H - margin.top - margin.bottom;

    d3.select(el).selectAll('*').remove();
    const svg = d3.select(el)
      .attr('width', W).attr('height', H)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const defs = svg.append('defs');
    [['gradAmt', PALETTE.accent3], ['gradPaid', PALETTE.accent2]].forEach(([id, color]) => {
      const g = defs.append('linearGradient').attr('id', id).attr('x1',0).attr('y1',0).attr('x2',0).attr('y2',1);
      g.append('stop').attr('offset','5%').attr('stop-color', color).attr('stop-opacity', 0.22);
      g.append('stop').attr('offset','95%').attr('stop-color', color).attr('stop-opacity', 0);
    });

    const x = d3.scalePoint().domain(data.map(d => d.month)).range([0, iW]).padding(0.2);
    const yMax = d3.max(data, d => Math.max(d.amt, d.paid)) || 1;
    const y = d3.scaleLinear().domain([0, yMax * 1.12]).range([iH, 0]);

    svg.append('g').attr('class','grid')
      .call(d3.axisLeft(y).tickSize(-iW).tickFormat('').ticks(4))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('line').attr('stroke', COLORS.grid).attr('stroke-dasharray','3,3'));

    const areaGen = key => d3.area()
      .x(d => x(d.month))
      .y0(iH).y1(d => y(d[key]))
      .curve(d3.curveMonotoneX);

    const lineGen = key => d3.line()
      .x(d => x(d.month))
      .y(d => y(d[key]))
      .curve(d3.curveMonotoneX);

    [['amt','gradAmt', PALETTE.accent3], ['paid','gradPaid', PALETTE.accent2]].forEach(([key, grad, color]) => {
      svg.append('path').datum(data).attr('fill', `url(#${grad})`).attr('d', areaGen(key));
      const path = svg.append('path').datum(data)
        .attr('fill','none').attr('stroke', color).attr('stroke-width', 2.2)
        .attr('d', lineGen(key));
      const len = path.node().getTotalLength();
      path.attr('stroke-dasharray', len).attr('stroke-dashoffset', len)
        .transition().duration(900).attr('stroke-dashoffset', 0);
    });

    svg.append('g').attr('transform', `translate(0,${iH})`)
      .call(d3.axisBottom(x).tickSize(0))
      .call(g => g.select('.domain').attr('stroke', COLORS.border))
      .call(g => g.selectAll('text').attr('fill', COLORS.muted).attr('font-size',10).attr('dy',14));

    svg.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(fmt))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('text').attr('fill', COLORS.muted).attr('font-size',10));
  }, [data, height]);

  return <svg ref={svgRef} style={{ width:'100%', height, display:'block' }} />;
}

// Donut Chart
function DonutChart({ data, colors, height = 200 }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!data?.length) return;
    const el = svgRef.current;
    const W = el.clientWidth || 220;
    const H = height;
    const r = Math.min(W, H) / 2 - 8;
    const ir = r * 0.58;

    d3.select(el).selectAll('*').remove();
    const svg = d3.select(el).attr('width', W).attr('height', H)
      .append('g').attr('transform', `translate(${W/2},${H/2})`);

    const pie = d3.pie().value(d => d.value).sort(null).padAngle(0.04);
    const arc = d3.arc().innerRadius(ir).outerRadius(r).cornerRadius(4);

    svg.selectAll('path').data(pie(data)).join('path')
      .attr('fill', (_, i) => colors[i % colors.length])
      .attr('stroke', COLORS.card).attr('stroke-width', 2)
      .attr('d', arc)
      .style('opacity', 0)
      .transition().duration(600).delay((_, i) => i * 80)
      .style('opacity', 1);

    const total = d3.sum(data, d => d.value);
    svg.append('text').attr('text-anchor','middle').attr('dy','-0.2em')
      .attr('fill', COLORS.text).attr('font-size', 14).attr('font-weight', 700)
      .text(fmt(total));
    svg.append('text').attr('text-anchor','middle').attr('dy','1.3em')
      .attr('fill', COLORS.muted).attr('font-size', 10)
      .text('Total');
  }, [data, colors, height]);

  return <svg ref={svgRef} style={{ width:'100%', height, display:'block' }} />;
}

// Horizontal Progress Bar
function HBarChart({ data, height = 220 }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!data?.length) return;
    const el = svgRef.current;
    const W = el.clientWidth || 300;
    const H = height;
    const margin = { top: 8, right: 50, bottom: 8, left: 10 };
    const iW = W - margin.left - margin.right;
    const rowH = (H - margin.top - margin.bottom) / data.length;

    d3.select(el).selectAll('*').remove();
    const svg = d3.select(el).attr('width', W).attr('height', H)
      .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    data.forEach((d, i) => {
      const y = i * rowH + rowH * 0.15;
      const bh = rowH * 0.38;

      svg.append('text').attr('x', 0).attr('y', y - 2)
        .attr('fill', COLORS.sub).attr('font-size', 10)
        .text(d.name);

      svg.append('rect').attr('x', 0).attr('y', y + 4)
        .attr('width', iW).attr('height', bh)
        .attr('fill', COLORS.grid).attr('rx', 4);

      svg.append('rect').attr('x', 0).attr('y', y + 4)
        .attr('width', 0).attr('height', bh)
        .attr('fill', PROJECT_COLORS[i % PROJECT_COLORS.length]).attr('rx', 4)
        .transition().duration(700).delay(i * 80)
        .attr('width', iW * (d.value / 100));

      svg.append('text').attr('x', iW + 6).attr('y', y + 4 + bh / 2 + 4)
        .attr('fill', PROJECT_COLORS[i % PROJECT_COLORS.length])
        .attr('font-size', 11).attr('font-weight', 700)
        .text(`${d.value}%`);
    });
  }, [data, height]);

  return <svg ref={svgRef} style={{ width:'100%', height, display:'block' }} />;
}

const StatCard = ({ label, value, sub, color }) => (
  <div style={{
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderTop: `3px solid ${color}`,
    borderRadius: 14,
    padding: '18px 20px',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(16,24,40,0.04)',
  }}>
    <div style={{ position:'absolute', bottom:-20, right:-20, width:70, height:70, borderRadius:'50%', background:`${color}10` }} />
    <p style={{ color: COLORS.muted, fontSize:11, letterSpacing:'0.2px', marginBottom:8, margin:'0 0 8px' }}>{label}</p>
    <p style={{ color: COLORS.text, fontSize:24, fontWeight:700, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.5px', margin:0 }}>{value}</p>
    {sub && <p style={{ color, fontSize:11.5, marginTop:5, margin:'5px 0 0' }}>{sub}</p>}
  </div>
);

const Panel = ({ title, accent = '#4f46e5', children, style = {} }) => (
  <div style={{ background: COLORS.card, border:`1px solid ${COLORS.border}`, borderRadius:16, padding:'20px 18px', boxShadow:'0 1px 3px rgba(16,24,40,0.04)', ...style }}>
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
      <div style={{ width:3, height:18, background:accent, borderRadius:2 }} />
      <h3 style={{ color: COLORS.text, fontSize:13, fontWeight:600, letterSpacing:'-0.1px', margin:0 }}>{title}</h3>
    </div>
    {children}
  </div>
);

const LegendDot = ({ color, label }) => (
  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
    <div style={{ width:8, height:8, borderRadius:'50%', background:color }} />
    <span style={{ color: COLORS.sub, fontSize:11.5 }}>{label}</span>
  </div>
);

const Projectanl = () => {
  const { projects, loading, error } = useProjects();
  const [selected, setSelected] = useState('all');

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background: COLORS.bg, color: COLORS.sub, fontFamily:"'Inter', sans-serif", fontSize:14 }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:32, height:32, border:`2.5px solid ${COLORS.border}`, borderTopColor:'#18181b', borderRadius:'50%', margin:'0 auto 12px', animation:'spin 0.8s linear infinite' }} />
        Loading project data…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background: COLORS.bg, color:'#dc2626', fontFamily:"'Inter', sans-serif", fontSize:14 }}>
      Failed to load: {error}
    </div>
  );

  if (!projects.length) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background: COLORS.bg, color: COLORS.muted, fontFamily:"'Inter', sans-serif" }}>
      No projects found.
    </div>
  );

  const active = selected === 'all' ? projects : projects.filter(p => (p._id || p.id) === selected);

  const totalExpected  = active.reduce((s, p) => s + (p.expectedAmount || 0), 0);
  const totalBilled    = active.reduce((s, p) => s + p.monthlyBreakdowns.reduce((a, b) => a + (b.amt || 0), 0), 0);
  const totalCollected = active.reduce((s, p) => s + p.monthlyBreakdowns.reduce((a, b) => a + (b.paid || 0), 0), 0);
  const totalOutstanding = totalBilled - totalCollected;

  const monthMap = {};
  active.forEach(p => {
    (p.monthlyBreakdowns || []).forEach(b => {
      const key = `${b.month} '${String(b.year).slice(2)}`;
      if (!monthMap[key]) monthMap[key] = { month: key, amt: 0, paid: 0, _sort: b.year * 12 + MONTH_ORDER.indexOf(b.month) };
      monthMap[key].amt  += (b.amt  || 0);
      monthMap[key].paid += (b.paid || 0);
    });
  });
  const trendData = Object.values(monthMap)
    .sort((a, b) => a._sort - b._sort)
    .map(({ _sort, ...d }) => ({ ...d, outstanding: d.amt - d.paid }));

  const barData = projects.map(p => ({
    name: p.projectName.split(' ').slice(0, 2).join(' '),
    Expected:  p.expectedAmount || 0,
    Billed:    p.monthlyBreakdowns.reduce((a, b) => a + (b.amt  || 0), 0),
    Collected: p.monthlyBreakdowns.reduce((a, b) => a + (b.paid || 0), 0),
  }));

  const typeMap = {};
  projects.forEach(p => {
    typeMap[p.projectType] = (typeMap[p.projectType] || 0) + (p.expectedAmount || 0);
  });
  const donutData = Object.entries(typeMap).map(([name, value]) => ({ name, value }));

  const effData = projects.map((p, i) => ({
    name: p.projectName.split(' ').slice(0, 2).join(' '),
    value: pct(
      p.monthlyBreakdowns.reduce((a, b) => a + (b.paid || 0), 0),
      p.monthlyBreakdowns.reduce((a, b) => a + (b.amt  || 0), 0)
    ),
    color: PROJECT_COLORS[i % PROJECT_COLORS.length],
  }));

  return (
    <div style={{
      minHeight: '100vh',
      background: COLORS.bg,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      color: COLORS.text,
      padding: '32px 24px',
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28, flexWrap:'wrap', gap:12 }}>
        <div>
          <p style={{ color: COLORS.muted, fontSize:11, letterSpacing:'0.4px', textTransform:'uppercase', margin:'0 0 6px', fontWeight:500 }}>Project Intelligence</p>
          <h1 style={{ fontSize:24, fontWeight:600, color: COLORS.text, letterSpacing:'-0.5px', margin:0 }}>Revenue Analytics</h1>
        </div>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          style={{ background: COLORS.card, border:`1px solid ${COLORS.border}`, borderRadius:9, color: COLORS.text, padding:'9px 12px', fontSize:13, cursor:'pointer', outline:'none', fontFamily:'inherit' }}
        >
          <option value="all">All Projects</option>
          {projects.map(p => <option key={p._id || p.id} value={p._id || p.id}>{p.projectName}</option>)}
        </select>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14, marginBottom:24 }}>
        <StatCard label="Contract Value"   value={fmt(totalExpected)}   sub={`${active.length} project${active.length !== 1 ? 's' : ''}`} color={PALETTE.accent3} />
        <StatCard label="Total Billed"     value={fmt(totalBilled)}     sub={`${pct(totalBilled, totalExpected)}% of contract`}           color={PALETTE.accent1} />
        <StatCard label="Total Collected"  value={fmt(totalCollected)}  sub={`${pct(totalCollected, totalBilled)}% collection rate`}       color={PALETTE.accent2} />
        <StatCard label="Outstanding"      value={fmt(totalOutstanding)} sub={totalOutstanding > 0 ? 'Pending recovery' : 'Fully cleared'} color={PALETTE.outstanding} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16, marginBottom:16 }}>
        <Panel title="Monthly Revenue Trend" accent={PALETTE.accent3}>
          <div style={{ display:'flex', gap:16, marginBottom:10 }}>
            <LegendDot color={PALETTE.accent3} label="Billed" />
            <LegendDot color={PALETTE.accent2} label="Collected" />
          </div>
          <TrendAreaChart data={trendData} height={200} />
        </Panel>

        <Panel title="By Project Type" accent={PALETTE.accent4}>
          <DonutChart data={donutData} colors={PROJECT_COLORS} height={180} />
          <div style={{ display:'flex', flexDirection:'column', gap:5, marginTop:10 }}>
            {donutData.map((d, i) => (
              <div key={d.name} style={{ display:'flex', justifyContent:'space-between' }}>
                <LegendDot color={PROJECT_COLORS[i % PROJECT_COLORS.length]} label={d.name} />
                <span style={{ color: COLORS.sub, fontSize:11.5, fontVariantNumeric:'tabular-nums' }}>{fmt(d.value)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16, marginBottom:16 }}>
        <Panel title="Project Revenue Comparison" accent={PALETTE.accent4}>
          <div style={{ display:'flex', gap:16, marginBottom:10 }}>
            <LegendDot color={PALETTE.expected}   label="Expected" />
            <LegendDot color={PALETTE.billed}     label="Billed" />
            <LegendDot color={PALETTE.collected}  label="Collected" />
          </div>
          <GroupedBarChart
            data={barData}
            keys={['Expected','Billed','Collected']}
            colors={[PALETTE.expected, PALETTE.billed, PALETTE.collected]}
            height={220}
          />
        </Panel>

        <Panel title="Collection Efficiency" accent={PALETTE.accent2}>
          <HBarChart data={effData} height={Math.max(160, effData.length * 52)} />
        </Panel>
      </div>

      <Panel title="Project Summary" accent={PALETTE.accent4}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
            <thead>
              <tr style={{ borderBottom:`1px solid ${COLORS.border}` }}>
                {['Project','Type','Contract','Billed','Collected','Outstanding','Progress'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'10px 12px', color: COLORS.muted, fontWeight:500, letterSpacing:'0.3px', fontSize:10.5, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map((p, i) => {
                const billed    = p.monthlyBreakdowns.reduce((a, b) => a + (b.amt  || 0), 0);
                const collected = p.monthlyBreakdowns.reduce((a, b) => a + (b.paid || 0), 0);
                const progress  = pct(collected, p.expectedAmount);
                const color     = PROJECT_COLORS[i % PROJECT_COLORS.length];
                const pid       = p._id || p.id;
                return (
                  <tr key={pid}
                    onClick={() => setSelected(selected === pid ? 'all' : pid)}
                    style={{ borderBottom:`1px solid ${COLORS.borderSoft}`, cursor:'pointer', background: selected === pid ? '#f3f4f6' : 'transparent', transition:'background 0.15s' }}
                    onMouseEnter={e => { if (selected !== pid) e.currentTarget.style.background = COLORS.cardAlt; }}
                    onMouseLeave={e => { if (selected !== pid) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ padding:'11px 12px', color: COLORS.text, fontWeight:600 }}>{p.projectName}</td>
                    <td style={{ padding:'11px 12px' }}>
                      <span style={{ background:`${color}18`, color, borderRadius:5, padding:'2px 8px', fontSize:10.5, fontWeight:600 }}>{p.projectType}</span>
                    </td>
                    <td style={{ padding:'11px 12px', color: COLORS.text, fontVariantNumeric:'tabular-nums' }}>{fmt(p.expectedAmount)}</td>
                    <td style={{ padding:'11px 12px', color: PALETTE.billed, fontVariantNumeric:'tabular-nums' }}>{fmt(billed)}</td>
                    <td style={{ padding:'11px 12px', color: PALETTE.collected, fontVariantNumeric:'tabular-nums' }}>{fmt(collected)}</td>
                    <td style={{ padding:'11px 12px', color: PALETTE.outstanding, fontVariantNumeric:'tabular-nums' }}>{fmt(billed - collected)}</td>
                    <td style={{ padding:'11px 12px', minWidth:110 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                        <div style={{ flex:1, height:5, background: COLORS.grid, borderRadius:3, overflow:'hidden' }}>
                          <div style={{ width:`${progress}%`, height:'100%', background:color, borderRadius:3, transition:'width 0.5s' }} />
                        </div>
                        <span style={{ color, fontSize:11, fontWeight:700, minWidth:28, fontVariantNumeric:'tabular-nums' }}>{progress}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ color: COLORS.muted, fontSize:11, marginTop:12 }}>↑ Click a row to filter all charts to that project.</p>
      </Panel>
    </div>
  );
};

export default Projectanl;