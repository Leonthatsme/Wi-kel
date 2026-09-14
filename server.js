const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = process.env.PORT || 3000;
const root = __dirname;
const dataFile = path.join(root, 'data.json');
const sessions = new Map();

const initial = {
  users: [
    {
      username: 'receptie',
      passwordSalt: 'boerderij lsn-demo-salt',
      passwordHash: crypto.scryptSync('boerderij lsn2026', 'boerderij lsn-demo-salt', 64).toString('hex')
    }
  ],
  products: [
    { id: 'melk', name: 'Verse melk 1L', price: 1.75, stock: 6, active: true },
    { id: 'yoghurt', name: 'Verse yoghurt 1L', price: 1.50, stock: 3, active: true },
    { id: 'brood', name: 'Tarwe brood 1 ST.', price: 2, stock: 5, active: true },
    { id: 'ijsjes', name: 'Ola Ijs Liuk Waterijs 75 ML', price: 0.75, stock: 12, active: true },
    { id: 'frisdrank', name: 'Frisdrank', price: 1.50, stock: 0, active: true }
  ]
};

function normalizeDemoUser(data) {
  const demoPassword = 'boerderij lsn2026';
  const demoSalt = 'boerderij lsn-demo-salt';
  const demoHash = crypto.scryptSync(demoPassword, demoSalt, 64).toString('hex');

  const users = Array.isArray(data.users) ? data.users : [];
  const demoUser = users.find(user => user.username === 'receptie');

  if (demoUser) {
    demoUser.passwordSalt = demoSalt;
    demoUser.passwordHash = demoHash;
  } else {
    users.unshift({ username: 'receptie', passwordSalt: demoSalt, passwordHash: demoHash });
  }

  data.users = users;
  return data;
}

function read() {
  if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify(initial, null, 2));
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const normalized = normalizeDemoUser(data);
  if (JSON.stringify(normalized) !== fs.readFileSync(dataFile, 'utf8')) {
    write(normalized);
  }
  return normalized;
}

function write(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', part => {
      raw += part;
      if (raw.length > 10000) reject(new Error('Verzoek te groot'));
    });

    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Ongeldige JSON'));
      }
    });
  });
}

function authorized(req) {
  return sessions.has((req.headers.authorization || '').replace('Bearer ', ''));
}

function sendFile(res, file) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8'
  };

  fs.readFile(path.join(root, file), (error, content) => {
    if (error) return json(res, 404, { error: 'Niet gevonden.' });
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(content);
  });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    try {
      if (req.method === 'GET' && url.pathname === '/api/products') {
        return json(res, 200, read().products);
      }

      if (req.method === 'POST' && url.pathname === '/api/login') {
        const { username, password } = await body(req);
        const account = read().users.find(item => item.username === username);
        const hash = account && crypto.scryptSync(String(password || ''), account.passwordSalt, 64).toString('hex');

        if (!account || !crypto.timingSafeEqual(Buffer.from(account.passwordHash), Buffer.from(hash)))
          return json(res, 401, { error: 'Onjuiste inloggegevens.' });

        const token = crypto.randomBytes(24).toString('hex');
        sessions.set(token, username);
        return json(res, 200, { token, username });
      }

      if (req.method === 'POST' && url.pathname === '/api/logout') {
        sessions.delete((req.headers.authorization || '').replace('Bearer ', ''));
        return json(res, 200, { ok: true });
      }

      if (req.method === 'POST' && url.pathname === '/api/products') {
        if (!authorized(req)) return json(res, 401, { error: 'Inloggen is vereist.' });

        const { name, price, stock } = await body(req);
        if (
          typeof name !== 'string' ||
          !name.trim() ||
          name.trim().length > 36 ||
          !Number.isInteger(stock) ||
          stock < 0 ||
          stock > 9999 ||
          typeof price !== 'number' ||
          !Number.isFinite(price) ||
          price < 0 ||
          price > 9999
        )
          return json(res, 400, { error: 'Controleer de productnaam, prijs en voorraad.' });

        const data = read();
        const product = { id: crypto.randomUUID(), name: name.trim(), price: Math.round(price * 100) / 100, stock, active: true };
        data.products.push(product);
        write(data);
        return json(res, 201, product);
      }

      const match = url.pathname.match(/^\/api\/products\/(.+)$/);
      if (req.method === 'DELETE' && match) {
        if (!authorized(req)) return json(res, 401, { error: 'Inloggen is vereist.' });
        const data = read();
        const id = decodeURIComponent(match[1]);
        const index = data.products.findIndex(item => item.id === id);
        if (index === -1) return json(res, 404, { error: 'Product niet gevonden.' });
        data.products.splice(index, 1);
        write(data);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'PATCH' && match) {
        if (!authorized(req)) return json(res, 401, { error: 'Inloggen is vereist.' });

        const change = await body(req);
        const data = read();
        const id = decodeURIComponent(match[1]);
        const product = data.products.find(item => item.id === id);
        if (!product) return json(res, 404, { error: 'Product niet gevonden.' });

        if ('stock' in change && (!Number.isInteger(change.stock) || change.stock < 0 || change.stock > 9999))
          return json(res, 400, { error: 'Voorraad moet een heel getal van 0 tot 9999 zijn.' });

        if ('active' in change && typeof change.active !== 'boolean')
          return json(res, 400, { error: 'Ongeldige beschikbaarheid.' });

        if ('stock' in change) product.stock = change.stock;
        if ('active' in change) product.active = change.active;
        write(data);
        return json(res, 200, product);
      }

      if (req.method === 'GET' && url.pathname === '/') return sendFile(res, 'index.html');
      if (req.method === 'GET' && ['/beheer.html', '/app.js', '/styles.css'].includes(url.pathname)) return sendFile(res, url.pathname.slice(1));

      json(res, 404, { error: 'Niet gevonden.' });
    } catch (error) {
      json(res, 400, { error: error.message || 'Er ging iets mis.' });
    }
  })
  .listen(PORT, () => console.log(`Boerderij LSN draait op http://localhost:${PORT}`));
