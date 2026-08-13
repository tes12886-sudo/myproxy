const express = require('express');
const axios = require('axios');

const app = express();

// Database Rules di Memory (Default: /PurchaseGacha)
let rules = [
  {
    id: 1,
    path: '/PurchaseGacha',
    payload: '0a0c080110cfdbcab003180138000a0c080110b2befcfd02180538000a0c080110b2befcfd02180138000a0c080110b2befcfd02180138000a0c080110b2befcfd0218023800620509050d0e0ab2010509050d0e0a'
  }
];

const DEFAULT_TARGET = 'https://clientbp.ggbluepanda.com';

// Express Middleware
app.use(express.json());
app.use(express.raw({ type: '*/*' }));

// API CRUD Routes
app.get('/api/rules', (req, res) => res.json(rules));

app.post('/api/rules', (req, res) => {
  const { path, payload } = req.body;
  if (!path || !payload) return res.status(400).json({ error: 'Path & Hex Payload wajib diisi!' });
  
  const newRule = { id: Date.now(), path, payload: payload.trim() };
  rules.unshift(newRule);
  res.json({ success: true, rule: newRule });
});

app.put('/api/rules/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { path, payload } = req.body;
  
  const ruleIndex = rules.findIndex(r => r.id === id);
  if (ruleIndex !== -1) {
    rules[ruleIndex] = { id, path, payload: payload.trim() };
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Rule tidak ditemukan' });
});

app.delete('/api/rules/:id', (req, res) => {
  const id = parseInt(req.params.id);
  rules = rules.filter(r => r.id !== id);
  res.json({ success: true });
});

// DASHBOARD UI (HTML + JavaScript)
app.get('/dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Hex Proxy Dashboard</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-900 text-white p-6 font-sans">
      <div class="max-w-4xl mx-auto">
        <h1 class="text-3xl font-bold mb-2 text-indigo-400">⚡ Hex Response Interceptor</h1>
        <p class="text-gray-400 mb-6">Kelola Response Hex khusus untuk path yang kamu tentukan.</p>
        
        <!-- Form Add / Edit Rule -->
        <div class="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-8">
          <h2 id="form-title" class="text-xl font-semibold mb-4 text-indigo-300">Tambah Rule Hex Baru</h2>
          <input type="hidden" id="edit-id">
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label class="block text-sm text-gray-400 mb-1">Path Target</label>
              <input type="text" id="path" placeholder="/PurchaseGacha" class="w-full bg-gray-900 border border-gray-700 p-2.5 rounded text-sm text-white focus:outline-none focus:border-indigo-500">
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">Response Hex String</label>
              <input type="text" id="payload" placeholder="0a0c080110..." class="w-full bg-gray-900 border border-gray-700 p-2.5 rounded text-sm text-white focus:outline-none focus:border-indigo-500">
            </div>
          </div>
          
          <div class="flex gap-2">
            <button onclick="saveRule()" id="btn-save" class="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded font-medium text-sm transition">Simpan Rule</button>
            <button onclick="resetForm()" id="btn-cancel" class="hidden bg-gray-700 hover:bg-gray-600 text-white px-5 py-2.5 rounded font-medium text-sm transition">Batal Edit</button>
          </div>
        </div>

        <!-- Rules Table -->
        <div class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-700/50 text-gray-300 border-b border-gray-700">
              <tr>
                <th class="p-4">Path Target</th>
                <th class="p-4">Payload Hex</th>
                <th class="p-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody id="rules-table" class="divide-y divide-gray-700"></tbody>
          </table>
        </div>
      </div>

      <script>
        let allRules = [];

        async function fetchRules() {
          const res = await fetch('/api/rules');
          allRules = await res.json();
          const tbody = document.getElementById('rules-table');
          
          if(allRules.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-500">Belum ada rule Hex diset.</td></tr>';
            return;
          }

          tbody.innerHTML = allRules.map(r => \`
            <tr class="hover:bg-gray-750">
              <td class="p-4 font-mono text-indigo-300 font-semibold">\${r.path}</td>
              <td class="p-4 font-mono text-xs text-gray-300 max-w-md break-all">\${r.payload}</td>
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
          const payload = document.getElementById('payload').value;

          if(!path || !payload) return alert('Path dan Hex Wajib diisi!');

          if(id) {
            // Update / Edit Mode
            await fetch('/api/rules/' + id, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path, payload })
            });
          } else {
            // Add Mode
            await fetch('/api/rules', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path, payload })
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
          document.getElementById('payload').value = rule.payload;

          document.getElementById('form-title').innerText = 'Edit Rule Hex';
          document.getElementById('btn-save').innerText = 'Update Rule';
          document.getElementById('btn-cancel').classList.remove('hidden');
        }

        function resetForm() {
          document.getElementById('edit-id').value = '';
          document.getElementById('path').value = '';
          document.getElementById('payload').value = '';

          document.getElementById('form-title').innerText = 'Tambah Rule Hex Baru';
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

// PROXY ENGINE (INTERCEPTOR)
app.use(async (req, res) => {
  if (req.path.startsWith('/api/') || req.path === '/dashboard') return;

  // Cek apakah ada path yang cocok dengan rules Hex
  const matchedRule = rules.find(r => req.path.includes(r.path));

  if (matchedRule) {
    console.log(`[HEX INTERCEPTED] ${req.method} ${req.path}`);
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.status(200).send(Buffer.from(matchedRule.payload, 'hex'));
  }

  // Jika tidak match, forward request ke Default Host
  const targetUrl = `${DEFAULT_TARGET}${req.url}`;
  
  try {
    const headers = { ...req.headers };
    delete headers.host;

    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: { ...headers, host: new URL(DEFAULT_TARGET).host },
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
    return res.status(502).send('Proxy Error / Bad Gateway');
  }
});

module.exports = app;
