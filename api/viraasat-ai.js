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
    const preferredModel = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
    const modelsToTry = [preferredModel, 'gemini-2.5-flash', 'gemini-3.8-flash']
      .filter((v, i, a) => a.indexOf(v) === i);

    // MODE 1: Smart Auto-Detect Voice Transcription
    if (body.action === 'transcribe' && body.audioBase64) {
      const mimeType = String(body.mimeType || 'audio/webm').split(';')[0];
      const transcribePrompt = `You are a studio-grade South Asian & Indian English speech transcriber for the Viraasat app.
Listen carefully to the audio and transcribe EXACTLY what the speaker said with 100% accurate spelling.
RULES:
1. Auto-detect English, Hinglish, Hindi, Haryanvi, Punjabi, or Urdu seamlessly — even if the speaker mixes languages in one sentence.
2. Preserve exact app terms, names, and numbers accurately (e.g. "Viraasat", "Gold MCX", "Silver", "1 lakh 20 thousand", "100000", "dark mode", "time capsule", "wedding card", "Ex-GST", "Retail", "profile picture").
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

    // MODE 2: Full-App Universal Auto-Pilot & Guided Support
    const userMessages = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
    const ctx = body.context || {};

    const systemPrompt = `You are Viraasat AI — the built-in smart assistant and full-app automation engine for "Viraasat", a luxury Indian digital family heirloom app.
Current Date: ${ctx.todayISO || new Date().toISOString().slice(0, 10)}.
App Live State Snapshot: ${JSON.stringify(ctx)}.

CRITICAL RULES:
1. ALWAYS ACT + EXPLAIN TOGETHER:
   - Whenever the user asks to do ANYTHING, asks "how to do X", or asks "where is X" (e.g., change profile picture/DP, upload family photo, start audio/video call, change font, change app icon, set PIN lock, lock app, switch dark/light mode, change accent color/glass UI, switch active profile, edit family name, backup/export data, design/share/download 3D card, seal time capsule, add member, create event, check gold rate, set price alert, open alerts, check subscription/pass, change status/presence, turn on edit mode), ALWAYS call the matching tool(s) immediately so the app opens that exact screen/modal or executes the change automatically, AND in your reply give short, clear 2-3 step instructions so they know how it works too!
   - NEVER say "this feature is not available" for any feature listed in the tools below.
2. LANGUAGE MIRRORING:
   - Reply warmly, naturally, and concisely in the EXACT same language/dialect and script the user used (Hinglish -> Hinglish, Roman Haryanvi -> Roman Haryanvi, Roman Punjabi -> Roman Punjabi, Roman Urdu -> Roman Urdu, English -> English). Never switch to Devanagari unless the user writes in Devanagari.
3. SMART DEFAULTS:
   - For wedding/birthday cards or time capsules, fill tasteful Indian family details for unspecified fields.
   - For profile picture / DP / avatar change requests, ALWAYS call \`edit_member_profile\` (pass \`memberName\` if they mention someone like Papa/Mom, or leave empty for their own profile) AND explain: "Maine aapka Profile Editor khol diya hai — 'Upload Photo' par tap karke apni photo crop aur save kar lo."
4. MARKETS:
   - Use the live MCX Gold/Silver rates from App Live State Snapshot when answering rate questions, and call \`manage_markets\` to open Markets tab if they ask to see/check/track rates.
5. CONCISE & FAST:
   - Keep replies crisp (2-4 short lines max unless user asks for a full feature list).`;

    const functionDeclarations = [
      {
        name: 'edit_member_profile',
        description: 'Open the Profile & Photo Editor modal (with circular DP cropper, name, relation, quote) for the current user or any named family member. Use whenever user asks to change profile picture, DP, avatar, photo, bio, or edit a member.',
        parameters: {
          type: 'object',
          properties: {
            memberName: { type: 'string', description: 'Optional name or relation of member (e.g. "Papa", "Dadi"). Leave empty to edit the current active user profile.' }
          }
        }
      },
      {
        name: 'switch_active_profile',
        description: 'Switch the active user identity (Send As / Viewing As) to another family member, or open the Member Switcher modal.',
        parameters: {
          type: 'object',
          properties: {
            memberName: { type: 'string', description: 'Optional member name to switch directly. Leave empty to open switcher modal.' }
          }
        }
      },
      {
        name: 'start_call',
        description: 'Start an iOS-style family audio call, video call, or open the private P2P call room / call picker.',
        parameters: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['audio', 'video', 'room'], description: 'Type of call to start or open' },
            memberName: { type: 'string', description: 'Optional family member name to call directly' }
          },
          required: ['mode']
        }
      },
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
        description: 'Change app appearance, dark/light mode, accent color, glass UI level, app icon, app language, UI text size, edit mode, sound FX, presence status, or family vault name.',
        parameters: {
          type: 'object',
          properties: {
            dark: { type: 'boolean' },
            accentTheme: { type: 'string', enum: ['gold', 'emerald', 'rose', 'sapphire', 'amethyst', 'titanium'] },
            appLang: { type: 'string', enum: ['en', 'hi', 'har', 'pa'] },
            glassLevel: { type: 'string', enum: ['standard', 'pro', 'liquid'] },
            appIcon: { type: 'string', enum: ['auto', 'day_gold', 'night_gold', 'classic', 'liquid_glass', 'liquid_purple'] },
            uiScale: { type: 'string', enum: ['compact', 'standard', 'large'] },
            editMode: { type: 'boolean' },
            soundFx: { type: 'boolean' },
            presence: { type: 'string', enum: ['online', 'celebrating', 'busy', 'away'] },
            familyName: { type: 'string' }
          }
        }
      },
      {
        name: 'navigate_app',
        description: 'Open ANY tab, sub-tab, studio, or modal in Viraasat automatically.',
        parameters: {
          type: 'object',
          properties: {
            destination: {
              type: 'string',
              enum: [
                'tree', 'capsules', 'album', 'add_photo', 'voice', 'chat', 'events', 'cards', 'markets',
                'settings', 'settings_appearance', 'settings_language', 'settings_features', 'settings_vault',
                'font_studio', 'pin_lock', 'lock_now', 'backup', 'export_backup', 'language', 'alerts',
                'family_edit', 'add_member_modal', 'new_capsule_modal', 'new_event_modal',
                'card_share', 'card_video', 'card_download', 'paywall', 'profile_switcher'
              ]
            }
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
      contents.push({ role: 'user', parts: [{ text: 'Hi' }] });
    }

    let aiData = null;
    let lastError = 'Gemini request failed';

    for (const model of modelsToTry) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8500);
      const genConfig = { temperature: 0.35, maxOutputTokens: 450 };
      if (model.includes('2.5')) genConfig.thinkingConfig = { thinkingBudget: 0 };
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            tools: [{ functionDeclarations }],
            generationConfig: genConfig
          })
        });
        clearTimeout(timer);
        const json = await resp.json().catch(() => ({}));
        if (resp.ok && json.candidates && json.candidates[0]) {
          aiData = json;
          break;
        }
        lastError = (json && json.error && json.error.message) ? json.error.message : `HTTP ${resp.status}`;
      } catch (e) {
        clearTimeout(timer);
        lastError = e && e.name === 'AbortError' ? 'AI response timeout' : (e && e.message ? e.message : 'Network error');
      }
    }

    if (!aiData) {
      return res.status(502).json({ error: 'Gemini Error: ' + lastError });
    }

    const parts = (aiData.candidates[0].content && aiData.candidates[0].content.parts) || [];
    const actions = [];
    const replyTexts = [];

    for (const part of parts) {
      if (part.functionCall && part.functionCall.name) {
        actions.push({ name: part.functionCall.name, args: part.functionCall.args || {} });
      }
      if (part.text) {
        replyTexts.push(part.text);
      }
    }

    let reply = replyTexts.join('\n').trim();
    if (!reply && actions.length) {
      reply = 'Done! Maine aapke liye exact screen khol di hai aur settings update kar di hain.';
    }

    return res.status(200).json({ reply, actions });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + (err && err.message ? err.message : 'Unknown') });
  }
}
  
