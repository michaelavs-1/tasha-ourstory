// /api/track — collects site analytics events and appends them to a daily
// NDJSON file inside the GitHub repo. No third-party analytics service.
const OWNER = 'michaelavs-1';
const REPO = 'tasha-ourstory';
const BRANCH = 'main';

function b64encode(s) { return Buffer.from(s, 'utf8').toString('base64'); }
function b64decode(s) { return Buffer.from(s, 'base64').toString('utf8'); }

async function gh(path, token, opts = {}) {
  return fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ourstory-analytics',
      ...(opts.headers || {}),
    },
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const token = process.env.GH_TOKEN;
  if (!token) return res.status(200).json({ ok: false, reason: 'GH_TOKEN not set' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  if (!body || !body.type) return res.status(200).json({ ok: false, reason: 'no event' });

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const ipHeader = req.headers['x-forwarded-for'] || '';

  const evt = {
    t: now.toISOString(),
    type: String(body.type).slice(0, 40),
    sid: String(body.sid || '').slice(0, 40),          // session id (anonymous)
    vid: String(body.vid || '').slice(0, 40),          // visitor id (anonymous)
    path: String(body.path || '').slice(0, 120),
    lang: String(body.lang || '').slice(0, 10),
    ref: String(body.ref || '').slice(0, 200),         // referrer
    utm: String(body.utm || '').slice(0, 200),         // utm/fbclid params
    text: String(body.text || '').slice(0, 90),        // clicked element text
    section: String(body.section || '').slice(0, 40),
    href: String(body.href || '').slice(0, 160),
    dur: Number(body.dur || 0) || 0,                   // seconds on site
    dev: String(body.dev || '').slice(0, 20),          // mobile / desktop
    scr: String(body.scr || '').slice(0, 20),          // screen size
    country: String(req.headers['x-vercel-ip-country'] || '').slice(0, 4),
    city: String(req.headers['x-vercel-ip-city'] || '').slice(0, 40),
    ua: String(req.headers['user-agent'] || '').slice(0, 120),
    ipx: ipHeader ? String(ipHeader).split(',')[0].trim().split('.').slice(0, 2).join('.') + '.x.x' : '',
  };

  const path = `data/events-${day}.ndjson`;
  const line = JSON.stringify(evt) + '\n';

  // Append with retry — GitHub rejects stale SHAs on concurrent writes (409).
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const cur = await gh(`${path}?ref=${BRANCH}`, token);
      let sha, content = '';
      if (cur.status === 200) {
        const j = await cur.json();
        sha = j.sha;
        content = b64decode(j.content.replace(/\n/g, ''));
      } else if (cur.status !== 404) {
        return res.status(200).json({ ok: false, reason: 'read ' + cur.status });
      }

      const put = await gh(path, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `analytics: ${evt.type} ${day}`,
          content: b64encode(content + line),
          branch: BRANCH,
          ...(sha ? { sha } : {}),
        }),
      });

      if (put.status === 200 || put.status === 201) return res.status(200).json({ ok: true });
      if (put.status === 409 || put.status === 422) {
        await new Promise(r => setTimeout(r, 150 + Math.random() * 400));
        continue; // someone else wrote first — re-read and retry
      }
      return res.status(200).json({ ok: false, reason: 'write ' + put.status });
    } catch (e) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return res.status(200).json({ ok: false, reason: 'conflict' });
}
