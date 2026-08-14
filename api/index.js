const express = require('express');
const axios = require('axios');

const app = express();

// ====================================================
// CONFIG UPSTASH REDIS
// ====================================================
const REDIS_URL = 'https://primary-sheepdog-180502.upstash.io';
const REDIS_TOKEN = 'gQAAAAAAAsEWAAIgcDI0ZmNjOGYxMDE1ZjI0YTU2ODJmM2EwNDBhMThiYmQ5YQ';

const FALLBACK_DEFAULT_TARGET = 'https://clientbp.ggbluepanda.com';
const MAX_LOGS_HISTORY = 100;

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
  if (logs.length > MAX_LOGS_HISTORY) {
    logs = logs.slice(0, MAX_LOGS_HISTORY);
  }
  await redisSet('proxy_captured_logs', logs);
}

async function getCapturedLogs() {
  return (await redisGet('proxy_captured_logs', [])) || [];
}

// ====================================================
// MIDDLEWARES
// ====================================================
app.use(express.json({ limit: '20mb' }));
app.use(express.raw({ type: '*/*', limit: '20mb' }));

// ====================================================
// API ROUTES
// ====================================================
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

app.get('/api/rules', async (req, res) => {
  const rules = await getRulesFromRedis();
  res.json(rules);
});

app.post('/api/rules', async (req, res) => {
  let { path, type, payload } = req.body || {};
  if (!path || !type || !payload) return res.status(400).json({ error: 'Semua field wajib diisi!' });

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

// BULK DELETE RULES
app.post('/api/rules/bulk-delete', async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Daftar ID tidak valid!' });
  }

  let rules = await getRulesFromRedis();
  const idSet = new Set(ids.map(id => parseInt(id)));
  rules = rules.filter(r => !idSet.has(r.id));

  await saveRulesToRedis(rules);
  res.json({ success: true, count: ids.length });
});

// LOGS API
app.get('/api/logs', async (req, res) => {
  const logs = await getCapturedLogs();
  res.json(logs);
});

app.delete('/api/logs', async (req, res) => {
  await redisSet('proxy_captured_logs', []);
  res.json({ success: true });
});

// BULK DELETE LOGS
app.post('/api/logs/bulk-delete', async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Daftar ID tidak valid!' });
  }

  let logs = await getCapturedLogs();
  const idSet = new Set(ids.map(String));
  logs = logs.filter(l => !idSet.has(String(l.id)));

  await redisSet('proxy_captured_logs', logs);
  res.json({ success: true, count: ids.length });
});

