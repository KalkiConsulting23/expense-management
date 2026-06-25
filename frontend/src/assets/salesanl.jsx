import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
const API_BASE = import.meta.env.VITE_API_BASE;

// ── Light SaaS theme tokens ─────────────────────────────────────────────────
const ACCENT  = '#18181b';   // primary (dark) — lines, key figures
const ACCENT2 = '#dc2626';   // red — scatter / highest
const ACCENT3 = '#2563eb';   // blue — bars
const ACCENT4 = '#7c3aed';   // purple — avg
const ACCENT5 = '#16a34a';   // green
const BG      = '#f7f7f8';   // page background
const CARD    = '#ffffff';   // card surface
const BORDER  = '#ececec';   // borders / grid lines
const GRID    = '#f1f1f1';   // lighter grid lines
const TEXT    = '#18181b';   // primary text
const MUTED   = '#9ca3af';   // muted text / axis labels
const SUBTLE  = '#6b7280';   // secondary text
const SALES_CACHE_KEY = 'local_sales_data_cache';

function fmt(n) {
  if (n >= 1e6) return `₹${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${n}`;
}

function RevenueChart({ data }) {
  const ref = useRef();
  useEffect(() => {
    if (!data.length) return;
    const el = ref.current;
    d3.select(el).selectAll('*').remove();
    const W = el.clientWidth, H = 260;
    const m = { top: 20, right: 20, bottom: 40, left: 60 };
    const w = W - m.left - m.right, h = H - m.top - m.bottom;

    const byMonth = d3.rollup(data, v => d3.sum(v, d => d.amount ?? d.totalAmount ?? 0), d => {
      const dt = new Date(d.createdAt ?? d.date ?? d.saleDate);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    });
    const series = Array.from(byMonth, ([k, v]) => ({ month: k, revenue: v })).sort((a, b) => a.month.localeCompare(b.month));

    const x = d3.scalePoint().domain(series.map(d => d.month)).range([0, w]).padding(0.3);
    const y = d3.scaleLinear().domain([0, d3.max(series, d => d.revenue) * 1.15]).range([h, 0]);

    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H);
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

    const defs = svg.append('defs');
    const grad = defs.append('linearGradient').attr('id', 'areaGrad').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
    grad.append('stop').attr('offset', '0%').attr('stop-color', ACCENT3).attr('stop-opacity', 0.18);
    grad.append('stop').attr('offset', '100%').attr('stop-color', ACCENT3).attr('stop-opacity', 0);

    g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat('')).call(a => a.select('.domain').remove()).call(a => a.selectAll('line').attr('stroke', GRID));

    const area = d3.area().x(d => x(d.month)).y0(h).y1(d => y(d.revenue)).curve(d3.curveCatmullRom);
    g.append('path').datum(series).attr('fill', 'url(#areaGrad)').attr('d', area);

    const line = d3.line().x(d => x(d.month)).y(d => y(d.revenue)).curve(d3.curveCatmullRom);
    g.append('path').datum(series).attr('fill', 'none').attr('stroke', ACCENT3).attr('stroke-width', 2.5).attr('d', line);

    const tooltip = d3.select('#rev-tooltip');
    g.selectAll('circle').data(series).join('circle')
      .attr('cx', d => x(d.month)).attr('cy', d => y(d.revenue))
      .attr('r', 5).attr('fill', ACCENT3).attr('stroke', CARD).attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseover', (event, d) => { tooltip.style('opacity', 1).html(`<b>${d.month}</b><br/>${fmt(d.revenue)}`).style('left', `${event.offsetX + 12}px`).style('top', `${event.offsetY - 28}px`); })
      .on('mouseout', () => tooltip.style('opacity', 0));

    g.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(x).tickSize(0)).call(a => a.select('.domain').attr('stroke', BORDER)).call(a => a.selectAll('text').attr('fill', MUTED).attr('dy', '1.4em').style('font-size', '11px'));
    g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(fmt)).call(a => a.select('.domain').remove()).call(a => a.selectAll('text').attr('fill', MUTED).style('font-size', '11px')).call(a => a.selectAll('line').remove());
  }, [data]);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} style={{ width: '100%' }} />
      <div id="rev-tooltip" style={{ position: 'absolute', background: CARD, border: `1px solid ${BORDER}`, boxShadow: '0 4px 16px rgba(16,24,40,0.12)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: TEXT, pointerEvents: 'none', opacity: 0, transition: 'opacity .15s', whiteSpace: 'nowrap' }} />
    </div>
  );
}

