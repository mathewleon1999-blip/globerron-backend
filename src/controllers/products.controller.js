const fs = require("fs")
const path = require("path")

// AI / Semantic search dependencies
const crypto = require('crypto')

const PRODUCTS_JSON_FILE = path.join(__dirname, "../../src/products.json")
const SEMANTIC_INDEX_FILE = path.join(__dirname, "../../src/semantic-index.json")

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const raw = fs.readFileSync(filePath, 'utf8')
    if (!raw.trim()) return fallback
    return JSON.parse(raw)
  } catch (e) {
    return fallback
  }
}

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function productToDoc(p) {
  const compat = Array.isArray(p.compatibleVehicles) ? p.compatibleVehicles.join(' | ') : ''
  const fields = [
    p.name,
    p.partNumber || p.part_number,
    p.oemNumber || p.oem_number,
    p.sku,
    p.category,
    p.brand,
    p.description,
    compat,
  ]
  return normalizeText(fields.filter(Boolean).join(' '))
}

function extractQuerySignals(message) {
  const t = normalizeText(message)

  const signals = {
    tokens: t.split(' ').filter(Boolean),
    side: null, // left | right
    position: null, // front | rear
    vehicleCodes: [],
    intentParts: [],
    isSymptom: false,
  }

  // side
  if (/(\bleft\b|\blh\b|\bdriver\b)/.test(t)) signals.side = 'left'
  if (/(\bright\b|\brh\b|\bpassenger\b)/.test(t)) signals.side = 'right'

  // position
  if (/(\bfront\b|\bforward\b)/.test(t)) signals.position = 'front'
  if (/(\brear\b|\bback\b)/.test(t)) signals.position = 'rear'

  // chassis codes like w221, x5 e70 etc.
  const codeMatches = t.match(/\b[a-z]\d{2,4}\b/g) || []
  signals.vehicleCodes = Array.from(new Set(codeMatches))

  // symptom heuristics
  if (/(\bleak\b|\bleaking\b|\bsag\b|\bsagging\b|\bnoise\b|\bclunk\b|\bvibration\b|\bshake\b|\bproblem\b|\bfault\b)/.test(t)) {
    signals.isSymptom = true
  }

  // part intent keywords
  const partIntents = [
    { k: /\bair\s*strut\b|\bair\s*shock\b|\bair\s*suspension\b|\bair\s*spring\b/, v: 'air strut' },
    { k: /\bshock\b|\bstrut\b/, v: 'shock/strut' },
    { k: /\bcompressor\b|\bpump\b/, v: 'compressor' },
    { k: /\bvalve\s*block\b|\bvalveblock\b/, v: 'valve block' },
    { k: /\bcontrol\s*arm\b/, v: 'control arm' },
    { k: /\bbearing\b/, v: 'bearing' },
    { k: /\bbrake\s*pad\b|\bpads\b/, v: 'brake pads' },
    { k: /\bbrake\s*disc\b|\brotor\b/, v: 'brake disc' },
    { k: /\bfilter\b/, v: 'filter' },
  ]
  partIntents.forEach(x => { if (x.k.test(t)) signals.intentParts.push(x.v) })

  return signals
}

function buildVehicleKeyFromObj(v) {
  if (!v || typeof v !== 'object') return ''
  const make = String(v.make || '').trim()
  const model = String(v.model || '').trim()
  const year = String(v.year || '').trim()
  const engine = String(v.engine || '').trim()
  return [make, model, year, engine].filter(Boolean).join('|')
}

function scoreProductForQuery(product, queryText, signals, vehicleKey) {
  const doc = productToDoc(product)
  const q = normalizeText(queryText)

  let score = 0

  // strong match: part number exact / includes
  const pn = normalizeText(product.partNumber || product.part_number)
  if (pn && q && pn === q) score += 50
  if (pn && q && pn.includes(q)) score += 18

  // keyword overlap
  const tokens = signals.tokens || []
  for (const tok of tokens) {
    if (tok.length < 3) continue
    if (doc.includes(tok)) score += 2
  }

  // intent parts
  for (const intent of (signals.intentParts || [])) {
    if (doc.includes(normalizeText(intent))) score += 8
  }

  // chassis codes
  for (const c of (signals.vehicleCodes || [])) {
    if (doc.includes(c)) score += 6
  }

  // side/position hint
  if (signals.side && doc.includes(signals.side)) score += 3
  if (signals.position && doc.includes(signals.position)) score += 3

  // fitment boost
  const compat = Array.isArray(product.compatibleVehicles) ? product.compatibleVehicles : []
  if (vehicleKey && compat.includes(vehicleKey)) score += 25

  // small category boost if obvious
  const cat = normalizeText(product.category)
  if (signals.intentParts.some(x => x.includes('brake')) && cat.includes('brake')) score += 4
  if (signals.intentParts.some(x => x.includes('air')) && (cat.includes('suspension') || doc.includes('suspension'))) score += 4

  return score
}

