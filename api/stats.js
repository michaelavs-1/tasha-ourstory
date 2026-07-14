// /api/stats — reads the daily NDJSON event files and returns an aggregation
// for the back-office dashboard. GET /api/stats?days=30
const OWNER = 'michaelavs-1';
const REPO = 'tasha-ourstory';
const BRANCH = 'main';

async function ghRaw(path, token) {
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.raw',
      'User-Agent': 'ourstory-analytics',
    },
  });
  if (r.status !== 200) return null;
  return await r.text();
}

const top = (obj, n = 12) =>
  Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, v }));

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const token = process.env.GH_TOKEN;
  if (!token) return res.status(200).json({ ok: false, reason: 'GH_TOKEN not set' });

  const days = Math.min(Math.max(parseInt(req.query.days || '30', 10) || 30, 1), 90);

  const dayKeys = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    dayKeys.push(d.toISOString().slice(0, 10));
  }

  const files = await Promise.all(dayKeys.map(d => ghRaw(`data/events-${d}.ndjson`, token)));

  const events = [];
  files.forEach(txt => {
    if (!txt) return;
    txt.split('\n').forEach(l => {
      if (!l.trim()) return;
      try { events.push(JSON.parse(l)); } catch (_) {}
    });
  });

  const daily = {};
  dayKeys.forEach(d => (daily[d] = { views: 0, visitors: new Set(), wa: 0, leads: 0 }));

  const visitors = new Set(), sessions = new Set();
  const sessionDur = {};
  const countries = {}, devices = {}, langs = {}, sources = {}, clicks = {}, pages = {};
  let views = 0, waClicks = 0, leads = 0, allClicks = 0;

  events.forEach(e => {
    const d = (e.t || '').slice(0, 10);
    if (e.vid) visitors.add(e.vid);
    if (e.sid) sessions.add(e.sid);

    if (e.type === 'pageview') {
      views++;
      if (daily[d]) { daily[d].views++; if (e.vid) daily[d].visitors.add(e.vid); }
      if (e.country) countries[e.country] = (countries[e.country] || 0) + 1;
      if (e.dev) devices[e.dev] = (devices[e.dev] || 0) + 1;
      if (e.lang) langs[e.lang] = (langs[e.lang] || 0) + 1;
      if (e.path) pages[e.path] = (pages[e.path] || 0) + 1;

      let src = 'ישיר';
      const utm = e.utm || '';
      if (/fbclid|utm_source=fb|facebook|instagram/i.test(utm + ' ' + (e.ref || ''))) src = 'Meta (מודעות)';
      else if (/google/i.test(e.ref || '')) src = 'Google';
      else if (e.ref) { try { src = new URL(e.ref).hostname.replace(/^www\./, ''); } catch (_) { src = e.ref.slice(0, 30); } }
      sources[src] = (sources[src] || 0) + 1;
    }

    if (e.type === 'click') {
      allClicks++;
      const label = (e.text || e.href || '').slice(0, 60);
      if (label) clicks[label] = (clicks[label] || 0) + 1;
    }
    if (e.type === 'whatsapp_click') {
      waClicks++;
      if (daily[d]) daily[d].wa++;
    }
    if (e.type === 'lead') {
      leads++;
      if (daily[d]) daily[d].leads++;
    }
    if (e.type === 'session_end' && e.sid && e.dur > 0) {
      sessionDur[e.sid] = Math.max(sessionDur[e.sid] || 0, Math.min(e.dur, 3600));
    }
  });

  const durs = Object.values(sessionDur);
  const avgDur = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0;

  res.status(200).json({
    ok: true,
    days,
    totals: {
      views,
      visitors: visitors.size,
      sessions: sessions.size,
      avgDuration: avgDur,               // seconds
      clicks: allClicks,
      whatsapp: waClicks,
      leads,
      waRate: views ? +((waClicks / views) * 100).toFixed(1) : 0,
      leadRate: views ? +((leads / views) * 100).toFixed(1) : 0,
    },
    daily: dayKeys.map(d => ({
      day: d,
      views: daily[d].views,
      visitors: daily[d].visitors.size,
      wa: daily[d].wa,
      leads: daily[d].leads,
    })),
    sources: top(sources),
    countries: top(countries),
    devices: top(devices),
    langs: top(langs),
    topClicks: top(clicks, 15),
    pages: top(pages, 8),
    // only the events that matter commercially — not every pageview/exit
    lastEvents: events
      .filter(e => e.type === 'whatsapp_click' || e.type === 'lead')
      .slice(-25).reverse()
      .map(e => ({
        t: e.t, type: e.type, country: e.country, dev: e.dev,
        text: e.text, section: e.section,
      })),
  });
}