function SalesBarChart({ data }) {
  const ref = useRef();
  useEffect(() => {
    if (!data.length) return;
    const el = ref.current;
    d3.select(el).selectAll('*').remove();
    const W = el.clientWidth, H = 260;
    const m = { top: 20, right: 20, bottom: 40, left: 60 };
    const w = W - m.left - m.right, h = H - m.top - m.bottom;

    const byMonth = d3.rollup(data, v => v.length, d => {
      const dt = new Date(d.createdAt ?? d.date ?? d.saleDate);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    });
    const series = Array.from(byMonth, ([k, v]) => ({ month: k, count: v })).sort((a, b) => a.month.localeCompare(b.month));

    const x = d3.scaleBand().domain(series.map(d => d.month)).range([0, w]).padding(0.35);
    const y = d3.scaleLinear().domain([0, d3.max(series, d => d.count) * 1.2]).range([h, 0]);

    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H);
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

    const defs = svg.append('defs');
    const grad = defs.append('linearGradient').attr('id', 'barGrad').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1);
    grad.append('stop').attr('offset', '0%').attr('stop-color', ACCENT3).attr('stop-opacity', 1);
    grad.append('stop').attr('offset', '100%').attr('stop-color', ACCENT3).attr('stop-opacity', 0.45);

    g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat('')).call(a => a.select('.domain').remove()).call(a => a.selectAll('line').attr('stroke', GRID));

    const tooltip = d3.select('#bar-tooltip');
    g.selectAll('rect').data(series).join('rect')
      .attr('x', d => x(d.month)).attr('y', h).attr('width', x.bandwidth()).attr('height', 0).attr('fill', 'url(#barGrad)').attr('rx', 4).style('cursor', 'pointer')
      .on('mouseover', (event, d) => { tooltip.style('opacity', 1).html(`<b>${d.month}</b><br/>${d.count} sales`).style('left', `${event.offsetX + 12}px`).style('top', `${event.offsetY - 28}px`); })
      .on('mouseout', () => tooltip.style('opacity', 0))
      .transition().duration(600).ease(d3.easeCubicOut).attr('y', d => y(d.count)).attr('height', d => h - y(d.count));

    g.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(x).tickSize(0)).call(a => a.select('.domain').attr('stroke', BORDER)).call(a => a.selectAll('text').attr('fill', MUTED).attr('dy', '1.4em').style('font-size', '11px'));
    g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d => d)).call(a => a.select('.domain').remove()).call(a => a.selectAll('text').attr('fill', MUTED).style('font-size', '11px')).call(a => a.selectAll('line').remove());
  }, [data]);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} style={{ width: '100%' }} />
      <div id="bar-tooltip" style={{ position: 'absolute', background: CARD, border: `1px solid ${BORDER}`, boxShadow: '0 4px 16px rgba(16,24,40,0.12)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: TEXT, pointerEvents: 'none', opacity: 0, transition: 'opacity .15s', whiteSpace: 'nowrap' }} />
    </div>
  );
}

