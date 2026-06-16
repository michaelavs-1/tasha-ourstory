// Lead capture relay -> emails Таша via Web3Forms (free, no server keys to manage).
// Configure once in Vercel -> Settings -> Environment Variables:
//   WEB3FORMS_KEY = access key from https://web3forms.com (enter tasha.karluka@gmail.com)
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
  const KEY = process.env.WEB3FORMS_KEY;
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  const name = (b.name || '').toString().slice(0, 200);
  const contact = (b.contact || '').toString().slice(0, 200);
  const message = (b.message || '').toString().slice(0, 2000);
  if (!name || !contact) { res.status(200).json({ ok: false, reason: 'missing' }); return; }
  if (!KEY) { res.status(200).json({ ok: false, reason: 'not_configured' }); return; }
  try {
    const r = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: KEY,
        subject: 'Новая заявка с сайта OUR STORY',
        from_name: 'OUR STORY',
        name, contact, message: message || '(без сообщения)'
      })
    });
    const j = await r.json().catch(() => ({}));
    res.status(200).json({ ok: !!j.success, provider: j });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e) });
  }
};
