const express = require('express');
const axios = require('axios');

const app = express();

// Database Rules di Memory (Bisa disimpen sementara)
// Format default bawaan kamu:
let rules = [
  {
    id: 1,
    path: '/PurchaseGacha',
    type: 'hex',
    payload: '0a0c080110cfdbcab003180138000a0c080110b2befcfd02180538000a0c080110b2befcfd02180138000a0c080110b2befcfd02180138000a0c080110b2befcfd0218023800620509050d0e0ab2010509050d0e0a'
  },
  {
    id: 2,
    path: '/Majorlogin',
    type: 'proxy',
    payload: 'https://loginbp.ggbluepanda.com'
  }
];

const DEFAULT_TARGET = 'https://clientbp.ggbluepanda.com';

// Parse Body JSON & Raw Buffer
app.use(express.json());
app.use(express.raw({ type: '*/*' }));

// API untuk Dashboard Management
app.get('/api/rules', (req, res) => res.json(rules));

app.post('/api/rules', (req, res) => {
  const { path, type, payload } = req.body;
  if (!path || !type || !payload) return res.status(400).json({ error: 'Field kurang lengkap!' });
  
  const newRule = { id: Date.now(), path, type, payload };
  rules.unshift(newRule);
  res.json({ success: true, rule: newRule });
});

app.delete('/api/rules/:id', (req, res) => {
  const id = parseInt(req.params.id);
  rules = rules.filter(r => r.id !== id);
  res.json({ success: true });
});

// DASHBOARD UI (HTML)
app.get('/dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Proxy Rule Dashboard</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-900 text-white p-6 font-sans">
      <div class="max-w-4xl mx-auto">
        <h1 class="text-3xl font-bold mb-2 text-indigo-400">⚡ Dynamic Proxy Dashboard</h1>
        <p class="text-gray-400 mb-6">Atur interseptor path proxy tanpa perlu edit & redeploy kodingan!</p>
        
        <!-- Form Add Rule -->
        <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-8">
          <h2 class="text-xl font-semibold mb-4 text-indigo-300">Tambah Rule Baru</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label class="block text-sm text-gray-400 mb-1">Path Target</label>
              <input type="text" id="path" placeholder="/PurchaseGacha" class="w-full bg-gray-900 border border-gray-700 p-2.5 rounded text-sm text-white">
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">Tipe Response</label>
              <select id="type" class="w-full bg-gray-900 border border-gray-700 p-2.5 rounded text-sm text-white">
                <option value="hex">Custom Hex Buffer</option>
                <option value="json">Custom JSON</option>
                <option value="proxy">Forward URL (Target Baru)</option>
              </select>
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">Payload / URL Target</label>
              <input type="text" id="payload" placeholder="0a0c08... atau https://target.com" class="w-full bg-gray-900 border border-gray-700 p-2.5 rounded text-sm text-white">
            </div>
          </div>
          <button onclick="addRule()" class="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded font-medium text-sm transition">Simpan Rule</button>
        </div>

        <!-- Rules List Table -->
        <div class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-700/50 text-gray-300 border-b border-gray-700">
              <tr>
                <th class="p-4">Path</th>
                <th class="p-4">Tipe</th>
                <th class="p-4">Payload / Target</th>
                <th class="p-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody id="rules-table" class="divide-y divide-gray-700"></tbody>
          </table>
        </div>
      </div>

      <script>
        async function fetchRules() {
          const res = await fetch('/api/rules');
          const data = await res.json();
          const tbody = document.getElementById('rules-table');
          tbody.innerHTML = data.map(r => \`
            <tr class="hover:bg-gray-750">
              <td class="p-4 font-mono text-indigo-300">\${r.path}</td>
              <td class="p-4"><span class="px-2 py-1 bg-gray-700 text-xs rounded uppercase font-semibold">\${r.type}</span></td>
              <td class="p-4 font-mono text-xs text-gray-300 max-w-xs truncate">\${r.payload}</td>
              <td class="p-4 text-center">
                <button onclick="deleteRule(\${r.id})" class="text-red-400 hover:text-red-300 font-medium">Hapus</button>
              </td>
            </tr>
          \`).join('');
        }

        async function addRule() {
          const path = document.getElementById('path').value;
          const type = document.getElementById('type').value;
          const payload = document.getElementById('payload').value;

          await fetch('/api/rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, type, payload })
          });

          document.getElementById('path').value = '';
          document.getElementById('payload').value = '';
          fetchRules();
        }

        async function deleteRule(id) {
          await fetch('/api/rules/' + id, { method: 'DELETE' });
          fetchRules();
        }

        fetchRules();
      </script>
    </body>
    </html>
  `);
});

// Dynamic Proxy Interceptor Engine
app.use(async (req, res) => {
  // Abaikan request dari UI Dashboard sendiri
  if (req.path.startsWith('/api/') || req.path === '/dashboard') return;

  // Cari apakah ada path yang match dengan rules
  const matchedRule = rules.find(r => req.path.includes(r.path));

  if (matchedRule) {
    console.log(`[MATCHED RULE] Path: ${req.path} -> Type: ${matchedRule.type}`);

    // 1. Return Custom Hex
    if (matchedRule.type === 'hex') {
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.status(200).send(Buffer.from(matchedRule.payload, 'hex'));
    }

    // 2. Return Custom JSON
    if (matchedRule.type === 'json') {
      res.setHeader('Content-Type', 'application/json');
      try {
        return res.status(200).send(JSON.parse(matchedRule.payload));
      } catch (e) {
        return res.status(200).send(matchedRule.payload);
      }
    }

    // 3. Custom Proxy Redirect
    if (matchedRule.type === 'proxy') {
      return forwardRequest(req, res, matchedRule.payload);
    }
  }

  // Fallback ke Default Target (`clientbp.ggbluepanda.com`)
  return forwardRequest(req, res, DEFAULT_TARGET);
});

async function forwardRequest(req, res, targetBase) {
  const targetUrl = `${targetBase}${req.url}`;
  const hostHeader = new URL(targetBase).host;

  try {
    const headers = { ...req.headers };
    delete headers.host;

    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: { ...headers, host: hostHeader },
      data: req.body,
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });

    Object.entries(response.headers).forEach(([key, value]) => {
      if (key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    });

    return res.status(response.status).send(response.data);
  } catch (error) {
    return res.status(502).send('Proxy Error');
  }
}

module.exports = app;