function DonutChart({ data }) {
  const ref = useRef();
  useEffect(() => {
    if (!data.length) return;
    const el = ref.current;
    d3.select(el).selectAll('*').remove();
    const size = Math.min(el.clientWidth, 260);
    const r = size / 2, ir = r * 0.55;

    const keyField = ['source', 'status', 'category', 'type', 'paymentMethod'].find(k => data[0]?.[k]);
    if (!keyField) return;

    const byKey = d3.rollup(data, v => d3.sum(v, d => d.amount ?? d.totalAmount ?? 1), d => d[keyField] ?? 'Unknown');
    const entries = Array.from(byKey, ([k, v]) => ({ key: k, value: v })).sort((a, b) => b.value - a.value);

    const colors = [ACCENT3, ACCENT2, ACCENT3, ACCENT4, ACCENT5, '#fb923c'];
    const color = d3.scaleOrdinal().domain(entries.map(d => d.key)).range(colors);

    const svg = d3.select(el).append('svg').attr('width', size).attr('height', size);
    const g = svg.append('g').attr('transform', `translate(${r},${r})`);

    const pie = d3.pie().value(d => d.value).sort(null);
    const arc = d3.arc().innerRadius(ir).outerRadius(r - 4);
    const arcHover = d3.arc().innerRadius(ir).outerRadius(r + 4);
    const tooltip = d3.select('#donut-tooltip');
    const total = d3.sum(entries, d => d.value);

    g.selectAll('path').data(pie(entries)).join('path')
      .attr('fill', d => color(d.data.key)).attr('stroke', CARD).attr('stroke-width', 2).attr('d', arc).style('pointer', 'pointer')
      .on('mouseover', function (event, d) {
        d3.select(this).transition().duration(150).attr('d', arcHover);
        const pct = ((d.data.value / total) * 100).toFixed(1);
        tooltip.style('opacity', 1).html(`<b>${d.data.key}</b><br/>${fmt(d.data.value)}<br/>${pct}%`).style('left', `${event.offsetX + 12}px`).style('top', `${event.offsetY - 36}px`);
      })
      .on('mouseout', function () { d3.select(this).transition().duration(150).attr('d', arc); tooltip.style('opacity', 0); })
      .transition().duration(700).ease(d3.easeCubicOut).attrTween('d', function (d) { const i = d3.interpolate({ startAngle: 0, endAngle: 0 }, d); return t => arc(i(t)) });

    g.append('text').attr('text-anchor', 'middle').attr('dy', '-0.2em').attr('fill', MUTED).style('font-size', '13px').text('Total');
    g.append('text').attr('text-anchor', 'middle').attr('dy', '1.1em').attr('fill', TEXT).style('font-size', '15px').style('font-weight', 700).text(fmt(total));
  }, [data]);

  const keyField = ['source', 'status', 'category', 'type', 'paymentMethod'].find(k => data[0]?.[k]);
  const entries = keyField ? Array.from(d3.rollup(data, v => d3.sum(v, d => d.amount ?? d.totalAmount ?? 1), d => d[keyField] ?? 'Unknown'), ([k, v]) => ({ key: k, value: v })).sort((a, b) => b.value - a.value) : [];
  const colors = [ACCENT3, ACCENT2, ACCENT3, ACCENT4, ACCENT5, '#fb923c'];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative' }}>
        <div ref={ref} style={{ width: 240 }} />
        <div id="donut-tooltip" style={{ position: 'absolute', background: CARD, border: `1px solid ${BORDER}`, boxShadow: '0 4px 16px rgba(16,24,40,0.12)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: TEXT, pointerEvents: 'none', opacity: 0, transition: 'opacity .15s', whiteSpace: 'nowrap' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map((e, i) => (
          <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: colors[i % colors.length], flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: SUBTLE, textTransform: 'capitalize' }}>{e.key}</span>
            <span style={{ fontSize: 12, color: TEXT, marginLeft: 'auto', paddingLeft: 16, fontWeight: 500 }}>{fmt(e.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScatterChart({ data }) {
  const ref = useRef();
  useEffect(() => {
    if (!data.length) return;
    const el = ref.current;
    d3.select(el).selectAll('*').remove();
    const W = el.clientWidth, H = 260;
    const m = { top: 20, right: 20, bottom: 40, left: 60 };
    const w = W - m.left - m.right, h = H - m.top - m.bottom;

    const points = data.map(d => ({ date: new Date(d.createdAt ?? d.date ?? d.saleDate), amount: d.amount ?? d.totalAmount ?? 0 })).filter(d => !isNaN(d.date));
    const x = d3.scaleTime().domain(d3.extent(points, d => d.date)).range([0, w]).nice();
    const y = d3.scaleLinear().domain([0, d3.max(points, d => d.amount) * 1.15]).range([h, 0]);

    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H);
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

    g.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat('')).call(a => a.select('.domain').remove()).call(a => a.selectAll('line').attr('stroke', GRID));

    const tooltip = d3.select('#scatter-tooltip');
    g.selectAll('circle').data(points).join('circle')
      .attr('cx', d => x(d.date)).attr('cy', d => y(d.amount)).attr('r', 0).attr('fill', ACCENT2).attr('opacity', 0.7).attr('stroke', 'none').style('cursor', 'pointer')
      .on('mouseover', (event, d) => { tooltip.style('opacity', 1).html(`<b>${d.date.toLocaleDateString()}</b><br/>${fmt(d.amount)}`).style('left', `${event.offsetX + 12}px`).style('top', `${event.offsetY - 28}px`); })
      .on('mouseout', () => tooltip.style('opacity', 0))
      .transition().duration(500).ease(d3.easeBounceOut).attr('r', 5);

    g.append('g').attr('transform', `translate(0,${h})`).call(d3.axisBottom(x).ticks(5).tickSize(0)).call(a => a.select('.domain').attr('stroke', BORDER)).call(a => a.selectAll('text').attr('fill', MUTED).attr('dy', '1.4em').style('font-size', '11px'));
    g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(fmt)).call(a => a.select('.domain').remove()).call(a => a.selectAll('text').attr('fill', MUTED).style('font-size', '11px')).call(a => a.selectAll('line').remove());
  }, [data]);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} style={{ width: '100%' }} />
      <div id="scatter-tooltip" style={{ position: 'absolute', background: CARD, border: `1px solid ${BORDER}`, boxShadow: '0 4px 16px rgba(16,24,40,0.12)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: TEXT, pointerEvents: 'none', opacity: 0, transition: 'opacity .15s', whiteSpace: 'nowrap' }} />
    </div>
  );
}

