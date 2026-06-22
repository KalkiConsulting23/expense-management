import React, { useEffect, useRef, useState, useMemo } from 'react'
import * as d3 from 'd3'

// ── Theme ─────────────────────────────────────────────────────────────────────
const BG      = '#0b0f1a'
const CARD    = '#111827'
const BORDER  = '#1c2a3a'
const TEXT    = '#e2e8f0'
const MUTED   = '#4a5568'
const A1      = '#38bdf8'  // sky blue
const A2      = '#f472b6'  // pink
const A3      = '#34d399'  // green
const A4      = '#fb923c'  // orange
const A5      = '#a78bfa'  // purple
const COLORS  = [A1, A2, A3, A4, A5, '#facc15', '#f87171', '#2dd4bf']
const CACHE_KEY = 'local_employee_data_cache'
const API_BASE = import.meta.env.VITE_API_BASE

function fmt(n) {
  if (n >= 1e6) return `₹${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`
  return `₹${Math.round(n)}`
}

function NoData() {
  return (
    <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 13, color: MUTED }}>No data for this filter</span>
    </div>
  )
}

function Tooltip({ id, accent = A1 }) {
  return (
    <div id={id} style={{
      position: 'absolute', background: '#0d1525',
      border: `1px solid ${accent}44`, borderRadius: 7,
      padding: '7px 12px', fontSize: 12, color: TEXT,
      pointerEvents: 'none', opacity: 0,
      transition: 'opacity .15s', whiteSpace: 'nowrap',
      boxShadow: `0 0 12px ${accent}22`
    }} />
  )
}

