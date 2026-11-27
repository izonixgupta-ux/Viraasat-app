module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not set in Vercel Environment Variables. Add it in Vercel Project Settings -> Environment Variables and redeploy.'
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const preferredModel = (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
    const modelsToTry = [preferredModel, 'gemini-3.8-flash', 'gemini-2.5-flash']
      .filter((v, i, a) => a.indexOf(v) === i);

    // MODE 1: Smart Auto-Detect Voice Transcription
    if (body.action === 'transcribe' && body.audioBase64) {
      const mimeType = String(body.mimeType || 'audio/webm').split(';')[0];
      const transcribePrompt = `You are a studio-grade South Asian & Indian English speech transcriber for the Viraasat app.
Listen carefully to the audio and transcribe EXACTLY what the speaker said with 100% accurate spelling.
RULES:
1. Auto-detect English, Hinglish, Hindi, Haryanvi, Punjabi, or Urdu seamlessly — even if the speaker mixes languages in one sentence.
2. Preserve exact app terms, names, and numbers accurately (e.g. "Viraasat", "Gold MCX", "Silver", "1 lakh 20 thousand", "100000", "dark mode", "time capsule", "wedding card", "Ex-GST", "Retail").
3. Output clean natural English if spoken in English, or clean Romanized script (Latin A-Z letters) if spoken in Hindi/Hinglish/Haryanvi/Punjabi/Urdu. NEVER output Devanagari, Gurmukhi, or Arabic script.
4. Fix stutters cleanly without changing the speaker's intent.
5. Return ONLY the final transcribed text — no quotes, no prefixes, no commentary.`;

      let transcript = '';
      let lastErr = 'Transcription failed';
      for (const model of modelsToTry) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const genCfg = { temperature: 0.05, maxOutputTokens: 300 };
        if (model.includes('2.5')) genCfg.thinkingConfig = { thinkingBudget: 0 };
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [
                { text: transcribePrompt },
                { inlineData: { mimeType, data: body.audioBase64 } }
              ]
            }],
            generationConfig: genCfg
          })
        });
        const json = await resp.json().catch(() => ({}));
        const out = json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text;
        if (resp.ok && out && out.trim()) {
          transcript = out.trim().replace(/^["']|["']$/g, '');
          break;
        }
        lastErr = (json && json.error && json.error.message) ? json.error.message : `HTTP ${resp.status}`;
      }
      if (!transcript) return res.status(502).json({ error: 'Voice AI Error: ' + lastErr });
      return res.status(200).json({ transcript });
    }

    // MODE 2: Full-App Automation & Support Chat
    const userMessages = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
    const ctx = body.context || {};

    const systemPrompt = `You are Viraasat AI — the built-in smart assistant and full-app automation engine for "Viraasat", a luxury Indian digital family heirloom app.
Current Date: ${ctx.todayISO || new Date().toISOString().slice(0, 10)}.
App Live State Snapshot: ${JSON.stringify(ctx)}.

Your dual role:
1. FULL AUTOMATION: Whenever the user asks you to create, design, lock, add, post, switch, or update anything in Viraasat (cards, time capsules, family members, events, broadcasts, lounge messages, voice stories, MCX alerts, theme/language/navigation), ALWAYS call the matching tool(s) immediately with clean, complete parameters. You can call multiple tools in one turn if needed.
2. LANGUAGE MIRRORING: Reply warmly, naturally, and concisely in the EXACT same language/dialect and script the user used (Roman Haryanvi -> Roman Haryanvi, Roman Punjabi -> Roman Punjabi, Roman Urdu -> Roman Urdu, Hinglish -> Hinglish, English -> English). Never switch to Shuddh Hindi Devanagari unless the user explicitly writes in Devanagari. Never be preachy.
3. SMART DEFAULTS: For wedding/birthday cards or time capsules, fill in tasteful, realistic Indian family details for any fields the user didn't specify so the result looks instantly polished.
4. MARKETS: Use the live MCX Gold/Silver prices from the App Live State Snapshot above when answering rate questions.
5. VOICE DICTATION AWARENESS: The user often speaks via live voice-to-text (Indian English / Hinglish / Haryanvi / Punjabi / Urdu). Intelligently understand minor phonetic or speech-recognition typos (like "virasat", "gold mcx", "1 lakh", "target price", "shaadi card", "dark mode") by intent and execute cleanly without pointing out typos.`;

    const functionDeclarations = [
      {
        name: 'design_card',
        description: 'Design or customize an animated 3D e-invite card in the Card Designer and open it.',
        parameters: {
          type: 'object',
          properties: {
            template: { type: 'string', enum: ['wedding', 'engagement', 'birthday', 'festival', 'housewarming', 'anniversary'] },
            colorTheme: { type: 'string', description: 'Optional theme name like Royal Ivory & Gold, Udaipur Emerald, Velvet Crimson, Blush Editorial, Marigold Haldi, Midnight Obsidian' },
            headerText: { type: 'string' },
            titleText: { type: 'string', description: 'Main couple or celebration title, e.g., Aarav & Riya' },
            dateText: { type: 'string', description: 'e.g., 2 DECEMBER 2026 • 7:00 PM' },
            venueText: { type: 'string' },
            footerText: { type: 'string' },
            inviteLine: { type: 'string' },
            shubhText: { type: 'string', description: 'Optional sacred top text like ॥ श्री गणेशाय नमः ॥' },
            ceremonies: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  date: { type: 'string' },
                  venue: { type: 'string' },
                  dress: { type: 'string' }
                }
              }
            }
          },
          required: ['template', 'titleText']
        }
      },
      {
        name: 'seal_time_capsule',
        description: 'Lock and seal a Time Capsule message for a specific future date (birthdays, anniversaries, blessings).',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            from: { type: 'string' },
            to: { type: 'string' },
            unlockDate: { type: 'string', description: 'Future unlock date in ISO format YYYY-MM-DD (or YYYY-MM-DDTHH:MM:SS)' },
            message: { type: 'string', description: 'Warm, heartfelt message to seal inside the capsule' }
          },
          required: ['title', 'unlockDate', 'message']
        }
      },
      {
        name: 'add_family_member',
        description: 'Add a new family member to the Living Family Tree.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            relation: { type: 'string' },
            birthYear: { type: 'string' },
            gen: { type: 'integer', description: 'Generation level 1 (grandparents/elders) to 5 (kids)' },
            quote: { type: 'string' }
          },
          required: ['name', 'relation']
        }
      },
      {
        name: 'create_event',
        description: 'Create a family event with optional sub-ceremonies and dress code.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            date: { type: 'string' },
            venue: { type: 'string' },
            dressCode: { type: 'string' },
            ceremonies: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  time: { type: 'string' },
                  dress: { type: 'string' }
                }
              }
            }
          },
          required: ['title']
        }
      },
      {
        name: 'send_broadcast',
        description: 'Send a live announcement/broadcast alert to the family alerts feed.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            message: { type: 'string' }
          },
          required: ['title', 'message']
        }
      },
      {
        name: 'post_lounge_message',
        description: 'Post a message into the private Family Lounge chat.',
        parameters: {
          type: 'object',
          properties: {
            channel: { type: 'string', enum: ['general', 'celebrations', 'updates'] },
            text: { type: 'string' },
            sender: { type: 'string' }
          },
          required: ['text']
        }
      },
      {
        name: 'save_voice_story',
        description: 'Save a written family story or memory into the Voice & Story Vault.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            text: { type: 'string' },
            speaker: { type: 'string' }
          },
          required: ['title', 'text']
        }
      },
      {
        name: 'set_voice_mode',
        description: 'Switch Voice Vault recorder between Live Dictation (speech) and Original Voice Memo (audio).',
        parameters: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['speech', 'audio'] }
          },
          required: ['mode']
        }
      },
      {
        name: 'manage_markets',
        description: 'Open MCX Bullion Markets, switch Ex-GST/Retail mode, refresh live rates, or set a target price alert.',
        parameters: {
          type: 'object',
          properties: {
            priceMode: { type: 'string', enum: ['exgst', 'retail'] },
            selected: { type: 'string', enum: ['gold24', 'gold22', 'silver'] },
            targetPrice: { type: 'number' },
            refresh: { type: 'boolean' }
          }
        }
      },
      {
        name: 'update_app_settings',
        description: 'Change app appearance, dark/light mode, accent color, glass UI level, or app language.',
        parameters: {
          type: 'object',
          properties: {
            dark: { type: 'boolean' },
            accentTheme: { type: 'string', enum: ['gold', 'emerald', 'rose', 'sapphire', 'amethyst', 'titanium'] },
            appLang: { type: 'string', enum: ['en', 'hi', 'har', 'pa'] },
            glassLevel: { type: 'string', enum: ['standard', 'pro', 'liquid'] }
          }
        }
      },
      {
        name: 'navigate_app',
        description: 'Navigate to any tab or modal in Viraasat.',
        parameters: {
          type: 'object',
          properties: {
            destination: { type: 'string', enum: ['tree', 'capsules', 'voice', 'chat', 'events', 'cards', 'markets', 'settings', 'backup', 'language', 'alerts'] }
          },
          required: ['destination']
        }
      }
    ];

    const contents = userMessages
      .filter(m => m && m.content)
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.content) }]
      }));

    if (!contents.length) {
      contents
          
