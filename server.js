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
    { id: 'melk', name: 'Verse melk', stock: 6, active: true, icon: 'M' },
    { id: 'yoghurt', name: 'Verse yoghurt', stock: 3, active: true, icon: 'Y' },
    { id: 'ijsjes', name: 'IJsjes', stock: 12, active: true, icon: 'I' },
    { id: 'frisdrank', name: 'Frisdrank', stock: 0, active: true, icon: 'F' }
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

        const { name, stock } = await body(req);
        if (
          typeof name !== 'string' ||
          !name.trim() ||
          name.trim().length > 36 ||
          !Number.isInteger(stock) ||
          stock < 0 ||
          stock > 9999
        )
          return json(res, 400, { error: 'Controleer de productnaam en voorraad.' });

        const data = read();
        const product = { id: crypto.randomUUID(), name: name.trim(), stock, active: true, icon: 'N' };
        data.products.push(product);
        write(data);
        return json(res, 201, product);
      }

      const match = url.pathname.match(/^\/api\/products\/([\w-]+)$/);
      if (req.method === 'DELETE' && match) {
        if (!authorized(req)) return json(res, 401, { error: 'Inloggen is vereist.' });
        const data = read();
        const index = data.products.findIndex(item => item.id === match[1]);
        if (index === -1) return json(res, 404, { error: 'Product niet gevonden.' });
        data.products.splice(index, 1);
        write(data);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'PATCH' && match) {
        if (!authorized(req)) return json(res, 401, { error: 'Inloggen is vereist.' });

        const change = await body(req);
        const data = read();
        const product = data.products.find(item => item.id === match[1]);
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
