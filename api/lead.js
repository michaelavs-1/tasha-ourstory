// Lead capture relay -> emails Таша directly via FormSubmit (no API key needed).
// Recipient can be overridden with the LEAD_EMAIL env var in Vercel.
const EMAIL = process.env.LEAD_EMAIL || 'tasha.karluka@gmail.com';
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false }); return; }
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  const name = (b.name || '').toString().slice(0, 200);
  const contact = (b.contact || '').toString().slice(0, 200);
  const message = (b.message || '').toString().slice(0, 2000);
  if (!name || !contact) { res.status(200).json({ ok: false, reason: 'missing' }); return; }
  try {
    const r = await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(EMAIL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json',
        Origin: 'https://www.ourstorybook.me', Referer: 'https://www.ourstorybook.me/' },
      body: JSON.stringify({
        _subject: 'Новая заявка с сайта OUR STORY',
        _template: 'table',
        'Имя': name,
        'Контакт': contact,
        'Сообщение': message || '(без сообщения)'
      })
    });
    // HTTP 200 = accepted (first ever submission also triggers a one-time activation email)
    const j = await r.json().catch(() => ({}));
    const ok = r.ok && (j.success === 'true' || j.success === true ||
                /activat/i.test(j.message || ''));
    res.status(200).json({ ok, provider: j });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e) });
  }
};
