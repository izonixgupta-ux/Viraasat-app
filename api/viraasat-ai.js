const RATE_WIN = 60000, RATE_MAX = 20, ipHits = new Map();

function checkRate(ip) {
  const now = Date.now();
  const list = (ipHits.get(ip) || []).filter(t => now - t < RATE_WIN);
  if (list.length >= RATE_MAX) { ipHits.set(ip, list); return false; }
  list.push(now); ipHits.set(ip, list);
  if (ipHits.size > 500) {
    for (const [k, v] of ipHits.entries()) if (!v.length || now - v[v.length - 1] > RATE_WIN) ipHits.delete(k);
  }
  return true;
}

function isAllowed(req) {
  const src = String(req.headers.origin || req.headers.referer || '').trim();
  const host = String(req.headers.host || '').trim().toLowerCase();
  const custom = String(process.env.ALLOWED_ORIGIN || '').trim().toLowerCase();
  if (!src) return false;
  try {
    const u = new URL(src), h = u.host.toLowerCase();
    return h === host || (custom && (u.origin.toLowerCase() === custom || h === custom)) || h === 'localhost' || h.startsWith('localhost:') || h === '127.0.0.1';
  } catch (e) { return false; }
}

const TOOLS = [
  { name:'edit_member_profile', description:'Open Profile & Photo Editor modal with circular DP cropper for current user or named family member.', parameters:{ type:'object', properties:{ memberName:{ type:'string' } } } },
  { name:'switch_active_profile', description:'Switch active user identity or open Member Switcher.', parameters:{ type:'object', properties:{ memberName:{ type:'string' } } } },
  { name:'start_call', description:'Start audio/video call or open private call room.', parameters:{ type:'object', properties:{ mode:{ type:'string', enum:['audio','video','room'] }, memberName:{ type:'string' } }, required:['mode'] } },
  { name:'design_card', description:'Design animated 3D e-invite card and open Cards tab.', parameters:{ type:'object', properties:{ template:{ type:'string', enum:['wedding','engagement','birthday','festival','housewarming','anniversary'] }, colorTheme:{ type:'string' }, headerText:{ type:'string' }, titleText:{ type:'string' }, dateText:{ type:'string' }, venueText:{ type:'string' }, footerText:{ type:'string' }, inviteLine:{ type:'string' } }, required:['template','titleText'] } },
  { name:'seal_time_capsule', description:'Lock a Time Capsule message for a future date.', parameters:{ type:'object', properties:{ title:{ type:'string' }, from:{ type:'string' }, to:{ type:'string' }, unlockDate:{ type:'string' }, message:{ type:'string' } }, required:['title','unlockDate','message'] } },
  { name:'add_family_member', description:'Add a new family member to Living Family Tree.', parameters:{ type:'object', properties:{ name:{ type:'string' }, relation:{ type:'string' }, birthYear:{ type:'string' }, gen:{ type:'integer' }, quote:{ type:'string' } }, required:['name','relation'] } },
  { name:'create_event', description:'Create a family event.', parameters:{ type:'object', properties:{ title:{ type:'string' }, date:{ type:'string' }, venue:{ type:'string' }, dressCode:{ type:'string' } }, required:['title'] } },
  { name:'send_broadcast', description:'Send a live family broadcast alert.', parameters:{ type:'object', properties:{ title:{ type:'string' }, message:{ type:'string' } }, required:['title','message'] } },
  { name:'post_lounge_message', description:'Post a message in Family Lounge chat.', parameters:{ type:'object', properties:{ channel:{ type:'string', enum:['general','celebrations','updates'] }, text:{ type:'string' }, sender:{ type:'string' } }, required:['text'] } },
  { name:'save_voice_story', description:'Save a family story in Voice & Story Vault.', parameters:{ type:'object', properties:{ title:{ type:'string' }, text:{ type:'string' }, speaker:{ type:'string' } }, required:['title','text'] } },
  { name:'set_voice_mode', description:'Switch Voice Vault between speech and audio.', parameters:{ type:'object', properties:{ mode:{ type:'string', enum:['speech','audio'] } }, required:['mode'] } },
  { name:'manage_markets', description:'Open MCX Bullion Markets, switch Ex-GST/Retail, refresh rates, or set target alert.', parameters:{ type:'object', properties:{ priceMode:{ type:'string', enum:['exgst','retail'] }, selected:{ type:'string', enum:['gold24','gold22','silver'] }, targetPrice:{ type:'number' }, refresh:{ type:'boolean' } } } },
  { name:'update_app_settings', description:'Change app settings. dark=true for dark mode, dark=false for light mode.', parameters:{ type:'object', properties:{ dark:{ type:'boolean' }, accentTheme:{ type:'string', enum:['gold','emerald','rose','sapphire','amethyst','titanium'] }, appLang:{ type:'string', enum:['en','hi','har','pa'] }, glassLevel:{ type:'string', enum:['standard','pro','liquid'] }, appIcon:{ type:'string', enum:['auto','day_gold','night_gold','classic','liquid_glass','liquid_purple'] }, uiScale:{ type:'string', enum:['compact','standard','large'] }, editMode:{ type:'boolean' }, soundFx:{ type:'boolean' }, presence:{ type:'string', enum:['online','celebrating','busy','away'] }, familyName:{ type:'string' } } } },
  { name:'navigate_app', description:'Open any tab, studio, or modal in Viraasat.', parameters:{ type:'object', properties:{ destination:{ type:'string', enum:['tree','capsules','album','add_photo','voice','chat','events','cards','markets','settings','settings_appearance','settings_language','settings_features','settings_vault','font_studio','pin_lock','lock_now','backup','export_backup','language','alerts','family_edit','add_member_modal','new_capsule_modal','new_event_modal','card_share','card_video','card_download','paywall','profile_switcher'] } }, required:['destination'] } }
];

