const express = require('express');
const axios = require('axios');

const app = express();

// ====================================================
// CONFIG UPSTASH REDIS
// ====================================================
const REDIS_URL = 'https://primary-sheepdog-180502.upstash.io';
const REDIS_TOKEN = 'gQAAAAAAAsEWAAIgcDI0ZmNjOGYxMDE1ZjI0YTU2ODJmM2EwNDBhMThiYmQ5YQ';

const FALLBACK_DEFAULT_TARGET = 'https://clientbp.ggbluepanda.com';

// ====================================================
// REDIS HELPERS
// ====================================================
async function redisGet(key, fallback = null) {
  try {
    const res = await axios.get(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    if (res.data && res.data.result) {
      return JSON.parse(res.data.result);
    }
  } catch (err) {
    console.error(`[REDIS READ ERROR: ${key}]`, err.message);
  }
  return fallback;
}

async function redisSet(key, value) {
  try {
    await axios.post(`${REDIS_URL}/set/${key}`, JSON.stringify(value), {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
  } catch (err) {
    console.error(`[REDIS WRITE ERROR: ${key}]`, err.message);
  }
}

async function getRulesFromRedis() {
  return (await redisGet('proxy_rules', [])) || [];
}

async function saveRulesToRedis(rules) {
  await redisSet('proxy_rules', rules);
}

async function getDefaultTarget() {
  const target = await redisGet('proxy_default_target', null);
  return target || FALLBACK_DEFAULT_TARGET;
}

async function saveDefaultTarget(target) {
  await redisSet('proxy_default_target', target.trim());
}

async function pushCapturedLog(logItem) {
  let logs = (await redisGet('proxy_captured_logs', [])) || [];
  logs.unshift(logItem);
  if (logs.length > 15) logs = logs.slice(0, 15); // Simpan 15 data respon terakhir
  await redisSet('proxy_captured_logs', logs);
}

async function getCapturedLogs() {
  return (await redisGet('proxy_captured_logs', [])) || [];
}

// ====================================================
// MIDDLEWARES
// ====================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.raw({ type: '*/*', limit: '10mb' }));

// ====================================================
// API ROUTES
// ====================================================

// Default Target API
app.get('/api/target', async (req, res) => {
  const target = await getDefaultTarget();
  res.json({ target });
});

app.post('/api/target', async (req, res) => {
  const { target } = req.body || {};
  if (!target) return res.status(400).json({ error: 'Target URL tidak boleh kosong!' });
  await saveDefaultTarget(target);
  res.json({ success: true, target });
});

// Rules API
app.get('/api/rules', async (req, res) => {
  const rules = await getRulesFromRedis();
  res.json(rules);
});

app.post('/api/rules', async (req, res) => {
  let { path, type, payload } = req.body || {};
  if (!path || !type || !payload) return res.status(400).json({ error: 'Semua field wajib diisi!' });

  // Auto clean spasi/whitespace jika tipe hex
  if (type === 'hex') {
    payload = payload.replace(/[^0-9a-fA-F]/g, '');
  }

  let rules = await getRulesFromRedis();
  const newRule = { id: Date.now(), path: path.trim(), type, payload: payload.trim() };
  rules.unshift(newRule);

  await saveRulesToRedis(rules);
  res.json({ success: true, rule: newRule });
});

app.put('/api/rules/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  let { path, type, payload } = req.body || {};

  if (type === 'hex' && payload) {
    payload = payload.replace(/[^0-9a-fA-F]/g, '');
  }

  let rules = await getRulesFromRedis();
  const ruleIndex = rules.findIndex(r => r.id === id);

  if (ruleIndex !== -1) {
    rules[ruleIndex] = { id, path: path.trim(), type, payload: payload.trim() };
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

// Logs API
app.get('/api/logs', async (req, res) => {
  const logs = await getCapturedLogs();
  res.json(logs);
});

app.delete('/api/logs', async (req, res) => {
  await redisSet('proxy_captured_logs', []);
  res.json({ success: true });
});

// ====================================================
// DASHBOARD UI
// ====================================================
app.get('/dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Realtime Hex Proxy & Capturer</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-900 text-white p-6 font-sans">
      <div class="max-w-5xl mx-auto space-y-6">
        
        <div>
          <h1 class="text-3xl font-bold text-indigo-400">⚡ Realtime Hex Proxy & Interceptor</h1>
          <p class="text-gray-400 text-sm mt-1">Simpan/Edit Rules, Real-Time Target Switcher, & Auto-Hex Response Capture.</p>
        </div>

        <!-- CONFIG TARGET DEFAULT -->
        <div class="bg-gray-800 p-5 rounded-xl border border-gray-700">
          <h2 class="text-lg font-semibold mb-3 text-emerald-400">🎯 Default Forward Target URL</h2>
          <div class="flex flex-col sm:flex-row gap-3">
            <input type="text" id="default-target-input" placeholder="https://clientbp.ggbluepanda.com" class="flex-1 bg-gray-900 border border-gray-700 p-2.5 rounded text-sm text-white focus:outline-none focus:border-emerald-500">
            <button onclick="saveTarget()" class="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded font-medium text-sm transition whitespace-nowrap">Simpan Target</button>
          </div>
        </div>

        <!-- FORM TAMBAH / EDIT RULE -->
        <div class="bg-gray-800 p-5 rounded-xl border border-gray-700">
          <h2 id="form-title" class="text-lg font-semibold mb-4 text-indigo-300">Tambah Rule Baru</h2>
          <input type="hidden" id="edit-id">
          
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label class="block text-xs text-gray-400 mb-1">Path Target</label>
              <input type="text" id="path" placeholder="/PurchaseGacha" class="w-full bg-gray-900 border border-gray-700 p-2.5 rounded text-sm text-white focus:outline-none focus:border-indigo-500">
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Tipe Response</label>
              <select id="type" onchange="updatePlaceholder()" class="w-full bg-gray-900 border border-gray-700 p-2.5 rounded text-sm text-white focus:outline-none focus:border-indigo-500">
                <option value="hex">Custom Hex Buffer</option>
                <option value="url">Forward Target URL</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1" id="payload-label">Hex String (Auto Remove Spaces)</label>
              <input type="text" id="payload" oninput="cleanHexInput(this)" placeholder="0a 0c 08 01 10..." class="w-full bg-gray-900 border border-gray-700 p-2.5 rounded text-sm text-white focus:outline-none focus:border-indigo-500">
            </div>
          </div>
          
          <div class="flex gap-2">
            <button onclick="saveRule()" id="btn-save" class="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded font-medium text-sm transition">Simpan Rule</button>
            <button onclick="resetForm()" id="btn-cancel" class="hidden bg-gray-700 hover:bg-gray-600 text-white px-5 py-2.5 rounded font-medium text-sm transition">Batal Edit</button>
          </div>
        </div>

        <!-- TABLE RULES -->
        <div class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div class="p-4 border-b border-gray-700 flex justify-between items-center">
            <h3 class="font-semibold text-gray-200">Daftar Intercept Rules</h3>
            <button onclick="fetchRules()" class="text-xs text-indigo-400 hover:underline">Refresh</button>
          </div>
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-750 text-gray-400 border-b border-gray-700">
              <tr>
                <th class="p-3">Path</th>
                <th class="p-3">Tipe</th>
                <th class="p-3">Payload (Hex / URL)</th>
                <th class="p-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody id="rules-table" class="divide-y divide-gray-700"></tbody>
          </table>
        </div>

        <!-- CAPTURED DEFAULT TARGET RESPONSES -->
        <div class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div class="p-4 border-b border-gray-700 flex justify-between items-center">
            <div>
              <h3 class="font-semibold text-emerald-400">Captured Responses (Converted to Hex)</h3>
              <p class="text-xs text-gray-400">Response asli dari target server otomatis di-capture ke bentuk HEX.</p>
            </div>
            <div class="flex gap-2">
              <button onclick="fetchLogs()" class="text-xs text-indigo-400 hover:underline">Refresh</button>
              <button onclick="clearLogs()" class="text-xs text-red-400 hover:underline">Clear</button>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-gray-750 text-gray-400 border-b border-gray-700">
                <tr>
                  <th class="p-3">Waktu</th>
                  <th class="p-3">Path</th>
                  <th class="p-3">Status</th>
                  <th class="p-3">Hex Preview (Size)</th>
                  <th class="p-3 text-center">Download</th>
                </tr>
              </thead>
              <tbody id="logs-table" class="divide-y divide-gray-700"></tbody>
            </table>
          </div>
        </div>

      </div>

      <script>
        let allRules = [];
        let allLogs = [];

        function cleanHexInput(el) {
          const type = document.getElementById('type').value;
          if(type === 'hex') {
            el.value = el.value.replace(/[^0-9a-fA-F]/g, '');
          }
        }

        function updatePlaceholder() {
          const type = document.getElementById('type').value;
          const label = document.getElementById('payload-label');
          const input = document.getElementById('payload');
          
          if(type === 'hex') {
            label.innerText = 'Hex String (Auto Remove Spaces)';
            input.placeholder = '0a0c080110...';
            input.value = input.value.replace(/[^0-9a-fA-F]/g, '');
          } else {
            label.innerText = 'Target URL';
            input.placeholder = 'https://loginbp.ggbluepanda.com';
          }
        }

        async function fetchTarget() {
          const res = await fetch('/api/target');
          const data = await res.json();
          document.getElementById('default-target-input').value = data.target || '';
        }

        async function saveTarget() {
          const target = document.getElementById('default-target-input').value;
          if(!target) return alert('Target tidak boleh kosong!');
          await fetch('/api/target', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target })
          });
          alert('Default target berhasil diupdate!');
        }

        async function fetchRules() {
          const res = await fetch('/api/rules');
          allRules = await res.json();
          const tbody = document.getElementById('rules-table');
          
          if(!allRules || allRules.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">Belum ada rule intercept.</td></tr>';
            return;
          }

          tbody.innerHTML = allRules.map(r => \`
            <tr class="hover:bg-gray-750">
              <td class="p-3 font-mono text-indigo-300 font-semibold">\${r.path}</td>
              <td class="p-3">
                <span class="px-2 py-0.5 \${r.type === 'hex' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'} text-xs rounded uppercase font-semibold">
                  \${r.type === 'hex' ? 'RAW HEX' : 'FORWARD'}
                </span>
              </td>
              <td class="p-3 font-mono text-xs text-gray-300 max-w-xs truncate">\${r.payload}</td>
              <td class="p-3 text-center">
                <div class="flex justify-center gap-3">
                  <button onclick="editRule(\${r.id})" class="text-indigo-400 hover:text-indigo-300 text-xs font-medium">Edit</button>
                  <button onclick="deleteRule(\${r.id})" class="text-red-400 hover:text-red-300 text-xs font-medium">Hapus</button>
                </div>
              </td>
            </tr>
          \`).join('');
        }

        async function saveRule() {
          const id = document.getElementById('edit-id').value;
          const path = document.getElementById('path').value;
          const type = document.getElementById('type').value;
          let payload = document.getElementById('payload').value;

          if(!path || !payload) return alert('Semua field wajib diisi!');
          if(type === 'hex') payload = payload.replace(/[^0-9a-fA-F]/g, '');

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
          if(!confirm('Hapus rule ini?')) return;
          await fetch('/api/rules/' + id, { method: 'DELETE' });
          fetchRules();
        }

        async function fetchLogs() {
          const res = await fetch('/api/logs');
          allLogs = await res.json();
          const tbody = document.getElementById('logs-table');

          if(!allLogs || allLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">Belum ada response yang ter-capture.</td></tr>';
            return;
          }

          tbody.innerHTML = allLogs.map((log, idx) => \`
            <tr class="hover:bg-gray-750">
              <td class="p-3 text-xs text-gray-400 whitespace-nowrap">\${log.time}</td>
              <td class="p-3 font-mono text-xs text-emerald-300 font-semibold">\${log.path}</td>
              <td class="p-3 text-xs"><span class="px-2 py-0.5 rounded bg-gray-700 text-white">\${log.status}</span></td>
              <td class="p-3 font-mono text-xs text-gray-300 max-w-xs truncate">\${log.hex.substring(0, 30)}... (\${log.byteLength} B)</td>
              <td class="p-3 text-center whitespace-nowrap">
                <button onclick="downloadLog(\${idx}, 'hex')" class="bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs px-2.5 py-1 rounded mr-1">.hex</button>
                <button onclick="downloadLog(\${idx}, 'txt')" class="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2.5 py-1 rounded">.txt</button>
              </td>
            </tr>
          \`).join('');
        }

        async function clearLogs() {
          await fetch('/api/logs', { method: 'DELETE' });
          fetchLogs();
        }

        function downloadLog(index, ext) {
          const item = allLogs[index];
          if(!item) return;

          // Format nama file: {namepath}_response.hex / .txt
          const cleanNamePath = item.path.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '') || 'root';
          const filename = \`\${cleanNamePath}_response.\${ext}\`;

          let blob;
          if (ext === 'hex') {
            // Download sebagai raw binary buffer
            const cleanHex = item.hex.replace(/[^0-9a-fA-F]/g, '');
            const bytes = new Uint8Array(cleanHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
            blob = new Blob([bytes], { type: 'application/octet-stream' });
          } else {
            // Download sebagai teks plain Hex String
            blob = new Blob([item.hex], { type: 'text/plain;charset=utf-8' });
          }

          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }

        // Init Data & Polling
        fetchTarget();
        fetchRules();
        fetchLogs();
        setInterval(fetchLogs, 5000); // Polling log respon setiap 5 detik
      </script>
    </body>
    </html>
  `);
});

// ====================================================
// INTERCEPTOR & PROXY CORE
// ====================================================
app.use(async (req, res) => {
  if (req.path.startsWith('/api/') || req.path === '/dashboard' || req.path === '/favicon.ico') return;

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

    // 2. Tipe Response FORWARD CUSTOM URL
    if (matchedRule.type === 'url') {
      console.log(`[FORWARD MATCHED] Path: ${req.path} -> ${matchedRule.payload}`);
      return forwardRequest(req, res, matchedRule.payload);
    }
  }

  // Fallback ke Default Target (Real-time dari Redis)
  const defaultTarget = await getDefaultTarget();
  return forwardRequest(req, res, defaultTarget);
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
      maxRedirects: 0,
      validateStatus: () => true,
    });

    const responseBuffer = Buffer.from(response.data);
    const hexString = responseBuffer.toString('hex');

    // Simpan history captured response ke Redis secara asynchronous
    pushCapturedLog({
      time: new Date().toLocaleTimeString('id-ID'),
      path: req.path,
      status: response.status,
      byteLength: responseBuffer.length,
      hex: hexString
    }).catch(err => console.error('[LOG SAVE ERROR]', err.message));

    // Teruskan header response ke client
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