function KPI({ label, value, accent, sub }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '18px 22px', flex: 1, minWidth: 140, borderTop: `3px solid ${accent}`, boxShadow: '0 1px 2px rgba(16,24,40,0.03)' }}>
      <div style={{ fontSize: 11, color: MUTED, letterSpacing: '0.2px', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, color: TEXT, letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Chart Card ────────────────────────────────────────────────────────────────
function ChartCard({ title, children }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 3px rgba(16,24,40,0.04)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

const Salesanl = () => {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const cachedData = sessionStorage.getItem(SALES_CACHE_KEY);
    if (cachedData) {
      setSales(JSON.parse(cachedData));
      setLoading(false);
      return;
    }

    // Native fetch pipeline implementation directly targeting local port 5000
      fetch(`${API_BASE}/sales`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { 
        const verifiedData = Array.isArray(d) ? d : [];
        sessionStorage.setItem(SALES_CACHE_KEY, JSON.stringify(verifiedData));
        setSales(verifiedData); 
        setLoading(false); 
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const totalRevenue = d3.sum(sales, d => d.amount ?? d.totalAmount ?? 0);
  const avgSale = sales.length ? totalRevenue / sales.length : 0;
  const maxSale = d3.max(sales, d => d.amount ?? d.totalAmount ?? 0) ?? 0;

  if (loading) return (
    <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: SUBTLE, fontSize: 15, fontFamily: "'Inter', sans-serif", letterSpacing: '0.02em' }}>Loading sales data…</div>
    </div>
  );

  if (error) return (
    <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: ACCENT2, fontSize: 14, fontFamily: "'Inter', sans-serif" }}>Error: {error}</div>
    </div>
  );

  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '32px 24px', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: TEXT }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
          <div style={{ width: 5, height: 26, background: ACCENT, borderRadius: 3 }} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.4px', color: TEXT }}>Sales Analytics</h1>
        </div>
        <p style={{ margin: 0, marginLeft: 15, fontSize: 13, color: SUBTLE }}>{sales.length} records · All time</p>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <KPI label="Total Revenue" value={fmt(totalRevenue)} accent={ACCENT3} sub="All sales combined" />
        <KPI label="Total Sales" value={sales.length} accent={ACCENT5} sub="Records in DB" />
        <KPI label="Avg. Sale" value={fmt(Math.round(avgSale))} accent={ACCENT4} sub="Per transaction" />
        <KPI label="Highest Sale" value={fmt(maxSale)} accent={ACCENT2} sub="Single transaction" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <ChartCard title="📈 Monthly Revenue"><RevenueChart data={sales} /></ChartCard>
        <ChartCard title="📊 Sales Count by Month"><SalesBarChart data={sales} /></ChartCard>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ChartCard title="🔵 Revenue by Category"><DonutChart data={sales} /></ChartCard>
        <ChartCard title="⚡ Sale Amounts Over Time"><ScatterChart data={sales} /></ChartCard>
      </div>
    </div>
  );
};

export default Salesanl;