// ====================================================
// DASHBOARD UI (GLASSMORPHISM + MULTI-SELECT DELETE)
// ====================================================
app.get('/dashboard', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>⚡ Hex Interceptor & Rule Manager</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        .glass-card {
          background: rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }
        .glass-input {
          background: rgba(15, 23, 42, 0.5);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .glass-input:focus {
          border-color: rgba(129, 140, 248, 0.6);
          box-shadow: 0 0 15px rgba(99, 102, 241, 0.25);
        }
        .custom-checkbox {
          accent-color: #6366f1;
          width: 1rem;
          height: 1rem;
          cursor: pointer;
        }
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        ::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.2);
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      </style>
    </head>
    <body class="bg-gradient-to-br from-slate-950 via-[#0a0f1d] to-[#120e2e] text-slate-100 min-h-screen p-4 md:p-8 font-sans antialiased relative selection:bg-indigo-500 selection:text-white">
      
      <!-- Ambient Glows -->
      <div class="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/15 rounded-full blur-[130px] pointer-events-none -z-10"></div>
      <div class="fixed bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-emerald-600/10 rounded-full blur-[140px] pointer-events-none -z-10"></div>

      <div class="max-w-6xl mx-auto space-y-6">
        
        <!-- HEADER -->
        <div class="glass-card rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400 bg-clip-text text-transparent">
              ⚡ Realtime Hex Proxy Interceptor
            </h1>
            <p class="text-slate-400 text-xs md:text-sm mt-1">Multi-Select Bulk Delete • Import Rules • 1-Click Convert</p>
          </div>
          
          <div class="flex items-center gap-3 self-start md:self-auto">
            <div class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-700/50 text-xs text-slate-300">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Sync: <b id="timer-count" class="text-emerald-400 font-mono font-bold">10s</b></span>
            </div>
            <button onclick="manualRefresh()" class="p-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 text-xs transition duration-200">
              🔄 Sync Now
            </button>
          </div>
        </div>

        <!-- TARGET DEFAULT URL -->
        <div class="glass-card p-5 md:p-6 rounded-2xl">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-emerald-400 text-base">🎯</span>
            <h2 class="text-sm font-semibold tracking-wide uppercase text-emerald-400">Default Target URL Forwarder</h2>
          </div>
          <div class="flex flex-col sm:flex-row gap-3">
            <input type="text" id="default-target-input" placeholder="https://clientbp.ggbluepanda.com" class="glass-input flex-1 p-3 rounded-xl text-sm text-white focus:outline-none transition">
            <button onclick="saveTarget()" class="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium px-6 py-3 rounded-xl text-sm transition shadow-lg shadow-emerald-950/40">
              Simpan Target
            </button>
          </div>
        </div>

        <!-- FORM INTERCEPT RULES & FILE IMPORTER -->
        <div class="glass-card p-5 md:p-6 rounded-2xl" id="rule-form-section">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div class="flex items-center gap-2">
              <span class="text-indigo-400 text-base">🛠️</span>
              <h2 id="form-title" class="text-sm font-semibold tracking-wide uppercase text-indigo-300">Tambah Rule Baru</h2>
            </div>
            
            <div class="flex items-center gap-2">
              <label class="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-200 text-xs font-medium transition">
                <span>📁</span>
                <span>Import dari File (.hex / .txt)</span>
                <input type="file" id="file-import" accept=".hex,.txt" class="hidden" onchange="handleFileImport(event)">
              </label>
            </div>
          </div>

          <input type="hidden" id="edit-id">
          
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1.5">Path Endpoint</label>
              <input type="text" id="path" placeholder="/PurchaseGacha" class="glass-input w-full p-2.5 rounded-xl text-sm text-white focus:outline-none transition">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1.5">Tipe Response</label>
              <select id="type" onchange="updatePlaceholder()" class="glass-input w-full p-2.5 rounded-xl text-sm text-white focus:outline-none transition">
                <option value="hex" class="bg-slate-900 text-white">Custom Hex Buffer</option>
                <option value="url" class="bg-slate-900 text-white">Forward Target URL</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1.5" id="payload-label">Hex String (Auto Clean Spasi)</label>
              <input type="text" id="payload" oninput="cleanHexInput(this)" placeholder="0a0c080110..." class="glass-input w-full p-2.5 rounded-xl text-sm text-white font-mono focus:outline-none transition">
            </div>
          </div>
          
          <div class="flex gap-2">
            <button onclick="saveRule()" id="btn-save" class="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition shadow-lg shadow-indigo-950/40">
              Simpan Rule
            </button>
            <button onclick="resetForm()" id="btn-cancel" class="hidden glass-card hover:bg-white/10 text-slate-300 px-5 py-2.5 rounded-xl font-medium text-sm transition">
              Batal Edit
            </button>
          </div>
        </div>

        <!-- TABLE INTERCEPT RULES -->
        <div class="glass-card rounded-2xl overflow-hidden">
          <div class="p-4 md:px-6 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.02]">
            <div class="flex items-center gap-3">
              <h3 class="font-semibold text-sm tracking-wide text-slate-200 flex items-center gap-2">
                <span>📋</span> Active Intercept Rules (<span id="rule-count">0</span>)
              </h3>
            </div>
            
            <div class="flex items-center gap-2">
              <button id="btn-bulk-delete-rules" onclick="deleteSelectedRules()" class="hidden bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs px-3 py-1.5 rounded-xl transition font-medium">
                🗑️ Hapus (<span id="selected-rules-count">0</span>) Terpilih
              </button>
              <button onclick="fetchRules()" class="text-xs text-indigo-400 hover:text-indigo-300 transition">Reload Rules</button>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-900/40 text-slate-400 text-xs uppercase font-medium border-b border-white/5">
                <tr>
                  <th class="p-4 w-10 text-center">
                    <input type="checkbox" id="select-all-rules" onchange="toggleSelectAllRules(this)" class="custom-checkbox rounded">
                  </th>
                  <th class="p-4">Path Target</th>
                  <th class="p-4">Tipe</th>
                  <th class="p-4">Hex / Forward Payload</th>
                  <th class="p-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody id="rules-table" class="divide-y divide-white/5 font-normal"></tbody>
            </table>
          </div>
        </div>

        <!-- CAPTURED RESPONSES -->
        <div class="glass-card rounded-2xl overflow-hidden">
          <div class="p-4 md:p-6 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/[0.02]">
            <div>
              <h3 class="font-semibold text-sm tracking-wide text-emerald-400 flex items-center gap-2">
                <span>📥</span> Captured Responses (<span id="log-count">0</span> Data)
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">Pilih satu atau banyak response untuk dihapus bersamaan.</p>
            </div>
            
            <div class="flex flex-wrap items-center gap-2">
              <input type="text" id="search-log" oninput="renderLogs()" placeholder="Cari Path..." class="glass-input px-3 py-1.5 rounded-xl text-xs text-white focus:outline-none transition">
              
              <button id="btn-bulk-delete-logs" onclick="deleteSelectedLogs()" class="hidden bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs px-3 py-1.5 rounded-xl transition font-medium">
                🗑️ Hapus (<span id="selected-logs-count">0</span>) Terpilih
              </button>

              <button onclick="clearLogs()" class="bg-red-500/10 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs px-3 py-1.5 rounded-xl transition">
                Hapus Semua
              </button>
            </div>
          </div>

          <div class="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-900/80 backdrop-blur text-slate-400 text-xs uppercase font-medium border-b border-white/5 sticky top-0 z-10">
                <tr>
                  <th class="p-4 w-10 text-center">
                    <input type="checkbox" id="select-all-logs" onchange="toggleSelectAllLogs(this)" class="custom-checkbox rounded">
                  </th>
                  <th class="p-4">Waktu</th>
                  <th class="p-4">Path Target</th>
                  <th class="p-4">Status</th>
                  <th class="p-4">Hex Preview (Size)</th>
                  <th class="p-4 text-center">Aksi Cepat</th>
                </tr>
              </thead>
              <tbody id="logs-table" class="divide-y divide-white/5 font-normal"></tbody>
            </table>
          </div>
        </div>

      </div>

      <script>
        let allRules = [];
        let allLogs = [];
        let selectedRuleIds = new Set();
        let selectedLogIds = new Set();
        let refreshSeconds = 10;
        let countdownTimer = null;

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
            label.innerText = 'Hex String (Auto Clean Spasi)';
            input.placeholder = '0a0c080110...';
            input.value = input.value.replace(/[^0-9a-fA-F]/g, '');
          } else {
            label.innerText = 'Target URL';
            input.placeholder = 'https://loginbp.ggbluepanda.com';
          }
        }

        // ====================================================
        // FILE IMPORTER
        // ====================================================
        function handleFileImport(event) {
          const file = event.target.files[0];
          if (!file) return;

          const fileName = file.name;
          let guessedPath = fileName.replace(/_response\.(hex|txt)$/i, '').replace(/\.(hex|txt)$/i, '');
          if (guessedPath && !guessedPath.startsWith('/')) {
            guessedPath = '/' + guessedPath;
          }

          const reader = new FileReader();

          if (fileName.endsWith('.hex')) {
            reader.onload = function(e) {
              const buffer = new Uint8Array(e.target.result);
              let hexString = '';
              for (let i = 0; i < buffer.length; i++) {
                hexString += buffer[i].toString(16).padStart(2, '0');
              }
              applyImportedData(guessedPath, hexString);
            };
            reader.readAsArrayBuffer(file);
          } else {
            reader.onload = function(e) {
              const textContent = e.target.result;
              const cleanHex = textContent.replace(/[^0-9a-fA-F]/g, '');
              applyImportedData(guessedPath, cleanHex);
            };
            reader.readAsText(file);
          }

          event.target.value = '';
        }

        function applyImportedData(guessedPath, hexData) {
          document.getElementById('type').value = 'hex';
          updatePlaceholder();

          if (guessedPath && guessedPath !== '/root') {
            document.getElementById('path').value = guessedPath;
          }
          document.getElementById('payload').value = hexData;

          document.getElementById('rule-form-section').scrollIntoView({ behavior: 'smooth' });
          alert('Berhasil mengimpor data payload! Silakan periksa path lalu klik "Simpan Rule".');
        }

        // ====================================================
        // QUICK CONVERT INTERCEPT LOG TO RULE
        // ====================================================
        function makeRuleFromLog(id) {
          const item = allLogs.find(l => l.id == id);
          if (!item) return;

          document.getElementById('edit-id').value = '';
          document.getElementById('path').value = item.path;
          document.getElementById('type').value = 'hex';
          updatePlaceholder();
          document.getElementById('payload').value = item.hex;

          document.getElementById('form-title').innerText = 'Jadikan Response Sebagai Rule Intercept';
          document.getElementById('btn-save').innerText = 'Simpan Intercept Rule Ini';
          document.getElementById('btn-cancel').classList.remove('hidden');

          document.getElementById('rule-form-section').scrollIntoView({ behavior: 'smooth' });
        }

        // ====================================================
        // TARGET LOGIC
        // ====================================================
        async function fetchTarget() {
          try {
            const res = await fetch('/api/target');
            const data = await res.json();
            document.getElementById('default-target-input').value = data.target || '';
          } catch(e) {}
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

        // ====================================================
        // RULES LOGIC & MULTI-SELECT
        // ====================================================
        async function fetchRules() {
          try {
            const res = await fetch('/api/rules');
            allRules = await res.json();
            renderRules();
          } catch(e) {}
        }

        function renderRules() {
          const tbody = document.getElementById('rules-table');
          const countEl = document.getElementById('rule-count');
          countEl.innerText = allRules.length;

          if(!allRules || allRules.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-slate-500 text-xs">Belum ada rule intercept aktif.</td></tr>';
            updateRulesSelectionUI();
            return;
          }

          tbody.innerHTML = allRules.map(r => {
            const isChecked = selectedRuleIds.has(r.id);
            return \`
              <tr class="hover:bg-white/[0.02] transition \${isChecked ? 'bg-indigo-500/10' : ''}">
                <td class="p-4 text-center">
                  <input type="checkbox" class="custom-checkbox rule-cb" value="\${r.id}" \${isChecked ? 'checked' : ''} onchange="toggleSelectRule(\${r.id}, this.checked)">
                </td>
                <td class="p-4 font-mono text-indigo-300 font-medium text-xs">\${r.path}</td>
                <td class="p-4">
                  <span class="px-2.5 py-1 \${r.type === 'hex' ? 'bg-amber-400/10 text-amber-300 border border-amber-400/20' : 'bg-blue-400/10 text-blue-300 border border-blue-400/20'} text-[10px] rounded-lg uppercase tracking-wider font-semibold">
                    \${r.type === 'hex' ? 'RAW HEX' : 'FORWARD'}
                  </span>
                </td>
                <td class="p-4 font-mono text-xs text-slate-300 max-w-xs truncate">\${r.payload}</td>
                <td class="p-4 text-center">
                  <div class="flex justify-center gap-2">
                    <button onclick="editRule(\${r.id})" class="px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs transition">Edit</button>
                    <button onclick="deleteRule(\${r.id})" class="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs transition">Hapus</button>
                  </div>
                </td>
              </tr>
            \`;
          }).join('');

          updateRulesSelectionUI();
        }

        function toggleSelectRule(id, isChecked) {
          if (isChecked) {
            selectedRuleIds.add(id);
          } else {
            selectedRuleIds.delete(id);
          }
          updateRulesSelectionUI();
        }

        function toggleSelectAllRules(masterEl) {
          if (masterEl.checked) {
            allRules.forEach(r => selectedRuleIds.add(r.id));
          } else {
            selectedRuleIds.clear();
          }
          renderRules();
        }

        function updateRulesSelectionUI() {
          const bulkBtn = document.getElementById('btn-bulk-delete-rules');
          const countSpan = document.getElementById('selected-rules-count');
          const selectAllEl = document.getElementById('select-all-rules');

          countSpan.innerText = selectedRuleIds.size;
          if (selectedRuleIds.size > 0) {
            bulkBtn.classList.remove('hidden');
          } else {
            bulkBtn.classList.add('hidden');
          }

          selectAllEl.checked = allRules.length > 0 && selectedRuleIds.size === allRules.length;
        }

        async function deleteSelectedRules() {
          const ids = Array.from(selectedRuleIds);
          if (ids.length === 0) return;
          if (!confirm(\`Yakin ingin menghapus \${ids.length} rule terpilih?\`)) return;

          await fetch('/api/rules/bulk-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
          });

          selectedRuleIds.clear();
          fetchRules();
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

          document.getElementById('rule-form-section').scrollIntoView({ behavior: 'smooth' });
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
          selectedRuleIds.delete(id);
          fetchRules();
        }

        // ====================================================
        // CAPTURED LOGS & MULTI-SELECT
        // ====================================================
        async function fetchLogs() {
          try {
            const res = await fetch('/api/logs');
            allLogs = await res.json();
            renderLogs();
          } catch(e) {}
        }

        function renderLogs() {
          const tbody = document.getElementById('logs-table');
          const countEl = document.getElementById('log-count');
          const searchKeyword = (document.getElementById('search-log').value || '').toLowerCase().trim();

          countEl.innerText = allLogs ? allLogs.length : 0;

          if(!allLogs || allLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-500 text-xs">Belum ada response yang ter-capture.</td></tr>';
            updateLogsSelectionUI([]);
            return;
          }

          const filtered = allLogs.filter(log => log.path.toLowerCase().includes(searchKeyword));

          if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-500 text-xs">Tidak ada hasil cocok.</td></tr>';
            updateLogsSelectionUI([]);
            return;
          }

          tbody.innerHTML = filtered.map(log => {
            const isChecked = selectedLogIds.has(String(log.id));
            return \`
              <tr class="hover:bg-white/[0.02] transition \${isChecked ? 'bg-indigo-500/10' : ''}">
                <td class="p-4 text-center">
                  <input type="checkbox" class="custom-checkbox log-cb" value="\${log.id}" \${isChecked ? 'checked' : ''} onchange="toggleSelectLog('\${log.id}', this.checked)">
                </td>
                <td class="p-4 text-xs text-slate-400 whitespace-nowrap">\${log.time}</td>
                <td class="p-4 font-mono text-xs text-emerald-300 font-semibold">\${log.path}</td>
                <td class="p-4 text-xs">
                  <span class="px-2 py-0.5 rounded-md \${log.status >= 200 && log.status < 300 ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'} font-mono text-[11px] font-bold">
                    \${log.status}
                  </span>
                </td>
                <td class="p-4 font-mono text-xs text-slate-300 max-w-xs truncate">\${log.hex.substring(0, 24)}... (\${log.byteLength} B)</td>
                <td class="p-4 text-center whitespace-nowrap">
                  <div class="flex items-center justify-center gap-1.5">
                    <button onclick="makeRuleFromLog('\${log.id}')" title="Gunakan sebagai Rule Intercept" class="bg-emerald-600/30 hover:bg-emerald-600 border border-emerald-500/40 text-emerald-200 text-xs px-2 py-1 rounded-lg transition font-medium">
                      ⚡ Jadi Rule
                    </button>
                    <button onclick="downloadLogById('\${log.id}', 'hex')" class="bg-indigo-600/30 hover:bg-indigo-600 border border-indigo-500/40 text-indigo-200 text-xs px-2 py-1 rounded-lg transition">
                      .hex
                    </button>
                    <button onclick="downloadLogById('\${log.id}', 'txt')" class="bg-slate-700/40 hover:bg-slate-700 border border-slate-600/40 text-slate-200 text-xs px-2 py-1 rounded-lg transition">
                      .txt
                    </button>
                  </div>
                </td>
              </tr>
            \`;
          }).join('');

          updateLogsSelectionUI(filtered);
        }

        function toggleSelectLog(id, isChecked) {
          if (isChecked) {
            selectedLogIds.add(String(id));
          } else {
            selectedLogIds.delete(String(id));
          }
          const searchKeyword = (document.getElementById('search-log').value || '').toLowerCase().trim();
          const filtered = allLogs.filter(log => log.path.toLowerCase().includes(searchKeyword));
          updateLogsSelectionUI(filtered);
        }

        function toggleSelectAllLogs(masterEl) {
          const searchKeyword = (document.getElementById('search-log').value || '').toLowerCase().trim();
          const filtered = allLogs.filter(log => log.path.toLowerCase().includes(searchKeyword));

          if (masterEl.checked) {
            filtered.forEach(l => selectedLogIds.add(String(l.id)));
          } else {
            filtered.forEach(l => selectedLogIds.delete(String(l.id)));
          }
          renderLogs();
        }

        function updateLogsSelectionUI(filteredList = []) {
          const bulkBtn = document.getElementById('btn-bulk-delete-logs');
          const countSpan = document.getElementById('selected-logs-count');
          const selectAllEl = document.getElementById('select-all-logs');

          countSpan.innerText = selectedLogIds.size;
          if (selectedLogIds.size > 0) {
            bulkBtn.classList.remove('hidden');
          } else {
            bulkBtn.classList.add('hidden');
          }

          if (filteredList.length > 0) {
            selectAllEl.checked = filteredList.every(l => selectedLogIds.has(String(l.id)));
          } else {
            selectAllEl.checked = false;
          }
        }

        async function deleteSelectedLogs() {
          const ids = Array.from(selectedLogIds);
          if (ids.length === 0) return;
          if (!confirm(\`Yakin ingin menghapus \${ids.length} response terpilih?\`)) return;

          await fetch('/api/logs/bulk-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
          });

          selectedLogIds.clear();
          fetchLogs();
        }

        async function clearLogs() {
          if(!confirm('Hapus seluruh riwayat capture?')) return;
          await fetch('/api/logs', { method: 'DELETE' });
          selectedLogIds.clear();
          fetchLogs();
        }

        function downloadLogById(id, ext) {
          const item = allLogs.find(l => l.id == id);
          if(!item) return;

          const cleanNamePath = item.path.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '') || 'root';
          const filename = \`\${cleanNamePath}_response.\${ext}\`;

          let blob;
          if (ext === 'hex') {
            const cleanHex = item.hex.replace(/[^0-9a-fA-F]/g, '');
            const bytes = new Uint8Array(cleanHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
            blob = new Blob([bytes], { type: 'application/octet-stream' });
          } else {
            blob = new Blob([item.hex], { type: 'text/plain;charset=utf-8' });
          }

          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }

        // ====================================================
        // 10s AUTO-SYNC
        // ====================================================
        function syncAll() {
          fetchLogs();
          fetchRules();
          fetchTarget();
        }

        function manualRefresh() {
          syncAll();
          refreshSeconds = 10;
          document.getElementById('timer-count').innerText = refreshSeconds + 's';
        }

        function startAutoSync() {
          syncAll();
          countdownTimer = setInterval(() => {
            refreshSeconds--;
            if (refreshSeconds <= 0) {
              syncAll();
              refreshSeconds = 10;
            }
            document.getElementById('timer-count').innerText = refreshSeconds + 's';
          }, 1000);
        }

        startAutoSync();
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
    if (matchedRule.type === 'hex') {
      console.log(`[RAW HEX INTERCEPT] Path: ${req.path}`);
      
      const cleanHex = matchedRule.payload.replace(/[^0-9a-fA-F]/g, '');
      const hexBuffer = Buffer.from(cleanHex, 'hex');

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', hexBuffer.length);
      return res.status(200).send(hexBuffer);
    }

    if (matchedRule.type === 'url') {
      console.log(`[FORWARD MATCHED] Path: ${req.path} -> ${matchedRule.payload}`);
      return forwardRequest(req, res, matchedRule.payload);
    }
  }

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

    pushCapturedLog({
      id: Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      time: new Date().toLocaleTimeString('id-ID'),
      path: req.path,
      status: response.status,
      byteLength: responseBuffer.length,
      hex: hexString
    }).catch(err => console.error('[LOG SAVE ERROR]', err.message));

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