function smartReply(actions) {
  if (!actions || !actions.length) return 'Bataiye, main aapki kaise help kar sakta hoon?';
  const a = actions[0];
  if (a.name === 'update_app_settings') {
    if (a.args && a.args.dark === true) return 'Dark mode on kar diya hai!';
    if (a.args && a.args.dark === false) return 'Light mode on kar diya hai!';
    return 'Settings update kar di hain!';
  }
  if (a.name === 'edit_member_profile') return 'Profile Editor khol diya hai — photo ya details update kar lo.';
  if (a.name === 'design_card') return 'Card design ready hai! Live preview dekh sakte ho.';
  if (a.name === 'manage_markets') return 'Live MCX Gold/Silver Markets khol diya hai.';
  return 'Done! Maine aapke liye update kar diya hai.';
}

module.exports = async function handler(req, res) {
  const origin = String(req.headers.origin || '').trim();
  const allowed = isAllowed(req);
  if (allowed && origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(allowed ? 200 : 403).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!allowed) return res.status(403).json({ error: 'Access denied' });

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (!checkRate(ip)) return res.status(429).json({ reply: 'Thoda slow chalo! Ek minute baad try karein.', actions: [] });

  const apiKey = (process.env.BYNARA_API_KEY || process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return res.status(200).json({ reply: 'Vercel me API key set nahi hai.', actions: [] });

  const isNara = apiKey.startsWith('sk-nry-');
  const isOR = apiKey.startsWith('sk-or-');

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const userMessages = Array.isArray(body.messages)
      ? body.messages.slice(-8).map(m => ({ role: m && m.role === 'assistant' ? 'assistant' : 'user', content: String((m && m.content) || '').slice(0, 1200) }))
      : [];
    const ctx = body.context && typeof body.context === 'object' ? body.context : {};

    // MODE 1: Audio Transcription
    if (body.action === 'transcribe' && body.audioBase64) {
      if (String(body.audioBase64).length > 3500000) return res.status(200).json({ transcript: '' });
      const mime = String(body.mimeType || 'audio/webm').split(';')[0];
      const fmt = mime.includes('mp4') ? 'mp4' : (mime.includes('ogg') ? 'ogg' : 'webm');
      const prompt = 'Transcribe this Indian English/Hinglish/Haryanvi/Punjabi/Urdu voice command in Roman script (Latin A-Z only). Return ONLY the text.';
      if (isNara || isOR) {
        const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 8000);
        try {
          const r = await fetch(isNara ? 'https://router.bynara.id/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey }, signal: ctrl.signal,
            body: JSON.stringify({ model: isNara ? (process.env.BYNARA_MODEL || 'gpt-5.6-luna').trim() : 'google/gemini-2.5-flash', messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'input_audio', input_audio: { data: body.audioBase64, format: fmt } }] }], temperature: 0.05, max_tokens: 250 })
          });
          clearTimeout(timer);
          const j = await r.json().catch(() => ({}));
          const out = j?.choices?.[0]?.message?.content;
          if (r.ok && out) return res.status(200).json({ transcript: String(out).trim().replace(/^["']|["']$/g, '') });
        } catch (e) { clearTimeout(timer); }
        return res.status(200).json({ transcript: '' });
      }
      return res.status(200).json({ transcript: '' });
    }

    // MODE 2: Chat & Full-App Automation
    const sys = [
      'You are Viraasat AI — smart assistant and automation engine for Viraasat (Indian family heirloom app: family tree, photo wall, 3D cards, time capsules, voice stories, family lounge, live MCX gold/silver rates).',
      'Date: ' + (ctx.todayISO || new Date().toISOString().slice(0, 10)),
      'State: ' + JSON.stringify(ctx).slice(0, 1800),
      'RULES: 1) Call tool(s) ONLY when user asks for an action/screen/setting. For normal chat, reply in text without tools. 2) dark mode => dark:true, light mode => dark:false. 3) Mirror user language/script (Hinglish/Roman Haryanvi/English). 4) For DP/profile photo, call edit_member_profile. 5) Never cut off mid-sentence.'
    ].join('\n');

    const oaTools = TOOLS.map(fn => ({ type: 'function', function: fn }));

    // PROVIDER A: NARAROUTER
    if (isNara) {
      const model = (process.env.BYNARA_MODEL || 'gpt-5.6-luna').trim();
      const messages = [{ role: 'system', content: sys }, ...userMessages.filter(m => m.content)];
      if (messages.length === 1) messages.push({ role: 'user', content: 'Hi' });
      let errStr = 'Unknown';
      for (const useTools of [true, false]) {
        const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 9000);
        try {
          const payload = { model, messages, temperature: 0.35, max_tokens: 1200 };
          if (useTools) { payload.tools = oaTools; payload.tool_choice = 'auto'; }
          const r = await fetch('https://router.bynara.id/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey }, signal: ctrl.signal, body: JSON.stringify(payload)
          });
          clearTimeout(timer);
          const j = await r.json().catch(() => ({}));
          if (r.ok && j?.choices?.[0]?.message) {
            const msg = j.choices[0].message, actions = [];
            if (Array.isArray(msg.tool_calls)) {
              for (const tc of msg.tool_calls) if (tc?.function?.name) { let args = {}; try { args = JSON.parse(tc.function.arguments || '{}'); } catch (e) {} actions.push({ name: tc.function.name, args }); }
            }
            let reply = String(msg.content || '').trim();
            if (!reply && actions.length) reply = smartReply(actions);
            if (reply || actions.length) return res.status(200).json({ reply, actions });
          }
          errStr = 'HTTP ' + r.status + ' ' + ((j.error && j.error.message) || '');
        } catch (e) { clearTimeout(timer); errStr = e?.name === 'AbortError' ? 'Timeout (9s)' : (e?.message || 'Network error'); break; }
      }
      return res.status(200).json({ reply: 'NaraRouter issue (' + errStr.trim() + ').', actions: [] });
    }

    // PROVIDER B: OPENROUTER
    if (isOR) {
      const custom = (process.env.OPENROUTER_MODEL || process.env.GEMINI_MODEL || '').trim();
      const models = [custom, 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct:free', 'openrouter/free'].filter((v, i, a) => v && v.includes('/') && a.indexOf(v) === i);
      const messages = [{ role: 'system', content: sys }, ...userMessages.filter(m => m.content)];
      if (messages.length === 1) messages.push({ role: 'user', content: 'Hi' });
      for (const model of models) {
        const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 8500);
        try {
          const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey, 'HTTP-Referer': origin || 'https://viraasat.vercel.app', 'X-Title': 'Viraasat AI' },
            signal: ctrl.signal, body: JSON.stringify({ model, messages, tools: oaTools, tool_choice: 'auto', temperature: 0.35, max_tokens: 1200 })
          });
          clearTimeout(timer);
          const j = await r.json().catch(() => ({}));
          if (r.ok && j?.choices?.[0]?.message) {
            const msg = j.choices[0].message, actions = [];
            if (Array.isArray(msg.tool_calls)) {
              for (const tc of msg.tool_calls) if (tc?.function?.name) { let args = {}; try { args = JSON.parse(tc.function.arguments || '{}'); } catch (e) {} actions.push({ name: tc.function.name, args }); }
            }
            let reply = String(msg.content || '').trim();
            if (!reply && !actions.length) continue;
            if (!reply && actions.length) reply = smartReply(actions);
            return res.status(200).json({ reply, actions });
          }
        } catch (e) { clearTimeout(timer); }
      }
      return res.status(200).json({ reply: 'AI abhi thoda busy hai. Ek second baad try karein.', actions: [] });
    }

    // PROVIDER C: DIRECT GEMINI
    const pref = (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
    const gModels = [pref, 'gemini-3.8-flash', 'gemini-2.5-flash'].filter((v, i, a) => v && !v.includes('/') && a.indexOf(v) === i);
    const contents = userMessages.filter(m => m.content).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    if (!contents.length) contents.push({ role: 'user', parts: [{ text: 'Hi' }] });
    for (const model of gModels) {
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 8500);
      try {
        const cfg = { temperature: 0.35, maxOutputTokens: 1200 };
        if (model.includes('2.5')) cfg.thinkingConfig = { thinkingBudget: 0 };
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey), {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
          body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents, tools: [{ functionDeclarations: TOOLS }], generationConfig: cfg })
        });
        clearTimeout(timer);
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.candidates?.[0]) {
          const parts = j.candidates[0]?.content?.parts || [], actions = [], texts = [];
          for (const p of parts) { if (p.functionCall?.name) actions.push({ name: p.functionCall.name, args: p.functionCall.args || {} }); if (p.text) texts.push(p.text); }
          let reply = texts.join('\n').trim();
          if (!reply && actions.length) reply = smartReply(actions);
          return res.status(200).json({ reply, actions });
        }
      } catch (e) { clearTimeout(timer); }
    }
    return res.status(200).json({ reply: 'AI abhi thoda busy hai. Ek second baad try karein.', actions: [] });
  } catch (err) {
    return res.status(200).json({ reply: 'Temporary issue aa gaya. Dobara try karein.', actions: [] });
  }
};