// ── 1. Stacked Bar – monthly expense by expenseType ───────────────────────────
function StackedBar({ data }) {
  const ref = useRef()
  useEffect(() => {
    const el = ref.current
    d3.select(el).selectAll('*').remove()
    if (!data.length) return
    const W = el.clientWidth, H = 270
    const m = { top: 20, right: 20, bottom: 48, left: 64 }
    const w = W - m.left - m.right, h = H - m.top - m.bottom

    // derive month key
    const monthKey = d => {
      const raw = d.date ?? d.startDate ?? d.createdAt
      if (!raw) return 'N/A'
      const dt = new Date(raw)
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    }

    const types = [...new Set(data.map(d => d.expenseType ?? 'Other'))]
    const months = [...new Set(data.map(monthKey))].sort()

    // build matrix
    const matrix = months.map(mo => {
      const row = { month: mo }
      types.forEach(t => { row[t] = 0 })
      data.filter(d => monthKey(d) === mo).forEach(d => {
        row[d.expenseType ?? 'Other'] += d.amount ?? 0
      })
      return row
    })

    const stack = d3.stack().keys(types)(matrix)
    const x = d3.scaleBand().domain(months).range([0, w]).padding(0.3)
    const y = d3.scaleLinear().domain([0, d3.max(stack[stack.length - 1], d => d[1]) * 1.12]).range([h, 0])
    const color = d3.scaleOrdinal().domain(types).range(COLORS)

    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H)
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`)

    g.append('g').call(d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat(''))
      .call(a => a.select('.domain').remove())
      .call(a => a.selectAll('line').attr('stroke', BORDER))

    const tip = d3.select('#sb-tip')
    stack.forEach((layer, li) => {
      g.selectAll(`rect.l${li}`).data(layer).join('rect')
        .attr('class', `l${li}`)
        .attr('x', d => x(d.data.month))
        .attr('width', x.bandwidth())
        .attr('y', h).attr('height', 0)
        .attr('fill', color(layer.key)).attr('rx', li === stack.length - 1 ? 4 : 0)
        .style('cursor', 'pointer')
        .on('mouseover', (ev, d) => {
          tip.style('opacity', 1)
            .html(`<b>${layer.key}</b><br/>${d.data.month}<br/>${fmt(d[1] - d[0])}`)
            .style('left', `${ev.offsetX + 12}px`).style('top', `${ev.offsetY - 36}px`)
        })
        .on('mouseout', () => tip.style('opacity', 0))
        .transition().duration(600).ease(d3.easeCubicOut)
        .attr('y', d => y(d[1])).attr('height', d => y(d[0]) - y(d[1]))
    })

    g.append('g').attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x).tickSize(0))
      .call(a => a.select('.domain').attr('stroke', BORDER))
      .call(a => a.selectAll('text').attr('fill', MUTED).attr('dy', '1.5em').style('font-size', '11px'))

    g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(fmt))
      .call(a => a.select('.domain').remove())
      .call(a => a.selectAll('text').attr('fill', MUTED).style('font-size', '11px'))
      .call(a => a.selectAll('line').remove())

    // legend
    const lg = svg.append('g').attr('transform', `translate(${m.left}, ${H - 14})`)
    types.forEach((t, i) => {
      const gx = lg.append('g').attr('transform', `translate(${i * 110}, 0)`)
      gx.append('rect').attr('width', 9).attr('height', 9).attr('y', -9).attr('rx', 2).attr('fill', color(t))
      gx.append('text').attr('x', 13).attr('fill', MUTED).style('font-size', '11px').text(t)
    })
  }, [data])

  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} style={{ width: '100%' }} />
      {!data.length && <NoData />}
      <Tooltip id="sb-tip" accent={A1} />
    </div>
  )
}

// ── 2. Donut – recurring vs one-time ─────────────────────────────────────────
function TypeDonut({ data }) {
  const ref = useRef()
  useEffect(() => {
    const el = ref.current
    d3.select(el).selectAll('*').remove()
    if (!data.length) return
    const size = Math.min(el.clientWidth, 220)
    const r = size / 2, ir = r * 0.54

    const grouped = d3.rollup(data, v => d3.sum(v, d => d.amount ?? 0), d => d.type ?? 'unknown')
    const entries = Array.from(grouped, ([k, v]) => ({ key: k, value: v }))
    const total = d3.sum(entries, d => d.value)
    const color = d3.scaleOrdinal().domain(entries.map(d => d.key)).range([A1, A2, A3, A4])

    const svg = d3.select(el).append('svg').attr('width', size).attr('height', size)
    const g = svg.append('g').attr('transform', `translate(${r},${r})`)

    const pie = d3.pie().value(d => d.value).sort(null)
    const arc = d3.arc().innerRadius(ir).outerRadius(r - 4)
    const arcH = d3.arc().innerRadius(ir).outerRadius(r + 5)
    const tip = d3.select('#do-tip')

    g.selectAll('path').data(pie(entries)).join('path')
      .attr('fill', d => color(d.data.key)).attr('stroke', BG).attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseover', function (ev, d) {
        d3.select(this).transition().duration(120).attr('d', arcH)
        const pct = ((d.data.value / total) * 100).toFixed(1)
        tip.style('opacity', 1)
          .html(`<b style="text-transform:capitalize">${d.data.key}</b><br/>${fmt(d.data.value)}<br/>${pct}%`)
          .style('left', `${ev.offsetX + 14}px`).style('top', `${ev.offsetY - 36}px`)
      })
      .on('mouseout', function () {
        d3.select(this).transition().duration(120).attr('d', arc)
        tip.style('opacity', 0)
      })
      .transition().duration(700).attrTween('d', function (d) {
        const i = d3.interpolate({ startAngle: 0, endAngle: 0 }, d)
        return t => arc(i(t))
      })

    g.append('text').attr('text-anchor', 'middle').attr('dy', '-0.3em')
      .attr('fill', MUTED).style('font-size', '11px').text('Total')
    g.append('text').attr('text-anchor', 'middle').attr('dy', '1em')
      .attr('fill', A1).style('font-size', '14px').style('font-weight', 700).text(fmt(total))
  }, [data])

  const legendEntries = useMemo(() => {
    if (!data.length) return []
    const grouped = d3.rollup(data, v => d3.sum(v, d => d.amount ?? 0), d => d.type ?? 'unknown')
    return Array.from(grouped, ([k, v]) => ({ key: k, value: v }))
  }, [data])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative' }}>
        <div ref={ref} style={{ width: 220 }} />
        <Tooltip id="do-tip" accent={A2} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {legendEntries.length === 0
          ? <span style={{ fontSize: 12, color: MUTED }}>No data</span>
          : legendEntries.map((e, i) => (
            <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: MUTED, textTransform: 'capitalize' }}>{e.key}</span>
              <span style={{ fontSize: 12, color: TEXT, marginLeft: 'auto', paddingLeft: 20 }}>{fmt(e.value)}</span>
            </div>
          ))
        }
      </div>
    </div>
  )
}

// ── 3. Horizontal Bar – top expense names ────────────────────────────────────
function TopExpenses({ data }) {
  const ref = useRef()
  useEffect(() => {
    const el = ref.current
    d3.select(el).selectAll('*').remove()
    if (!data.length) return

    const byName = d3.rollup(data, v => d3.sum(v, d => d.amount ?? 0), d => d.expenseName ?? 'Unnamed')
    const entries = Array.from(byName, ([k, v]) => ({ name: k, value: v }))
      .sort((a, b) => b.value - a.value).slice(0, 8)

    const W = el.clientWidth, H = entries.length * 38 + 40
    const m = { top: 10, right: 80, bottom: 20, left: 130 }
    const w = W - m.left - m.right, h = H - m.top - m.bottom

    const x = d3.scaleLinear().domain([0, entries[0].value * 1.1]).range([0, w])
    const y = d3.scaleBand().domain(entries.map(d => d.name)).range([0, h]).padding(0.28)

    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H)
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`)

    const defs = svg.append('defs')
    entries.forEach((e, i) => {
      const grad = defs.append('linearGradient').attr('id', `hg${i}`).attr('x1', 0).attr('y1', 0).attr('x2', 1).attr('y2', 0)
      grad.append('stop').attr('offset', '0%').attr('stop-color', COLORS[i % COLORS.length]).attr('stop-opacity', 0.9)
      grad.append('stop').attr('offset', '100%').attr('stop-color', COLORS[i % COLORS.length]).attr('stop-opacity', 0.3)
    })

    const tip = d3.select('#hb-tip')
    g.selectAll('rect').data(entries).join('rect')
      .attr('y', d => y(d.name)).attr('height', y.bandwidth())
      .attr('x', 0).attr('width', 0)
      .attr('fill', (_, i) => `url(#hg${i})`).attr('rx', 4)
      .style('cursor', 'pointer')
      .on('mouseover', (ev, d) => {
        tip.style('opacity', 1).html(`<b>${d.name}</b><br/>${fmt(d.value)}`)
          .style('left', `${ev.offsetX + 12}px`).style('top', `${ev.offsetY - 28}px`)
      })
      .on('mouseout', () => tip.style('opacity', 0))
      .transition().duration(700).ease(d3.easeCubicOut).attr('width', d => x(d.value))

    // value labels
    g.selectAll('text.val').data(entries).join('text')
      .attr('class', 'val')
      .attr('y', d => y(d.name) + y.bandwidth() / 2 + 4)
      .attr('x', d => x(d.value) + 6)
      .attr('fill', MUTED).style('font-size', '11px').text(d => fmt(d.value))

    g.append('g').call(d3.axisLeft(y).tickSize(0))
      .call(a => a.select('.domain').remove())
      .call(a => a.selectAll('text').attr('fill', TEXT).style('font-size', '11px'))

    g.append('g').attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(4).tickFormat(fmt).tickSize(0))
      .call(a => a.select('.domain').attr('stroke', BORDER))
      .call(a => a.selectAll('text').attr('fill', MUTED).style('font-size', '10px'))
  }, [data])

  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} style={{ width: '100%' }} />
      {!data.length && <NoData />}
      <Tooltip id="hb-tip" accent={A3} />
    </div>
  )
}

