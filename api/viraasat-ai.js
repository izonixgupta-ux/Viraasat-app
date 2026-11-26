export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(500).json({
      error: 'OPENAI_API_KEY is not set in Vercel Environment Variables. Add it in Vercel Project Settings → Environment Variables and redeploy.'
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const userMessages = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
    const ctx = body.context || {};

    const systemPrompt = `You are Viraasat AI — the built-in smart assistant and full-app automation engine for "Viraasat", a luxury Indian digital family heirloom app.
Current Date: ${ctx.todayISO || new Date().toISOString().slice(0, 10)}.
App Live State Snapshot: ${JSON.stringify(ctx)}.

Your dual role:
1. FULL AUTOMATION: Whenever the user asks you to create, design, lock, add, post, switch, or update anything in Viraasat (cards, time capsules, family members, events, broadcasts, lounge messages, voice stories, MCX alerts, theme/language/navigation), ALWAYS call the matching tool(s) immediately with clean, complete parameters. You can call multiple tools in one turn if needed.
2. 24x7 HELPFUL SUPPORT: If the user asks how something works or needs guidance, answer clearly, warmly, and concisely in the SAME language/script the user wrote in (Hinglish, Haryanvi Roman, Hindi, Punjabi, or English). Never be preachy.
3. SMART DEFAULTS: For wedding/birthday cards or time capsules, fill in tasteful, realistic Indian family details for any fields the user didn't specify so the result looks instantly polished.
4. MARKETS: Use the live MCX Gold/Silver prices from the App Live State Snapshot above when answering rate questions.`;

    const tools = [
      {
        type: 'function',
        function: {
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
        }
      },
      {
        type: 'function',
        function: {
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
        }
      },
      {
        type: 'function',
        function: {
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
        }
      },
      {
        type: 'function',
        function: {
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
        }
      },
      {
        type: 'function',
        function: {
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
        }
      },
      {
        type: 'function',
        function: {
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
        }
      },
      {
        type: 'function',
        function: {
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
        }
      },
      {
        type: 'function',
        function: {
          name: 'set_voice_mode',
          description: 'Switch Voice Vault recorder between Live Dictation (speech) and Original Voice Memo (audio).',
          parameters: {
            type: 'object',
            properties: {
              mode: { type: 'string', enum: ['speech', 'audio'] }
            },
            required: ['mode']
          }
        }
      },
      {
        type: 'function',
        function: {
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
        }
      },
      {
        type: 'function',
        function: {
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
        }
      },
      {
        type: 'function',
        function: {
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
      }
    ];

    const preferredModel = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
    const modelsToTry = [preferredModel, 'gpt-4o-mini', 'gpt-4.1-mini'].filter((v, i, a) => a.indexOf(v) === i);

    let aiData = null;
    let lastError = 'OpenAI request failed';

    for (const model of modelsToTry) {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.35,
          max_tokens: 650,
          messages: [
            { role: 'system', content: systemPrompt },
            ...userMessages
          ],
          tools,
          tool_choice: 'auto'
        })
      });

      const json = await resp.json().catch(() => ({}));
      if (resp.ok && json.choices && json.choices[0]) {
        aiData = json;
        break;
      }
      lastError = (json && json.error && json.error.message) ? json.error.message : `HTTP ${resp.status}`;
    }

    if (!aiData) {
      return res.status(502).json({ error: 'OpenAI Error: ' + lastError });
    }

    const msg = aiData.choices[0].message || {};
    const actions = [];
    if (Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if (tc && tc.function && tc.function.name) {
          let parsedArgs = {};
          try { parsedArgs = JSON.parse(tc.function.arguments || '{}'); } catch (e) {}
          actions.push({ name: tc.function.name, args: parsedArgs });
        }
      }
    }

    let reply = (msg.content || '').trim();
    if (!reply && actions.length) {
      reply = 'Done! Maine aapke command ke according sab update kar diya hai. Neeche live preview dekh sakte hain.';
    }

    return res.status(200).json({ reply, actions });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + (err && err.message ? err.message : 'Unknown') });
  }
                }