function localPartFinder({ message, vehicle, products, maxResults = 8 }) {
  const signals = extractQuerySignals(message)
  const vehicleKey = buildVehicleKeyFromObj(vehicle)

  const scored = (products || [])
    .map(p => ({
      product: p,
      score: scoreProductForQuery(p, message, signals, vehicleKey),
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(20, Number(maxResults) || 8)))

  const topScore = scored[0]?.score || 0

  const results = scored.map(x => {
    const confidence = topScore ? Math.max(0.15, Math.min(0.95, x.score / topScore)) : 0.2

    const missingInfo = []
    if (!vehicle?.make || !vehicle?.model || !vehicle?.year) missingInfo.push('vehicle details')
    if (!signals.position) missingInfo.push('front or rear')
    if (!signals.side) missingInfo.push('left or right')

    return {
      id: x.product.id,
      confidence: Number(confidence.toFixed(2)),
      why: 'Matched by keywords/fitment signals from your request.',
      missingInfo,
      product: x.product,
    }
  })

  const suggestedQuestions = []
  if (!vehicle?.make || !vehicle?.model || !vehicle?.year) suggestedQuestions.push('What is the exact make/model/year/engine?')
  if (!signals.position) suggestedQuestions.push('Is it front or rear?')
  if (!signals.side) suggestedQuestions.push('Left or right side?')

  const diagnosis = signals.isSymptom
    ? 'Based on the symptom, these are the most likely matching parts. Confirm side/front-rear for best accuracy.'
    : 'Here are the closest matching parts from the catalog. Confirm side/front-rear for best accuracy.'

  return {
    understoodVehicle: vehicle || null,
    diagnosis,
    results,
    suggestedQuestions,
    mode: 'local',
  }
}

async function openaiRequestJson({ apiKey, model, messages, temperature = 0.2, max_tokens = 600 }) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens }),
  })

  if (!r.ok) {
    const t = await r.text().catch(() => '')

    // Normalize common quota/rate-limit failures so the frontend can show a clear message
    if (r.status === 429) {
      const err = new Error('AI_QUOTA_EXCEEDED')
      err.status = 429
      err.details = t
      throw err
    }

    const err = new Error(`OpenAI chat.completions failed: ${r.status} ${r.statusText}`)
    err.status = r.status
    err.details = t
    throw err
  }

  return r.json()
}

async function openaiEmbeddings({ apiKey, model, input }) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input }),
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    const err = new Error(`OpenAI embeddings failed: ${r.status} ${r.statusText}`)
    err.details = t
    throw err
  }
  const json = await r.json()
  return json.data?.map(d => d.embedding) || []
}

async function geminiRequestJson({ apiKey, model, system, userJson, catalogJson, temperature = 0.2, maxOutputTokens = 900 }) {
  // Gemini API (Google AI Studio key)
  // Endpoint docs: https://ai.google.dev/gemini-api/docs
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

  // We force JSON-only output via system instruction + response_mime_type.
  const prompt = `${system}\n\nREQUEST_JSON=${userJson}\n\nCATALOG_JSON=${catalogJson}`

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: 'application/json',
      },
    }),
  })

  if (!r.ok) {
    const t = await r.text().catch(() => '')
    // Gemini uses 429 for rate/insufficient quota; normalize similar to OpenAI path
    if (r.status === 429) {
      const err = new Error('AI_QUOTA_EXCEEDED')
      err.status = 429
      err.details = t
      throw err
    }
    const err = new Error(`Gemini generateContent failed: ${r.status} ${r.statusText}`)
    err.status = r.status
    err.details = t
    throw err
  }

  const json = await r.json().catch(() => ({}))
  const text = json.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || ''
  return { raw: json, text: String(text || '').trim() }
}

