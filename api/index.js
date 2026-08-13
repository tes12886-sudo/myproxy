const express = require('express');
const axios = require('axios');

const app = express();

// Database Rules di Memory
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
    type: 'hex',
    payload: '08b6ddf9ad3f120249441a024944220253472a046c697665428b0665794a68624763694f694a49557a49314e694973496e4e3263694936496a45694c434a30655841694f694a4b5631516966512e65794a6859324e766457353058326c6b496a6f784e7a41774e7a63354f546b354d437769626d6c6a61323568625755694f694a6b6557786a555642315357396b6357647062324a754d306c684e47646e505430694c434a756233527058334a6c5a326c7662694936496b6c45496977696247396a613139795a576470623234694f694a4a52434973496d563464475679626d467358326c6b496a6f694f4451784d6a466a4d57526a5a474d794d6d497a4f474979596a517a4e446c6d4d445a6b4d545a694e7a67694c434a6c6548526c636d3568624639306558426c496a6f304c434a776247463058326c6b496a6f784c434a6a62476c6c626e5266646d567963326c7662694936496a45754d544d774c6a4977496977695a5731316247463062334a6663324e76636d55694f6a4173496d6c7a583256746457786864473979496a706d5957787a5a53776959323931626e52796556396a6232526c496a6f69553063694c434a6c6548526c636d356862463931615751694f6a59314d7a6b304d7a6b314f444573496e4a6c5a313968646d4630595849694f6a45774d6a41774d4441774e79776963323931636d4e6c496a6f774c434a7362324e7258334a6c5a326c76626c39306157316c496a6f784e7a67324e6a41304f5441784c434a6a62476c6c626e526664486c775a5349364d69776963326c6e626d463064584a6c5832316b4e534936496a63304d6a68694d6a557a5a47566d597a45324e4441784f474d324d4452684d575669596d5a6c596d526d4969776964584e70626d6466646d567963326c76626949364d537769636d56735a57467a5a56396a61474675626d5673496a6f695957356b636d39705a434973496e4a6c6247566863325666646d567963326c7662694936496b39434e5451694c434a6c654841694f6a45334f4459324e4459314e4456392e6a44754d596e575f565645776255675366764b4a576a367270536f684268594374332d31457341354b43554880e101522468747470733a2f2f6d7970726f78792d78692d77686561742e76657263656c2e6170702f7a02080182015d63736f7665727365612e7374726f6e67686f6c642e66726565666972656d6f62696c652e636f6d3b33342e3132362e37362e34353b33342e38372e3137372e31343b33342e38372e3137302e3233303b33352e3138352e3138332e35379a010953696e6761706f7265a80191bff6d306b2011c1c5c7866645c7862361e5c786363535c7865357f505000180a321011ba011c2d5c7863355c786335105c786663665c7866377b5010001004310010c2015d63736f7665727365612e7374726f6e67686f6c642e66726565666972656d6f62696c652e636f6d3b33342e3132362e37362e34353b33342e38372e3137372e31343b33342e38372e3137302e3233303b33352e3138352e3138332e3537ca0100'
  }
];

const DEFAULT_TARGET = 'https://clientbp.ggbluepanda.com';

app.use(express.json());
app.use(express.raw({ type: '*/*', limit: '10mb' }));

// API CRUD Routes
app.get('/api/rules', (req, res) => res.json(rules));

app.post('/api/rules', (req, res) => {
  const { path, type, payload } = req.body || {};
  if (!path || !type || !payload) return res.status(400).json({ error: 'Semua field wajib diisi!' });
  
  const newRule = { id: Date.now(), path, type, payload: payload.trim() };
  rules.unshift(newRule);
  res.json({ success: true, rule: newRule });
});

app.put('/api/rules/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { path, type, payload } = req.body || {};
  
  const ruleIndex = rules.findIndex(r => r.id === id);
  if (ruleIndex !== -1) {
    rules[ruleIndex] = { id, path, type, payload: payload.trim() };
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
        <h1 class="text-3xl font-bold mb-2 text-indigo-400">⚡ Raw Hex & Proxy Dashboard</h1>
        <p class="text-gray-400 mb-6">Return Raw Hex Buffer (application/octet-stream) atau Forward URL.</p>
        
        <!-- Form Add / Edit Rule -->
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

        <!-- Rules Table -->
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

  const currentPath = req.path.toLowerCase();
  const matchedRule = rules.find(r => currentPath.includes(r.path.toLowerCase()));

  if (matchedRule) {
    if (matchedRule.type === 'hex') {
      console.log(`[RAW HEX INTERCEPT] Path: ${req.path}`);
      
      // Bersihkan string hex
      const cleanHex = matchedRule.payload.replace(/[^0-9a-fA-F]/g, '');
      const hexBuffer = Buffer.from(cleanHex, 'hex');

      // PAKSA Content-Type: application/octet-stream
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', hexBuffer.length);
      return res.status(200).send(hexBuffer);
    }

    if (matchedRule.type === 'url') {
      return forwardRequest(req, res, matchedRule.payload);
    }
  }

  return forwardRequest(req, res, DEFAULT_TARGET);
});

async function forwardRequest(req, res, targetBase) {
  try {
    const targetUrl = `${targetBase}${req.url}`;
    const targetHost = new URL(targetBase).host;

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
      validateStatus: () => true,
    });

    Object.entries(response.headers).forEach(([key, value]) => {
      if (!['transfer-encoding', 'content-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    return res.status(response.status).send(response.data);
  } catch (error) {
    console.error('[FORWARD ERROR]', error.message);
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.status(502).send(Buffer.from([]));
  }
}

module.exports = app;