// ── 4. Line Chart – cumulative expense over time ──────────────────────────────
function CumulativeLine({ data }) {
  const ref = useRef()
  useEffect(() => {
    const el = ref.current
    d3.select(el).selectAll('*').remove()
    if (!data.length) return
    const W = el.clientWidth, H = 260
    const m = { top: 20, right: 20, bottom: 40, left: 64 }
    const w = W - m.left - m.right, h = H - m.top - m.bottom

    const points = data
      .map(d => ({ date: new Date(d.date ?? d.startDate ?? d.createdAt), amount: d.amount ?? 0 }))
      .filter(d => !isNaN(d.date)).sort((a, b) => a.date - b.date)

    let cum = 0
    const series = points.map(d => ({ date: d.date, cumulative: (cum += d.amount) }))

    const x = d3.scaleTime().domain(d3.extent(series, d => d.date)).range([0, w]).nice()
    const y = d3.scaleLinear().domain([0, d3.max(series, d => d.cumulative) * 1.1 || 1]).range([h, 0])

    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H)
    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`)

    const defs = svg.append('defs')
    const grad = defs.append('linearGradient').attr('id', 'clGrad').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 1)
    grad.append('stop').attr('offset', '0%').attr('stop-color', A3).attr('stop-opacity', 0.3)
    grad.append('stop').attr('offset', '100%').attr('stop-color', A3).attr('stop-opacity', 0)

    g.append('g').call(d3.axisLeft(y).ticks(5).tickSize(-w).tickFormat(''))
      .call(a => a.select('.domain').remove())
      .call(a => a.selectAll('line').attr('stroke', BORDER))

    const area = d3.area().x(d => x(d.date)).y0(h).y1(d => y(d.cumulative)).curve(d3.curveCatmullRom)
    const line = d3.line().x(d => x(d.date)).y(d => y(d.cumulative)).curve(d3.curveCatmullRom)

    g.append('path').datum(series).attr('fill', 'url(#clGrad)').attr('d', area)
    g.append('path').datum(series).attr('fill', 'none').attr('stroke', A3).attr('stroke-width', 2.5).attr('d', line)

    const tip = d3.select('#cl-tip')
    g.selectAll('circle').data(series).join('circle')
      .attr('cx', d => x(d.date)).attr('cy', d => y(d.cumulative))
      .attr('r', 4).attr('fill', A3).attr('stroke', BG).attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseover', (ev, d) => {
        tip.style('opacity', 1)
          .html(`<b>${d.date.toLocaleDateString()}</b><br/>Cumulative: ${fmt(d.cumulative)}`)
          .style('left', `${ev.offsetX + 12}px`).style('top', `${ev.offsetY - 36}px`)
      })
      .on('mouseout', () => tip.style('opacity', 0))

    g.append('g').attr('transform', `translate(0,${h})`)
      .call(d3.axisBottom(x).ticks(5).tickSize(0))
      .call(a => a.select('.domain').attr('stroke', BORDER))
      .call(a => a.selectAll('text').attr('fill', MUTED).attr('dy', '1.4em').style('font-size', '11px'))

    g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(fmt))
      .call(a => a.select('.domain').remove())
      .call(a => a.selectAll('text').attr('fill', MUTED).style('font-size', '11px'))
      .call(a => a.selectAll('line').remove())
  }, [data])

  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} style={{ width: '100%' }} />
      {!data.length && <NoData />}
      <Tooltip id="cl-tip" accent={A3} />
    </div>
  )
}

// ── 5. Payment Status Heat-map (month × type) ─────────────────────────────────
function PaymentHeatmap({ data }) {
  const ref = useRef()
  useEffect(() => {
    const el = ref.current
    d3.select(el).selectAll('*').remove()
    if (!data.length) return

    const types = [...new Set(data.map(d => d.expenseType ?? 'Other'))]
    const monthKey = d => {
      const raw = d.date ?? d.startDate ?? d.createdAt
      if (!raw) return 'N/A'
      const dt = new Date(raw)
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    }
    const months = [...new Set(data.map(monthKey))].sort()

    const cell = 36, pad = { top: 20, right: 20, bottom: 60, left: 110 }
    const W = Math.max(el.clientWidth, months.length * cell + pad.left + pad.right)
    const H = types.length * cell + pad.top + pad.bottom

    const matrix = []
    months.forEach(mo => {
      types.forEach(ty => {
        const val = d3.sum(data.filter(d => monthKey(d) === mo && (d.expenseType ?? 'Other') === ty), d => d.amount ?? 0)
        matrix.push({ month: mo, type: ty, value: val })
      })
    })

    const maxVal = d3.max(matrix, d => d.value) || 1
    const colorScale = d3.scaleSequential(d3.interpolateBlues).domain([0, maxVal])

    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H)
    const g = svg.append('g').attr('transform', `translate(${pad.left},${pad.top})`)

    const x = d3.scaleBand().domain(months).range([0, months.length * cell]).padding(0.05)
    const y = d3.scaleBand().domain(types).range([0, types.length * cell]).padding(0.05)

    const tip = d3.select('#hm-tip')
    g.selectAll('rect').data(matrix).join('rect')
      .attr('x', d => x(d.month)).attr('y', d => y(d.type))
      .attr('width', x.bandwidth()).attr('height', y.bandwidth())
      .attr('fill', d => d.value ? colorScale(d.value) : BORDER).attr('rx', 3)
      .style('cursor', 'pointer')
      .on('mouseover', (ev, d) => {
        tip.style('opacity', 1)
          .html(`<b>${d.type}</b><br/>${d.month}<br/>${fmt(d.value)}`)
          .style('left', `${ev.offsetX + 12}px`).style('top', `${ev.offsetY - 36}px`)
      })
      .on('mouseout', () => tip.style('opacity', 0))

    g.append('g').attr('transform', `translate(0,${types.length * cell})`)
      .call(d3.axisBottom(x).tickSize(0))
      .call(a => a.select('.domain').remove())
      .call(a => a.selectAll('text').attr('fill', MUTED).attr('dy', '1.4em')
        .style('font-size', '11px').attr('transform', 'rotate(-30)').style('text-anchor', 'end'))

    g.append('g').call(d3.axisLeft(y).tickSize(0))
      .call(a => a.select('.domain').remove())
      .call(a => a.selectAll('text').attr('fill', TEXT).style('font-size', '11px'))
  }, [data])

  return (
    <div style={{ position: 'relative', overflowX: 'auto' }}>
      <div ref={ref} style={{ width: '100%' }} />
      {!data.length && <NoData />}
      <Tooltip id="hm-tip" accent={A5} />
    </div>
  )
}

function KPI({ label, value, accent, sub }) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
      padding: '20px 24px', flex: 1, minWidth: 140,
      borderTop: `3px solid ${accent}`
    }}>
      <div style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent, fontFamily: 'monospace' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function ChartCard({ title, children }) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
      padding: '20px 24px'
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 16, letterSpacing: '0.04em' }}>{title}</div>
      {children}
    </div>
  )
}

function CategoryDropdown({ categories, selected, onSelect }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', userSelect: 'none' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', borderRadius: 10,
          border: `1px solid ${selected ? A2 : BORDER}`,
          background: selected ? `${A2}15` : CARD,
          color: selected ? A2 : TEXT,
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
          transition: 'all .2s', whiteSpace: 'nowrap',
          boxShadow: open ? `0 0 0 2px ${A2}33` : 'none'
        }}
      >
        <span style={{ fontSize: 15 }}>🗂</span>
        {selected ? selected : 'View by Category'}
        <span style={{
          display: 'inline-block', marginLeft: 2,
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform .2s', fontSize: 11, opacity: 0.7
        }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          background: '#0d1525', border: `1px solid ${BORDER}`,
          borderRadius: 12, overflow: 'hidden', zIndex: 999,
          minWidth: 200,
          boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
          animation: 'dropIn .15s ease'
        }}>
          <div
            onClick={() => { onSelect(null); setOpen(false) }}
            style={{
              padding: '10px 16px', fontSize: 13, cursor: 'pointer',
              color: !selected ? A1 : MUTED,
              background: !selected ? `${A1}10` : 'transparent',
              borderBottom: `1px solid ${BORDER}`,
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'background .15s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = `${A1}12`}
            onMouseLeave={e => e.currentTarget.style.background = !selected ? `${A1}10` : 'transparent'}
          >
            <span>🌐</span> All Categories
          </div>

          {categories.map((cat, i) => (
            <div
              key={cat}
              onClick={() => { onSelect(cat); setOpen(false) }}
              style={{
                padding: '10px 16px', fontSize: 13, cursor: 'pointer',
                color: selected === cat ? COLORS[i % COLORS.length] : TEXT,
                background: selected === cat ? `${COLORS[i % COLORS.length]}12` : 'transparent',
                display: 'flex', alignItems: 'center', gap: 10,
                transition: 'background .15s',
                borderBottom: i < categories.length - 1 ? `1px solid ${BORDER}22` : 'none'
              }}
              onMouseEnter={e => e.currentTarget.style.background = `${COLORS[i % COLORS.length]}12`}
              onMouseLeave={e => e.currentTarget.style.background = selected === cat ? `${COLORS[i % COLORS.length]}12` : 'transparent'}
            >
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: COLORS[i % COLORS.length], flexShrink: 0
              }} />
              {cat}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CategoryDrilldown({ data, category, accentColor }) {
  const catData = data.filter(d => (d.expenseType ?? 'Other') === category)

  const total     = d3.sum(catData, d => d.amount ?? 0)
  const avg       = catData.length ? total / catData.length : 0
  const max       = d3.max(catData, d => d.amount ?? 0) ?? 0
  const recurring = catData.filter(d => d.type === 'recurring').length
  const oneTime   = catData.filter(d => d.type === 'one-time').length

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <KPI label="Category Total"  value={fmt(total)}               accent={accentColor} sub={`All ${category} expenses`} />
        <KPI label="Records"         value={catData.length}          accent={A3}          sub="In this category" />
        <KPI label="Average"         value={fmt(Math.round(avg))}    accent={A5}          sub="Per entry" />
        <KPI label="Highest"         value={fmt(max)}                accent={A2}          sub="Single entry" />
        <KPI label="Recurring"       value={recurring}               accent={A4}          sub="Recurring entries" />
        <KPI label="One-time"        value={oneTime}                 accent={A1}          sub="One-time entries" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <ChartCard title={`📈 ${category} — Monthly Trend`}>
          <CumulativeLine data={catData} />
        </ChartCard>
        <ChartCard title={`🍩 ${category} — Recurring vs One-time`}>
          <TypeDonut data={catData} />
        </ChartCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <ChartCard title={`🏆 ${category} — Top Expense Names`}>
          <TopExpenses data={catData} />
        </ChartCard>
        <ChartCard title={`📋 ${category} — All Entries`}>
          <ExpenseTable data={catData} accent={accentColor} />
        </ChartCard>
      </div>
    </div>
  )
}

function ExpenseTable({ data, accent }) {
  const sorted = [...data].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
  return (
    <div style={{ maxHeight: 280, overflowY: 'auto', fontSize: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
            {['Name', 'Type', 'Amount', 'Date'].map(h => (
              <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: MUTED, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((d, i) => {
            const raw = d.date ?? d.startDate ?? d.createdAt
            const dateStr = raw ? new Date(raw).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
            return (
              <tr key={d._id ?? i} style={{ borderBottom: `1px solid ${BORDER}22` }}
                onMouseEnter={e => e.currentTarget.style.background = `${accent}08`}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '8px 10px', color: TEXT }}>{d.expenseName ?? '—'}</td>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                    background: d.type === 'recurring' ? `${A4}20` : `${A1}20`,
                    color: d.type === 'recurring' ? A4 : A1,
                    textTransform: 'capitalize'
                  }}>{d.type ?? '—'}</span>
                </td>
                <td style={{ padding: '8px 10px', color: accent, fontWeight: 700, fontFamily: 'monospace' }}>{fmt(d.amount ?? 0)}</td>
                <td style={{ padding: '8px 10px', color: MUTED }}>{dateStr}</td>
              </tr>
            )
          })}
          {!sorted.length && (
            <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: MUTED }}>No entries</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

const Expenseanl = () => {
  const [expenses, setExpenses]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [filter, setFilter]           = useState('all')
  const [activeCategory, setCategory] = useState(null)

  useEffect(() => {
    const cachedData = sessionStorage.getItem(CACHE_KEY)
    if (cachedData) {
      const parsed = JSON.parse(cachedData)
      setExpenses(Array.isArray(parsed) ? parsed : [])
      setLoading(false)
      return
    }

    // Rewritten with native JavaScript fetch instead of custom useApi hook wrappers
    fetch(`${API_BASE}/employee/all`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => { 
        const verifiedData = Array.isArray(d) ? d : []
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(verifiedData))
        setExpenses(verifiedData)
        setLoading(false) 
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const allCategories = useMemo(() =>
    [...new Set(expenses.map(e => e.expenseType ?? 'Other'))].sort()
  , [expenses])

  const filtered = filter === 'all' ? expenses : expenses.filter(e => e.type === filter)

  const totalAmount = d3.sum(filtered, d => d.amount ?? 0)
  const avgAmount   = filtered.length ? totalAmount / filtered.length : 0
  const maxAmount   = d3.max(filtered, d => d.amount ?? 0) ?? 0
  const recurring   = filtered.filter(d => d.type === 'recurring').length
  const oneTime     = filtered.filter(d => d.type === 'one-time').length

  const catAccent   = activeCategory
    ? COLORS[allCategories.indexOf(activeCategory) % COLORS.length]
    : A1

  if (loading) return (
    <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: A1, fontSize: 14, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
        Fetching expense records…
      </div>
    </div>
  )

  if (error) return (
    <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: A2, fontSize: 14, fontFamily: 'monospace' }}>Error: {error}</div>
    </div>
  )

  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '32px 24px', fontFamily: "'DM Sans','Segoe UI',sans-serif", color: TEXT }}>
      <style>{`@keyframes dropIn { from { opacity:0; transform:translateY(-6px) } to { opacity:1; transform:translateY(0) } }`}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 6, height: 28, background: activeCategory ? catAccent : A1, borderRadius: 3, transition: 'background .3s' }} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
              {activeCategory ? `${activeCategory} Expenses` : 'Expense Analytics'}
            </h1>
          </div>
          <p style={{ margin: 0, marginLeft: 16, fontSize: 13, color: MUTED }}>
            {activeCategory
              ? `${filtered.filter(d => (d.expenseType ?? 'Other') === activeCategory).length} records · ${activeCategory} category`
              : `${filtered.length} records · All time`}
          </p>
        </div>

        <CategoryDropdown
          categories={allCategories}
          selected={activeCategory}
          onSelect={cat => setCategory(cat)}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {['all', 'recurring', 'one-time'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 16px', borderRadius: 20,
            border: `1px solid ${filter === f ? A1 : BORDER}`,
            background: filter === f ? `${A1}18` : 'transparent',
            color: filter === f ? A1 : MUTED,
            fontSize: 12, cursor: 'pointer',
            fontWeight: filter === f ? 600 : 400,
            textTransform: 'capitalize', transition: 'all .2s'
          }}>{f}</button>
        ))}
      </div>

      {activeCategory ? (
        <CategoryDrilldown
          data={filtered}
          category={activeCategory}
          accentColor={catAccent}
        />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
            <KPI label="Total Expenses"  value={fmt(totalAmount)}           accent={A1} sub="All records combined" />
            <KPI label="Total Records"   value={filtered.length}            accent={A3} sub="In database" />
            <KPI label="Average Expense" value={fmt(Math.round(avgAmount))} accent={A5} sub="Per record" />
            <KPI label="Highest Expense" value={fmt(maxAmount)}             accent={A2} sub="Single entry" />
            <KPI label="Recurring"       value={recurring}                  accent={A4} sub="Active recurring" />
            <KPI label="One-time"        value={oneTime}                    accent={A3} sub="Single payments" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <ChartCard title="📊 Monthly Expenses by Type (Stacked)">
              <StackedBar data={filtered} />
            </ChartCard>
            <ChartCard title="🍩 Recurring vs One-time Breakdown">
              <TypeDonut data={filtered} />
            </ChartCard>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <ChartCard title="📈 Cumulative Expense Over Time">
              <CumulativeLine data={filtered} />
            </ChartCard>
            <ChartCard title="🏆 Top Expense Names">
              <TopExpenses data={filtered} />
            </ChartCard>
          </div>

          <ChartCard title="🌡️ Expense Heatmap — Month × Category">
            <PaymentHeatmap data={filtered} />
          </ChartCard>
        </>
      )}
    </div>
  )
}

export default Expenseanl