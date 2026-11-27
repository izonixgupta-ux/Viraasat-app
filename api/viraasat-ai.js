module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(200).json({
      reply: 'Vercel Environment Variables me GEMINI_API_KEY set nahi hai. Please add karke redeploy karein.',
      actions: []
    });
  }

  let body = {};
  let userMessages = [];
  let ctx = {};

  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    userMessages = Array.isArray(body.messages) ? body.messages.slice(-8) : [];
    ctx = body.context || {};

    const preferredModel = (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();
    const modelsToTry = [preferredModel, 'gemini-3.8-flash', 'gemini-2.5-flash']
      .filter((v, i, a) => v && a.indexOf(v) === i);

    // MODE 1: Voice Transcription
    if (body.action === 'transcribe' && body.audioBase64) {
      const mimeType = String(body.mimeType || 'audio/webm').split(';')[0];
      const transcribePrompt = 'Transcribe this Indian English / Hinglish / Haryanvi / Punjabi / Urdu audio accurately in Roman script (Latin A-Z only). Return ONLY the transcribed text.';
      let transcript = '';
      for (const model of modelsToTry) {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey);
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 9000);
        const genCfg = { temperature: 0.05, maxOutputTokens: 250 };
        if (model.includes('2.5')) genCfg.thinkingConfig = { thinkingBudget: 0 };
        try {
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: ctrl.signal,
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: transcribePrompt }, { inlineData: { mimeType, data: body.audioBase64 } }] }],
              generationConfig: genCfg
            })
          });
          clearTimeout(timer);
          const json = await resp.json().catch(() => ({}));
          const out = json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text;
          if (resp.ok && out && out.trim()) {
            transcript = out.trim().replace(/^["']|["']$/g, '');
            break;
          }
        } catch (e) {
          clearTimeout(timer);
        }
      }
      return res.status(200).json({ transcript: transcript || '' });
    }

    // MODE 2: Chat & Full-App Automation
    const systemPrompt = [
      'You are Viraasat AI — the smart assistant and full-app automation engine for Viraasat (a luxury Indian digital family heirloom app for family trees, photo walls, 3D e-invite cards, time capsules, voice stories, family lounge chat/calls, and live MCX gold/silver rates).',
      'Current Date: ' + (ctx.todayISO || new Date().toISOString().slice(0, 10)),
      'App State: ' + JSON.stringify(ctx),
      'RULES:',
      '1. ALWAYS call the matching tool(s) immediately whenever user asks to do, open, change, or asks how to do anything (profile photo/DP, cards, capsules, family tree, events, calls, markets, settings, dark mode, language, PIN lock, backup), AND explain in 2-3 short lines.',
      '2. Mirror the user language/dialect (Hinglish -> Hinglish, Haryanvi -> Roman Haryanvi, Punjabi -> Roman Punjabi, English -> English). Never use Devanagari unless user does.',
      '3. For profile picture/DP requests, ALWAYS call edit_member_profile.',
      '4. Keep replies short, natural, warm, and direct.'
    ].join('\n');

    const functionDeclarations = [
      {
        name: 'edit_member_profile',
        description: 'Open Profile & Photo Editor modal with circular DP cropper for current user or named family member.',
        parameters: { type: 'object', properties: { memberName: { type: 'string' } } }
      },
      {
        name: 'switch_active_profile',
        description: 'Switch active user identity or open Member Switcher.',
        parameters: { type: 'object', properties: { memberName: { type: 'string' } } }
      },
      {
        name: 'start_call',
        description: 'Start audio call, video call, or open private call room.',
        parameters: {
          type: 'object',
          properties: {
            mode: { type: 'string', enum: ['audio', 'video', 'room'] },
            memberName: { type: 'string' }
          },
          required: ['mode']
        }
      },
      {
        name: 'design_card',
        description: 'Design animated 3D e-invite card and open Cards tab.',
        parameters: {
          type: 'object',
          properties: {
            template: { type: 'string', enum: ['wedding', 'engagement', 'birthday', 'festival', 'housewarming', 'anniversary'] },
            colorTheme: { type: 'string' },
            headerText: { type: 'string' },
            titleText: { type: 'string' },
            dateText: { type: 'string' },
            venueText: { type: 'string' },
            footerText: { type: 'string' },
            inviteLine: { type: 'string' }
          },
          required: ['template', 'titleText']
        }
      },
      {
        name: 'seal_time_capsule',
        description: 'Lock a Time Capsule message for a future date.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            from: { type: 'string' },
            to: { type: 'string' },
            unlockDate: { type: 'string' },
            message: { type: 'string' }
          },
          required: ['title', 'unlockDate', 'message']
        }
      },
      {
        name: 'add_family_member',
        description: 'Add a new family member to Living Family Tree.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            relation: { type: 'string' },
            birthYear: { type: 'string' },
            gen: { type: 'integer' },
            quote: { type: 'string' }
          },
          required: ['name', 'relation']
        }
      },
      {
        name: 'create_event',
        description: 'Create a family event.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            date: { type: 'string' },
            venue: { type: 'string' },
            dressCode: { type: 'string' }
          },
          required: ['title']
        }
      },
      {
        name: 'send_broadcast',
        description: 'Send a live family broadcast alert.',
        parameters: {
          type: 'object',
          properties: { title: { type: 'string' }, message: { type: 'string' } },
          required: ['title', 'message']
        }
      },
      {
        name: 'post_lounge_message',
        description: 'Post a message in Family Lounge chat.',
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
        description: 'Save a family story in Voice & Story Vault.',
        parameters: {
          type: 'object',
          properties: { title: { type: 'string' }, text: { type: 'string' }, speaker: { type: 'string' } },
          required: ['title', 'text']
        }
      },
      {
        name: 'set_voice_mode',
        description: 'Switch Voice Vault between Live Dictation (speech) and Voice Memo (audio).',
        parameters: {
          type: 'object',
          properties: { mode: { type: 'string', enum: ['speech', 'audio'] } },
          required: ['mode']
        }
      },
      {
        name: 'manage_markets',
        description: 'Open MCX Bullion Markets, switch Ex-GST/Retail, refresh rates, or set target alert.',
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
        description: 'Change dark/light mode, accent color, glass UI, app icon, language, text size, edit mode, sound FX, presence, or family name.',
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
        description: 'Open any tab, studio, or modal in Viraasat.',
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
      .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] }));
    if (!contents.length) contents.push({ role: 'user', parts: [{ text: 'Hi' }] });

    let aiData = null;
    let lastError = 'Gemini busy';

    for (const model of modelsToTry) {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
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
        lastError = (json && json.error && json.error.message) ? json.error.message : ('HTTP ' + resp.status);
      } catch (e) {
        clearTimeout(timer);
        lastError = e && e.name === 'AbortError' ? 'Timeout' : (e && e.message ? e.message : 'Network error');
      }
    }

    if (!aiData) {
      return res.status(200).json({
        reply: 'AI abhi thoda busy hai (' + lastError + '). Ek second baad dobara bhejo.',
        actions: []
      });
    }

    const parts = (aiData.candidates[0].content && aiData.candidates[0].content.parts) || [];
    const actions = [];
    const replyTexts = [];

    for (const part of parts) {
      if (part.functionCall && part.functionCall.name) {
        actions.push({ name: part.functionCall.name, args: part.functionCall.args || {} });
      }
      if (part.text) replyTexts.push(part.text);
    }

    let reply = replyTexts.join('\n').trim();
    if (!reply && actions.length) {
      reply = 'Done! Maine aapke liye exact screen khol di hai aur settings update kar di hain.';
    }

    return res.status(200).json({ reply, actions });
  } catch (err) {
    return res.status(200).json({
      reply: 'Temporary error: ' + (err && err.message ? err.message : 'Unknown') + '. Dobara try karein.',
      actions: []
    });
  }
};
            