function dot(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

function norm(a) {
  return Math.sqrt(dot(a, a))
}

function cosineSim(a, b) {
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return 0
  return dot(a, b) / (na * nb)
}

const getAllProducts = async (req, res) => {
  const file = PRODUCTS_JSON_FILE
  try {
    const data = fs.readFileSync(file, "utf8")
    const products = JSON.parse(data)
    res.json(products)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Failed to load products" })
  }
}

const getProductById = async (req, res) => {
  const { id } = req.params

  // Prefer DB when available
  if (typeof pool !== 'undefined' && pool?.query) {
    const result = await pool.query(
      "SELECT * FROM products WHERE id = $1",
      [id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" })
    }

    return res.json(result.rows[0])
  }

  // Fallback to products.json
  const products = readJsonSafe(PRODUCTS_JSON_FILE, [])
  const pidNum = Number(id)
  const found = products.find(p => Number(p.id) === pidNum) || products.find(p => String(p.id) === String(id))
  if (!found) return res.status(404).json({ message: "Product not found" })
  return res.json(found)
}

const createProduct = async (req, res) => {
  // This project primarily uses products.json CRUD in src/app.js (with image upload, extra fields).
  // Keep DB CRUD only when pool is configured.
  if (!(typeof pool !== 'undefined' && pool?.query)) {
    return res.status(501).json({ error: 'DB products CRUD is not configured in this deployment. Use the existing JSON-based /api/products endpoints in app.js.' })
  }

  const { name, sku, price, category, compatibleVehicles, inStock } = req.body

  const result = await pool.query(
    `INSERT INTO products
     (name, sku, price, category, compatible_vehicles, in_stock)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      name,
      sku,
      price,
      category,
      compatibleVehicles,
      inStock ?? true
    ]
  )

  res.status(201).json(result.rows[0])
}

const updateProduct = async (req, res) => {
  if (!(typeof pool !== 'undefined' && pool?.query)) {
    return res.status(501).json({ error: 'DB products CRUD is not configured in this deployment. Use the existing JSON-based /api/products endpoints in app.js.' })
  }

  const { id } = req.params
  const fields = req.body

  const result = await pool.query(
    `UPDATE products
     SET
       name = COALESCE($1, name),
       sku = COALESCE($2, sku),
       price = COALESCE($3, price),
       category = COALESCE($4, category),
       compatible_vehicles = COALESCE($5, compatible_vehicles),
       in_stock = COALESCE($6, in_stock)
     WHERE id = $7
     RETURNING *`,
    [
      fields.name,
      fields.sku,
      fields.price,
      fields.category,
      fields.compatibleVehicles,
      fields.inStock,
      id
    ]
  )

  if (result.rows.length === 0) {
    return res.status(404).json({ message: "Product not found" })
  }

  res.json(result.rows[0])
}

const deleteProduct = async (req, res) => {
  if (!(typeof pool !== 'undefined' && pool?.query)) {
    return res.status(501).json({ error: 'DB products CRUD is not configured in this deployment. Use the existing JSON-based /api/products endpoints in app.js.' })
  }

  const { id } = req.params
  const result = await pool.query(
    "DELETE FROM products WHERE id = $1 RETURNING *",
    [id]
  )

  if (result.rows.length === 0) {
    return res.status(404).json({ message: "Product not found" })
  }

  res.json(result.rows[0])
}

const computeStockStatus = (row) => {
  const qty = Number(row.stock_qty || 0)
  const lead = Number(row.lead_time_days || 0)
  const incoming = row.incoming_date
  if (qty > 0) return { code: 'available_today', label: 'Available today' }
  if (lead && lead <= 2) return { code: 'ships_1_2', label: 'Ships in 1 to 2 days' }
  if (incoming) return { code: 'preorder', label: `Pre order arriving ${new Date(incoming).toLocaleDateString()}` }
  return { code: 'out_of_stock', label: 'Out of stock' }
}

const searchProducts = async (req, res) => {
  // Backwards-compatible: if DB is available, use DB search; otherwise search products.json
  const q = String(req.query.q || '').trim()
  if (!q) return res.json({ exactMatches: [], compatibleAlternatives: [], betterPricedEquivalents: [], originalVsReplacement: [] })

  // Prefer DB search when pool is configured
  if (typeof pool !== 'undefined' && pool?.query) {
    // Look across part numbers and references. Assumes columns: part_number, oem_number, aftermarket_numbers (text[]), cross_refs (text[])
    const sql = `
      SELECT * FROM products
      WHERE LOWER(part_number) = LOWER($1)
         OR LOWER(oem_number) = LOWER($1)
         OR EXISTS (
           SELECT 1 FROM unnest(COALESCE(aftermarket_numbers, ARRAY[]::text[])) a WHERE LOWER(a) = LOWER($1)
         )
         OR EXISTS (
           SELECT 1 FROM unnest(COALESCE(cross_refs, ARRAY[]::text[])) c WHERE LOWER(c) = LOWER($1)
         )
         OR LOWER(part_number) LIKE LOWER($2)
         OR LOWER(oem_number) LIKE LOWER($2)
         OR EXISTS (
           SELECT 1 FROM unnest(COALESCE(aftermarket_numbers, ARRAY[]::text[])) a WHERE LOWER(a) LIKE LOWER($2)
         )
         OR EXISTS (
           SELECT 1 FROM unnest(COALESCE(cross_refs, ARRAY[]::text[])) c WHERE LOWER(c) LIKE LOWER($2)
         )
    `
    const result = await pool.query(sql, [q, `%${q}%`])
    const rows = result.rows.map(r => ({ ...r, stockStatus: computeStockStatus(r) }))

    const exact = rows.filter(r =>
      r.part_number?.toLowerCase() === q.toLowerCase() ||
      r.oem_number?.toLowerCase() === q.toLowerCase() ||
      (Array.isArray(r.aftermarket_numbers) && r.aftermarket_numbers.map(String).map(s => s.toLowerCase()).includes(q.toLowerCase())) ||
      (Array.isArray(r.cross_refs) && r.cross_refs.map(String).map(s => s.toLowerCase()).includes(q.toLowerCase()))
    )

    // compatible: same category and identical compatible_vehicles
    const fitKey = (r) => JSON.stringify((r.compatible_vehicles || []).slice().sort())
    const byCategory = (r) => r.category || 'general'
    const compatibleAlternatives = []
    const betterPricedEquivalents = []
    const originalVsReplacement = []

    if (exact.length) {
      const base = exact[0]
      const allSameGroup = (await pool.query(
        'SELECT * FROM products WHERE category = $1',
        [byCategory(base)]
      )).rows

      allSameGroup
        .filter(r => r.id !== base.id && fitKey(r) === fitKey(base))
        .forEach(r => {
          const enriched = { ...r, stockStatus: computeStockStatus(r) }
          if (Number(r.price) && Number(base.price) && Number(r.price) < Number(base.price)) betterPricedEquivalents.push(enriched)
          else compatibleAlternatives.push(enriched)
          if ((r.is_oem ?? (r.oem_number != null)) !== (base.is_oem ?? (base.oem_number != null))) originalVsReplacement.push(enriched)
        })
    }

    // Annotate matchType for exact rows
    const exactMatches = exact.map(r => ({ ...r, matchType: 'Exact' }))
    return res.json({ exactMatches, compatibleAlternatives, betterPricedEquivalents, originalVsReplacement })
  }

  // Fallback JSON search
  const products = readJsonSafe(PRODUCTS_JSON_FILE, [])
  const t = q.toLowerCase()
  const rows = products.filter(p => {
    const hay = [p.name, p.partNumber, p.part_number, p.oemNumber, p.oem_number, p.sku, p.category, p.brand]
      .filter(Boolean)
      .map(x => String(x).toLowerCase())
      .join(' | ')
    return hay.includes(t) || hay.includes(t) || hay.indexOf(t) !== -1
  })

  const exactMatches = rows.filter(p =>
    String(p.partNumber || p.part_number || '').toLowerCase() === t ||
    String(p.oemNumber || p.oem_number || '').toLowerCase() === t
  )

  return res.json({ exactMatches, compatibleAlternatives: [], betterPricedEquivalents: [], originalVsReplacement: [] })
}

const buildEmbeddingsIndex = async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return res.status(400).json({ error: 'OPENAI_API_KEY is not configured' })

    const products = readJsonSafe(PRODUCTS_JSON_FILE, [])
    if (!Array.isArray(products) || !products.length) return res.status(400).json({ error: 'No products found in products.json' })

    const docs = products.map(p => ({
      id: p.id,
      name: p.name,
      partNumber: p.partNumber || p.part_number,
      category: p.category,
      price: p.price,
      image: p.image,
      compatibleVehicles: p.compatibleVehicles,
      _doc: productToDoc(p),
    }))

    // Embed in small batches to avoid request limits
    const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
    const batchSize = Number(process.env.SEMANTIC_EMBED_BATCH || 64)

    const vectors = []
    for (let i = 0; i < docs.length; i += batchSize) {
      const slice = docs.slice(i, i + batchSize)
      const inputs = slice.map(d => d._doc)
      const embeddings = await openaiEmbeddings({ apiKey, model, input: inputs })
      embeddings.forEach((emb, idx) => {
        vectors.push({
          id: slice[idx].id,
          embedding: emb,
        })
      })
    }

    const index = {
      version: 1,
      createdAt: new Date().toISOString(),
      model,
      productsHash: crypto.createHash('sha256').update(JSON.stringify(products)).digest('hex'),
      docs: docs.map(d => {
        const { _doc, ...rest } = d
        return rest
      }),
      vectors,
    }

    fs.writeFileSync(SEMANTIC_INDEX_FILE, JSON.stringify(index, null, 2), 'utf8')
    res.json({ ok: true, count: docs.length, file: 'src/semantic-index.json', model })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to build semantic index', details: err.details || String(err.message || err) })
  }
}

const semanticSearch = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const k = Math.min(50, Math.max(1, Number(req.query.k || 12)))
    if (!q) return res.json({ query: q, results: [] })

    // Prefer local index-only search to avoid embedding calls on every keystroke.
    // If a query embedding model is required, we use OpenAI, but gracefully degrade if quota is exceeded.
    const index = readJsonSafe(SEMANTIC_INDEX_FILE, null)
    if (!index?.vectors?.length) {
      return res.status(400).json({ error: 'Semantic index not built. Call POST /api/products/semantic-index/build (admin) first.' })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return res.status(400).json({ error: 'OPENAI_API_KEY is not configured' })
    }

    const model = process.env.OPENAI_EMBEDDING_MODEL || index.model || 'text-embedding-3-small'

    let qEmb
    try {
      ;[qEmb] = await openaiEmbeddings({ apiKey, model, input: [normalizeText(q)] })
    } catch (e) {
      if (e?.status === 429 || String(e?.message || '').includes('quota')) {
        return res.status(429).json({ error: 'AI quota exceeded. Please add billing / credits to enable semantic search.' })
      }
      throw e
    }

    if (!qEmb) return res.json({ query: q, results: [] })

    const scored = index.vectors
      .map(v => ({ id: v.id, score: cosineSim(qEmb, v.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)

    const docById = new Map((index.docs || []).map(d => [d.id, d]))
    const results = scored
      .map(s => ({ ...docById.get(s.id), score: Number(s.score.toFixed(4)) }))
      .filter(r => r && r.id != null)

    res.json({ query: q, results })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Semantic search failed', details: err.details || String(err.message || err) })
  }
}

const aiPartFinder = async (req, res) => {
  try {
    const { message, vehicle, maxResults } = req.body || {}
    const userMessage = String(message || '').trim()
    if (!userMessage) return res.status(400).json({ error: 'message is required' })

    const products = readJsonSafe(PRODUCTS_JSON_FILE, [])

    // Provider switch:
    // - AI_PROVIDER=ollama -> always use local Ollama (no paid key)
    // - AI_PROVIDER=gemini -> use Google Gemini API (cloud; works everywhere if backend has internet)
    // - Otherwise, OpenAI if OPENAI_API_KEY exists, else local heuristic mode
    const provider = String(process.env.AI_PROVIDER || '').trim().toLowerCase()
    if (provider === 'ollama') {
      const baseUrl = String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim()
      const model = String(process.env.OLLAMA_MODEL || 'llama3.1').trim()

      // keep context compact: only the fields needed for matching
      const catalog = products.slice(0, 1500).map(p => ({
        id: p.id,
        name: p.name,
        partNumber: p.partNumber || p.part_number,
        oemNumber: p.oemNumber || p.oem_number,
        category: p.category,
        brand: p.brand,
        price: p.price,
        image: p.image,
        compatibleVehicles: p.compatibleVehicles || [],
        stockStatus: p.stockStatus || p.stock_status || p.inStock || p.in_stock,
      }))

      const system = `You are Globerron Part Finder Assistant for auto parts in UAE.\n\nTask: given a customer request, select the most compatible products from the provided catalog.\n\nRules:\n- Output ONLY valid JSON (no markdown).\n- Always return an object with: {"understoodVehicle": {...}, "diagnosis": "...", "results": [{"id":..., "confidence": 0-1, "why": "...", "missingInfo": [..]}], "suggestedQuestions": [..]}\n- confidence must reflect how sure you are about compatibility; if missing key info (side, front/rear, engine, chassis code, VIN), lower confidence and put missingInfo.\n- If the request is a symptom ("sagging", "leaking"), briefly diagnose and propose likely parts.\n- Prefer exact partNumber / oemNumber matches when present.\n- If vehicle is provided, filter by compatibleVehicles when possible.`

      const prompt = JSON.stringify({ message: userMessage, vehicle: vehicle || null, maxResults: maxResults || 8 })
      const fullPrompt = `${system}\n\nREQUEST_JSON=${prompt}\n\nCATALOG_JSON=${JSON.stringify(catalog)}`

      const r = await fetch(new URL('/api/generate', baseUrl).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: fullPrompt, stream: false, options: { temperature: 0.2 } }),
      })

      if (!r.ok) {
        const t = await r.text().catch(() => '')
        console.error('Ollama generate failed:', r.status, t)
        // fallback to local heuristic mode
        return res.json(localPartFinder({ message: userMessage, vehicle: vehicle || null, products, maxResults }))
      }

      const json = await r.json().catch(() => ({}))
      const text = String(json.response || '').trim()

      let parsed
      try {
        parsed = JSON.parse(text)
      } catch {
        // If model returns non-json, fallback to local mode
        return res.json(localPartFinder({ message: userMessage, vehicle: vehicle || null, products, maxResults }))
      }

      // Enrich result ids into full product objects
      const byId = new Map(products.map(p => [p.id, p]))
      const results = Array.isArray(parsed.results) ? parsed.results : []
      const enriched = results
        .slice(0, Math.min(20, Number(maxResults || 8)))
        .map(r => ({
          ...r,
          product: byId.get(r.id) || null,
        }))

      return res.json({ ...parsed, results: enriched, mode: 'ollama' })
    }

    if (provider === 'gemini') {
      const apiKey = String(process.env.GEMINI_API_KEY || '').trim()
      if (!apiKey) {
        return res.status(400).json({ error: 'GEMINI_API_KEY is not configured' })
      }

      const model = String(process.env.GEMINI_MODEL || 'gemini-1.5-flash').trim()

      // keep context compact: only the fields needed for matching
      const catalog = products.slice(0, 1500).map(p => ({
        id: p.id,
        name: p.name,
        partNumber: p.partNumber || p.part_number,
        oemNumber: p.oemNumber || p.oem_number,
        category: p.category,
        brand: p.brand,
        price: p.price,
        image: p.image,
        compatibleVehicles: p.compatibleVehicles || [],
        stockStatus: p.stockStatus || p.stock_status || p.inStock || p.in_stock,
      }))

      const system = `You are Globerron Part Finder Assistant for auto parts in UAE.\n\nTask: given a customer request, select the most compatible products from the provided catalog.\n\nRules:\n- Output ONLY valid JSON (no markdown).\n- Always return an object with: {"understoodVehicle": {...}, "diagnosis": "...", "results": [{"id":..., "confidence": 0-1, "why": "...", "missingInfo": [..]}], "suggestedQuestions": [..]}\n- confidence must reflect how sure you are about compatibility; if missing key info (side, front/rear, engine, chassis code, VIN), lower confidence and put missingInfo.\n- If the request is a symptom ("sagging", "leaking"), briefly diagnose and propose likely parts.\n- Prefer exact partNumber / oemNumber matches when present.\n- If vehicle is provided, filter by compatibleVehicles when possible.`

      const userJson = JSON.stringify({ message: userMessage, vehicle: vehicle || null, maxResults: maxResults || 8 })
      const catalogJson = JSON.stringify(catalog)

      let text
      try {
        const out = await geminiRequestJson({ apiKey, model, system, userJson, catalogJson, temperature: 0.2, maxOutputTokens: 900 })
        text = out.text
      } catch (err) {
        // Quota exceeded -> fallback to local mode
        if (err?.status === 429 || err?.message === 'AI_QUOTA_EXCEEDED' || String(err?.details || '').includes('quota')) {
          return res.json(localPartFinder({ message: userMessage, vehicle: vehicle || null, products, maxResults }))
        }
        throw err
      }

      let parsed
      try {
        parsed = JSON.parse(text)
      } catch {
        return res.json(localPartFinder({ message: userMessage, vehicle: vehicle || null, products, maxResults }))
      }

      // Enrich result ids into full product objects
      const byId = new Map(products.map(p => [p.id, p]))
      const results = Array.isArray(parsed.results) ? parsed.results : []
      const enriched = results
        .slice(0, Math.min(20, Number(maxResults || 8)))
        .map(r => ({
          ...r,
          product: byId.get(r.id) || null,
        }))

      return res.json({ ...parsed, results: enriched, mode: 'gemini' })
    }

    // If OpenAI key missing, fallback to local heuristic mode
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return res.json(localPartFinder({ message: userMessage, vehicle: vehicle || null, products, maxResults }))
    }

    // Keep context compact: send only the fields needed for matching
    const catalog = products.slice(0, 1500).map(p => ({
      id: p.id,
      name: p.name,
      partNumber: p.partNumber || p.part_number,
      oemNumber: p.oemNumber || p.oem_number,
      category: p.category,
      brand: p.brand,
      price: p.price,
      image: p.image,
      compatibleVehicles: p.compatibleVehicles || [],
      stockStatus: p.stockStatus || p.stock_status || p.inStock || p.in_stock,
    }))

    const system = `You are Globerron Part Finder Assistant for auto parts in UAE.\n\nTask: given a customer request, select the most compatible products from the provided catalog.\n\nRules:\n- Output ONLY valid JSON (no markdown).\n- Always return an object with: {"understoodVehicle": {...}, "diagnosis": "...", "results": [{"id":..., "confidence": 0-1, "why": "...", "missingInfo": [..]}], "suggestedQuestions": [..]}\n- confidence must reflect how sure you are about compatibility; if missing key info (side, front/rear, engine, chassis code, VIN), lower confidence and put missingInfo.\n- If the request is a symptom ("sagging", "leaking"), briefly diagnose and propose likely parts.\n- Prefer exact partNumber / oemNumber matches when present.\n- If vehicle is provided, filter by compatibleVehicles when possible.`

    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify({ message: userMessage, vehicle: vehicle || null, maxResults: maxResults || 8 }) },
      { role: 'user', content: `CATALOG_JSON=${JSON.stringify(catalog)}` },
    ]

    const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini'

    let resp
    try {
      resp = await openaiRequestJson({ apiKey, model, messages, temperature: 0.2, max_tokens: 800 })
    } catch (err) {
      // Quota exceeded -> fallback to local mode
      if (err?.status === 429 || err?.message === 'AI_QUOTA_EXCEEDED' || String(err?.details || '').includes('insufficient_quota')) {
        return res.json(localPartFinder({ message: userMessage, vehicle: vehicle || null, products, maxResults }))
      }
      throw err
    }

    const text = resp.choices?.[0]?.message?.content || ''

    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      // If model returns non-json, fallback to local mode
      return res.json(localPartFinder({ message: userMessage, vehicle: vehicle || null, products, maxResults }))
    }

    // Enrich result ids into full product objects
    const byId = new Map(products.map(p => [p.id, p]))
    const results = Array.isArray(parsed.results) ? parsed.results : []
    const enriched = results
      .slice(0, Math.min(20, Number(maxResults || 8)))
      .map(r => ({
        ...r,
        product: byId.get(r.id) || null,
      }))

    res.json({ ...parsed, results: enriched, mode: 'openai' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'AI Part Finder failed', details: err.details || String(err.message || err) })
  }
}

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  // AI features
  aiPartFinder,
  semanticSearch,
  buildEmbeddingsIndex,
}
