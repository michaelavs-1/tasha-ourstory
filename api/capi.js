// Meta Conversions API relay.
// Configure in Vercel: Settings -> Environment Variables:
//   META_PIXEL_ID   = your pixel id
//   META_CAPI_TOKEN = Conversions API access token (Events Manager -> Settings)
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const PIXEL = process.env.META_PIXEL_ID, TOKEN = process.env.META_CAPI_TOKEN;
  if (!PIXEL || !TOKEN) { res.status(200).json({ ok: false, reason: 'CAPI not configured' }); return; }
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const payload = {
    data: [{
      event_name: b.event_name || 'PageView',
      event_time: Math.floor(Date.now() / 1000),
      event_id: b.event_id || undefined,
      action_source: 'website',
      event_source_url: b.url || '',
      user_data: {
        client_user_agent: req.headers['user-agent'] || '',
        client_ip_address: ip || undefined
      }
    }],
    access_token: TOKEN
  };
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${PIXEL}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await r.json().catch(() => ({}));
    res.status(200).json({ ok: r.ok, fb: j });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e) });
  }
};
