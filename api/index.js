const express = require('express');
const axios = require('axios');

const app = express();

// ====================================================
// CONFIG UPSTASH REDIS (Ubah sesuai kredensialmu)
// ====================================================
const REDIS_URL = 'https://primary-sheepdog-180502.upstash.io';
const REDIS_TOKEN = 'gQAAAAAAAsEWAAIgcDI0ZmNjOGYxMDE1ZjI0YTU2ODJmM2EwNDBhMThiYmQ5YQ';

const DEFAULT_TARGET = 'https://clientbp.ggbluepanda.com';

// Helper Function Komunikasi ke Redis Real-Time
async function getRulesFromRedis() {
  try {
    const res = await axios.get(`${REDIS_URL}/get/proxy_rules`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    if (res.data && res.data.result) {
      return JSON.parse(res.data.result);
    }
  } catch (err) {
    console.error('[REDIS READ ERROR]', err.message);
  }
  return [];
}

async function saveRulesToRedis(rules) {
  try {
    await axios.post(`${REDIS_URL}/set/proxy_rules`, JSON.stringify(rules), {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
  } catch (err) {
    console.error('[REDIS WRITE ERROR]', err.message);
  }
}

// Express Body Parsers
app.use(express.json());
app.use(express.raw({ type: '*/*', limit: '10mb' }));

// API CRUD Routes
app.get('/api/rules', async (req, res) => {
  const rules = await getRulesFromRedis();
  res.json(rules);
});

app.post('/api/rules', async (req, res) => {
  const { path, type, payload } = req.body || {};
  if (!path || !type || !payload) return res.status(400).json({ error: 'Semua field wajib diisi!' });

  let rules = await getRulesFromRedis();
  const newRule = { id: Date.now(), path, type, payload: payload.trim() };
  rules.unshift(newRule);

  await saveRulesToRedis(rules);
  res.json({ success: true, rule: newRule });
});

app.put('/api/rules/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { path, type, payload } = req.body || {};

  let rules = await getRulesFromRedis();
  const ruleIndex = rules.findIndex(r => r.id === id);

  if (ruleIndex !== -1) {
    rules[ruleIndex] = { id, path, type, payload: payload.trim() };
    await saveRulesToRedis(rules);
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Rule tidak ditemukan' });
});

app.delete('/api/rules/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  let rules = await getRulesFromRedis();
  rules = rules.filter(r => r.id !== id);

  await saveRulesToRedis(rules);
  res.json({ success: true });
});

// DASHBOARD UI (HTML + Tailwind)
app.get('/dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Realtime Hex Proxy Dashboard</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-900 text-white p-6 font-sans">
      <div class="max-w-4xl mx-auto">
        <h1 class="text-3xl font-bold mb-2 text-indigo-400">⚡ Realtime Hex Proxy Interceptor</h1>
        <p class="text-gray-400 mb-6">Powered by Upstash Redis - Simpan/Edit/Hapus langsung aktif real-time!</p>
        
        <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-8">
          <h2 id="form-title" class="text-xl font-semibold mb-4 text-indigo-300">Tambah Rule Baru</h2>
          <input type="hidden" id="edit-id">
          
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label class="block text-sm text-gray-400 mb-1">Path Target</label>
              <input type="text" id="path" placeholder="/PurchaseGacha" class="w-full bg-gray-900 border border-gray-700 p-2.5 rounded text-sm text-white focus:outline-none focus:border-indigo-500">
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">Tipe Response</label>
              <select id="type" onchange="updatePlaceholder()" class="w-full bg-gray-900 border border-gray-700 p-2.5 rounded text-sm text-white focus:outline-none focus:border-indigo-500">
                <option value="hex">Custom Hex Buffer</option>
                <option value="url">Forward Target URL</option>
              </select>
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1" id="payload-label">Hex String</label>
              <input type="text" id="payload" placeholder="0a0c080110..." class="w-full bg-gray-900 border border-gray-700 p-2.5 rounded text-sm text-white focus:outline-none focus:border-indigo-500">
            </div>
          </div>
          
          <div class="flex gap-2">
            <button onclick="saveRule()" id="btn-save" class="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded font-medium text-sm transition">Simpan Rule</button>
            <button onclick="resetForm()" id="btn-cancel" class="hidden bg-gray-700 hover:bg-gray-600 text-white px-5 py-2.5 rounded font-medium text-sm transition">Batal Edit</button>
          </div>
        </div>

        <div class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-700/50 text-gray-300 border-b border-gray-700">
              <tr>
                <th class="p-4">Path Target</th>
                <th class="p-4">Tipe</th>
                <th class="p-4">Hex / Target URL</th>
                <th class="p-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody id="rules-table" class="divide-y divide-gray-700"></tbody>
          </table>
        </div>
      </div>

      <script>
        let allRules = [];

        function updatePlaceholder() {
          const type = document.getElementById('type').value;
          const label = document.getElementById('payload-label');
          const input = document.getElementById('payload');
          
          if(type === 'hex') {
            label.innerText = 'Hex String';
            input.placeholder = '0a0c080110...';
          } else {
            label.innerText = 'Target URL';
            input.placeholder = 'https://loginbp.ggbluepanda.com';
          }
        }

        async function fetchRules() {
          const res = await fetch('/api/rules');
          allRules = await res.json();
          const tbody = document.getElementById('rules-table');
          
          if(!allRules || allRules.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">Belum ada rule diset.</td></tr>';
            return;
          }

          tbody.innerHTML = allRules.map(r => \`
            <tr class="hover:bg-gray-750">
              <td class="p-4 font-mono text-indigo-300 font-semibold">\${r.path}</td>
              <td class="p-4">
                <span class="px-2 py-1 \${r.type === 'hex' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'} text-xs rounded uppercase font-semibold">
                  \${r.type === 'hex' ? 'RAW HEX' : 'FORWARD URL'}
                </span>
              </td>
              <td class="p-4 font-mono text-xs text-gray-300 max-w-xs truncate">\${r.payload}</td>
              <td class="p-4 text-center">
                <div class="flex justify-center gap-3">
                  <button onclick="editRule(\${r.id})" class="text-indigo-400 hover:text-indigo-300 font-medium">Edit</button>
                  <button onclick="deleteRule(\${r.id})" class="text-red-400 hover:text-red-300 font-medium">Hapus</button>
                </div>
              </td>
            </tr>
          \`).join('');
        }

        async function saveRule() {
          const id = document.getElementById('edit-id').value;
          const path = document.getElementById('path').value;
          const type = document.getElementById('type').value;
          const payload = document.getElementById('payload').value;

          if(!path || !payload) return alert('Semua field wajib diisi!');

          if(id) {
            await fetch('/api/rules/' + id, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path, type, payload })
            });
          } else {
            await fetch('/api/rules', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path, type, payload })
            });
          }

          resetForm();
          fetchRules();
        }

        function editRule(id) {
          const rule = allRules.find(r => r.id === id);
          if(!rule) return;

          document.getElementById('edit-id').value = rule.id;
          document.getElementById('path').value = rule.path;
          document.getElementById('type').value = rule.type;
          updatePlaceholder();
          document.getElementById('payload').value = rule.payload;

          document.getElementById('form-title').innerText = 'Edit Rule';
          document.getElementById('btn-save').innerText = 'Update Rule';
          document.getElementById('btn-cancel').classList.remove('hidden');
        }

        function resetForm() {
          document.getElementById('edit-id').value = '';
          document.getElementById('path').value = '';
          document.getElementById('type').value = 'hex';
          updatePlaceholder();
          document.getElementById('payload').value = '';

          document.getElementById('form-title').innerText = 'Tambah Rule Baru';
          document.getElementById('btn-save').innerText = 'Simpan Rule';
          document.getElementById('btn-cancel').classList.add('hidden');
        }

        async function deleteRule(id) {
          if(!confirm('Yakin nak hapus rule ini bro?')) return;
          await fetch('/api/rules/' + id, { method: 'DELETE' });
          fetchRules();
        }

        fetchRules();
      </script>
    </body>
    </html>
  `);
});

// INTERCEPTOR CORE
app.use(async (req, res) => {
  if (req.path.startsWith('/api/') || req.path === '/dashboard' || req.path === '/favicon.ico') return;

  // Tarik data rules terbaru dari Redis secara real-time
  const rules = await getRulesFromRedis();

  const currentPath = req.path.toLowerCase();
  const matchedRule = rules.find(r => currentPath.includes(r.path.toLowerCase()));

  if (matchedRule) {
    // 1. Tipe Response HEX
    if (matchedRule.type === 'hex') {
      console.log(`[RAW HEX INTERCEPT] Path: ${req.path}`);
      
      const cleanHex = matchedRule.payload.replace(/[^0-9a-fA-F]/g, '');
      const hexBuffer = Buffer.from(cleanHex, 'hex');

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', hexBuffer.length);
      return res.status(200).send(hexBuffer);
    }

    // 2. Tipe Response FORWARD URL
    if (matchedRule.type === 'url') {
      console.log(`[FORWARD MATCHED] Path: ${req.path} -> ${matchedRule.payload}`);
      return forwardRequest(req, res, matchedRule.payload);
    }
  }

  // Fallback ke Target Default
  return forwardRequest(req, res, DEFAULT_TARGET);
});

async function forwardRequest(req, res, targetBase) {
  try {
    const targetUrl = `${targetBase}${req.url}`;
    const targetHost = new URL(targetBase).host;

    // Bersihkan header yang sering merusak auth/routing
    const headers = { ...req.headers };
    delete headers.host;
    delete headers['x-forwarded-for'];
    delete headers['x-real-ip'];

    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: { ...headers, host: targetHost },
      data: req.body,
      responseType: 'arraybuffer',
      maxRedirects: 0, // Disable auto-follow redirect (solusi 308/307 error)
      validateStatus: () => true, // Terima semua HTTP Status Code (200, 308, 404, dll)
    });

    // Oper header response dari server tujuan ke client
    Object.entries(response.headers).forEach(([key, value]) => {
      if (!['transfer-encoding', 'content-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    return res.status(response.status).send(response.data);
  } catch (error) {
    console.error('[FORWARD FAIL]', error.message);
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.status(502).send(Buffer.from([]));
  }
}

module.exports = app;
