'use strict';

require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const COOKIE_NAME = process.env.COOKIE_NAME || 'taaffeite_session';
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-before-deploy';
const isProduction = process.env.NODE_ENV === 'production';
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, 'uploads'));

if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must contain at least 32 characters in production.');
}

fs.mkdirSync(uploadDir, { recursive: true });

const pool = mysql.createPool({
  host: process.env.DATABASE_HOST || '127.0.0.1',
  port: Number(process.env.DATABASE_PORT || 3306),
  user: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'taaffeite_origin',
  waitForConnections: true,
  connectionLimit: Number(process.env.DATABASE_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  connectTimeout: 10000,
  timezone: 'Z',
  charset: 'utf8mb4',
  decimalNumbers: true
});

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'self'");
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const extension = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`);
    }
  }),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 8) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    cb(allowed.has(file.mimetype) ? null : new Error('Only JPG, PNG, WEBP, and GIF images are allowed.'), allowed.has(file.mimetype));
  }
});

function cleanText(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function parseToken(req) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

async function loadUser(req) {
  const payload = parseToken(req);
  if (!payload?.sub) return null;
  const [rows] = await pool.execute(
    'SELECT id, name, email, phone, role, status, must_reset_password, private_access, email_verified_at, created_at FROM users WHERE id = ? LIMIT 1',
    [payload.sub]
  );
  return rows[0] || null;
}

async function optionalAuth(req, res, next) {
  try {
    req.user = await loadUser(req);
    next();
  } catch (error) {
    next(error);
  }
}

async function requireAuth(req, res, next) {
  try {
    req.user = await loadUser(req);
    if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
    if (req.user.status === 'banned') return res.status(403).json({ error: 'This account has been banned.' });
    next();
  } catch (error) {
    next(error);
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Administrator access is required.' });
  next();
}

function setSession(res, user) {
  const token = jwt.sign({ sub: String(user.id), role: user.role }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

const loginAttempts = new Map();
function loginRateLimit(req, res, next) {
  const key = req.ip;
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter((time) => now - time < 15 * 60 * 1000);
  if (recent.length >= 12) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  recent.push(now);
  loginAttempts.set(key, recent);
  next();
}

async function addNotification(connection, userId, type, title, message, link = null) {
  await connection.execute(
    'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)',
    [userId, type, title, message, link]
  );
}

async function settleExpiredAuctions() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [expired] = await connection.execute(
      `SELECT a.*, g.name AS gemstone_name
       FROM auctions a JOIN gemstones g ON g.id = a.gemstone_id
       WHERE a.status = 'live' AND a.ends_at <= UTC_TIMESTAMP() FOR UPDATE`
    );
    for (const auction of expired) {
      await connection.execute("UPDATE auctions SET status = 'ended' WHERE id = ?", [auction.id]);
      const reserveMet = auction.reserve_price == null ||
        (auction.type === 'reverse' ? auction.current_price <= auction.reserve_price : auction.current_price >= auction.reserve_price);
      if (!auction.highest_bidder_id || !reserveMet) continue;
      const fee = Number((auction.current_price * auction.service_fee_percent / 100).toFixed(2));
      const total = Number((auction.current_price + fee).toFixed(2));
      const orderNumber = `TO-${new Date().getUTCFullYear()}-${String(auction.id).padStart(6, '0')}`;
      await connection.execute(
        `INSERT IGNORE INTO orders
          (order_number, user_id, auction_id, subtotal, service_fee, total, currency, due_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR))`,
        [orderNumber, auction.highest_bidder_id, auction.id, auction.current_price, fee, total, auction.currency]
      );
      await addNotification(connection, auction.highest_bidder_id, 'won', `You won ${auction.gemstone_name}`,
        auction.winner_message || 'Complete payment within 24 hours to secure your purchase.', `/checkout/${auction.id}`);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

const auctionEvents = new Map();
function broadcastAuction(auctionId, payload) {
  const clients = auctionEvents.get(String(auctionId)) || new Set();
  for (const response of clients) response.write(`event: auction\ndata: ${JSON.stringify(payload)}\n\n`);
}

const auctionSelect = `
  SELECT a.id, a.type, a.visibility, a.status, a.starting_price, a.current_price,
    a.reserve_price, a.buy_now_price, a.minimum_increment, a.entry_fee,
    a.service_fee_percent, a.currency, a.starts_at, a.ends_at, a.featured,
    a.highest_bidder_id, g.id AS gemstone_id, g.product_code, g.name, g.slug,
    g.description, g.story, g.weight_carats, g.dimensions, g.treatment,
    g.cut_shape, g.colour, g.origin, g.certification_lab, g.certificate_number,
    g.primary_image, c.name AS category, c.slug AS category_slug,
    (SELECT COUNT(*) FROM bids b WHERE b.auction_id = a.id) AS bid_count,
    EXISTS(SELECT 1 FROM watchlists w WHERE w.auction_id = a.id AND w.user_id = ?) AS watched
  FROM auctions a
  JOIN gemstones g ON g.id = a.gemstone_id
  LEFT JOIN categories c ON c.id = g.category_id`;

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1 AS connected');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.post('/api/setup/admin', loginRateLimit, async (req, res, next) => {
  try {
    const [existing] = await pool.query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
    if (existing[0].count > 0) return res.status(409).json({ error: 'An administrator already exists.' });
    if (!process.env.SETUP_TOKEN || req.body.setupToken !== process.env.SETUP_TOKEN) {
      return res.status(403).json({ error: 'The setup token is not valid.' });
    }
    const name = cleanText(req.body.name, 120);
    const email = cleanText(req.body.email, 190).toLowerCase();
    const password = String(req.body.password || '');
    if (!name || !validEmail(email) || password.length < 10) {
      return res.status(400).json({ error: 'Enter a name, valid email, and a password of at least 10 characters.' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      "INSERT INTO users (name, email, password_hash, role, email_verified_at) VALUES (?, ?, ?, 'admin', UTC_TIMESTAMP())",
      [name, email, passwordHash]
    );
    const user = { id: result.insertId, name, email, role: 'admin' };
    setSession(res, user);
    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/register', loginRateLimit, async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 120);
    const email = cleanText(req.body.email, 190).toLowerCase();
    const password = String(req.body.password || '');
    if (name.length < 2 || !validEmail(email) || password.length < 8) {
      return res.status(400).json({ error: 'Enter your name, a valid email, and a password of at least 8 characters.' });
    }
    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing.length) return res.status(409).json({ error: 'An account already exists for this email.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [name, email, passwordHash]
    );
    const user = { id: result.insertId, name, email, role: 'bidder', status: 'active', private_access: 'none' };
    setSession(res, user);
    res.status(201).json({ user });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'An account already exists for this email.' });
    next(error);
  }
});

app.post('/api/auth/login', loginRateLimit, async (req, res, next) => {
  try {
    const email = cleanText(req.body.email, 190).toLowerCase();
    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    if (user.status === 'banned') return res.status(403).json({ error: 'This account has been banned.' });
    await pool.execute('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [user.id]);
    setSession(res, user);
    delete user.password_hash;
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

app.patch('/api/auth/me', requireAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 120);
    const phone = cleanText(req.body.phone, 40) || null;
    if (name.length < 2) return res.status(400).json({ error: 'Please enter your name.' });
    await pool.execute('UPDATE users SET name = ?, phone = ? WHERE id = ?', [name, phone, req.user.id]);
    res.json({ user: { ...req.user, name, phone } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/change-password', requireAuth, loginRateLimit, async (req, res, next) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (newPassword.length < 10) return res.status(400).json({ error: 'The new password must contain at least 10 characters.' });
    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      return res.status(401).json({ error: 'The current password is incorrect.' });
    }
    if (await bcrypt.compare(newPassword, rows[0].password_hash)) {
      return res.status(400).json({ error: 'Choose a password you have not already used.' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.execute('UPDATE users SET password_hash = ?, must_reset_password = 0 WHERE id = ?', [passwordHash, req.user.id]);
    res.json({ success: true });
  } catch (error) { next(error); }
});

app.get('/api/categories', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, name, slug FROM categories ORDER BY name');
    res.json({ categories: rows });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auctions', optionalAuth, async (req, res, next) => {
  try {
    await settleExpiredAuctions();
    const values = [req.user?.id || 0];
    const where = ["a.status <> 'draft'", "a.visibility <> 'hidden'"];
    if (req.query.private === 'true') {
      where.push("a.visibility = 'private'");
      if (req.user?.private_access !== 'approved' && req.user?.role !== 'admin') return res.json({ auctions: [], accessRequired: true });
    } else {
      where.push("a.visibility = 'public'");
    }
    if (req.query.status && ['live', 'scheduled', 'ended'].includes(req.query.status)) {
      where.push('a.status = ?');
      values.push(req.query.status);
    }
    if (req.query.category) {
      where.push('c.slug = ?');
      values.push(cleanText(req.query.category, 120));
    }
    if (req.query.search) {
      where.push('(g.name LIKE ? OR g.product_code LIKE ? OR g.colour LIKE ? OR g.origin LIKE ?)');
      const term = `%${cleanText(req.query.search, 100)}%`;
      values.push(term, term, term, term);
    }
    const orderMap = {
      popular: 'a.featured DESC, bid_count DESC, a.ends_at ASC',
      ending: 'a.ends_at ASC',
      high: 'a.current_price DESC',
      low: 'a.current_price ASC',
      newest: 'a.created_at DESC'
    };
    const orderBy = orderMap[req.query.sort] || orderMap.popular;
    const [rows] = await pool.execute(`${auctionSelect} WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT 100`, values);
    res.json({ auctions: rows });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auctions/:id', optionalAuth, async (req, res, next) => {
  try {
    await settleExpiredAuctions();
    const [rows] = await pool.execute(`${auctionSelect} WHERE a.id = ? LIMIT 1`, [req.user?.id || 0, req.params.id]);
    const auction = rows[0];
    if (!auction || auction.visibility === 'hidden') return res.status(404).json({ error: 'Auction not found.' });
    if (auction.visibility === 'private' && req.user?.private_access !== 'approved' && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Approved private collection access is required.', accessRequired: true });
    }
    const [images] = await pool.execute(
      'SELECT id, file_path, alt_text, sort_order FROM gemstone_images WHERE gemstone_id = ? ORDER BY sort_order',
      [auction.gemstone_id]
    );
    const sealed = auction.type === 'sealed' && auction.status !== 'ended' && req.user?.role !== 'admin';
    const [bidRows] = await pool.execute(
      `SELECT b.id, ${sealed ? 'NULL' : 'b.amount'} AS amount, b.source, b.created_at,
        CASE WHEN b.user_id = ? THEN 'You' ELSE CONCAT(LEFT(u.name, 1), '***') END AS bidder
       FROM bids b JOIN users u ON u.id = b.user_id WHERE b.auction_id = ?
       ORDER BY b.created_at DESC, b.id DESC LIMIT 12`,
      [req.user?.id || 0, auction.id]
    );
    if (sealed) auction.current_price = null;
    res.json({ auction: { ...auction, images, recentBids: bidRows } });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auctions/:id/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const key = String(req.params.id);
  if (!auctionEvents.has(key)) auctionEvents.set(key, new Set());
  auctionEvents.get(key).add(res);
  res.write(`event: connected\ndata: {"ok":true}\n\n`);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    auctionEvents.get(key)?.delete(res);
  });
});

app.post('/api/auctions/:id/bids', requireAuth, async (req, res, next) => {
  if (req.user.status === 'restricted') return res.status(403).json({ error: 'This account is restricted from bidding.' });
  const amount = Number(req.body.amount);
  const maximumAmount = req.body.maximumAmount ? Number(req.body.maximumAmount) : null;
  if (!Number.isFinite(amount) || amount <= 0 || (maximumAmount && maximumAmount < amount)) {
    return res.status(400).json({ error: 'Enter a valid bid and auto-bid maximum.' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT a.*, g.name AS gemstone_name FROM auctions a JOIN gemstones g ON g.id = a.gemstone_id
       WHERE a.id = ? FOR UPDATE`, [req.params.id]
    );
    const auction = rows[0];
    if (!auction) throw Object.assign(new Error('Auction not found.'), { status: 404 });
    const now = new Date();
    if (auction.status !== 'live' || now < new Date(auction.starts_at) || now >= new Date(auction.ends_at)) {
      throw Object.assign(new Error('This auction is not accepting bids.'), { status: 409 });
    }
    if (auction.visibility === 'private' && req.user.private_access !== 'approved' && req.user.role !== 'admin') {
      throw Object.assign(new Error('Private collection access is required.'), { status: 403 });
    }
    const isReverse = auction.type === 'reverse';
    const minimum = Number(auction.current_price) + Number(auction.minimum_increment);
    const maximum = Number(auction.current_price) - Number(auction.minimum_increment);
    if ((!isReverse && amount < minimum) || (isReverse && amount > maximum)) {
      throw Object.assign(new Error(isReverse ? `Your offer must be ${maximum.toFixed(2)} or less.` : `Your bid must be at least ${minimum.toFixed(2)}.`), { status: 400 });
    }
    const previousBidder = auction.highest_bidder_id;
    await connection.execute('UPDATE bids SET is_winning = 0 WHERE auction_id = ?', [auction.id]);
    const [bidResult] = await connection.execute(
      'INSERT INTO bids (auction_id, user_id, amount, source, is_winning) VALUES (?, ?, ?, ?, 1)',
      [auction.id, req.user.id, amount, maximumAmount ? 'auto' : 'manual']
    );
    if (maximumAmount && !isReverse && auction.type !== 'sealed') {
      await connection.execute(
        `INSERT INTO auto_bids (auction_id, user_id, maximum_amount) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE maximum_amount = GREATEST(maximum_amount, VALUES(maximum_amount)), active = 1`,
        [auction.id, req.user.id, maximumAmount]
      );
    }
    let winningUserId = req.user.id;
    let winningAmount = amount;
    if (!isReverse && auction.type !== 'sealed') {
      const [autoRows] = await connection.execute(
        'SELECT user_id, maximum_amount FROM auto_bids WHERE auction_id = ? AND active = 1 ORDER BY maximum_amount DESC, created_at ASC LIMIT 2',
        [auction.id]
      );
      const defender = autoRows.find((row) => row.user_id !== req.user.id);
      if (defender && defender.maximum_amount >= amount) {
        winningUserId = defender.user_id;
        winningAmount = Math.min(defender.maximum_amount, amount + auction.minimum_increment);
        await connection.execute('UPDATE bids SET is_winning = 0 WHERE id = ?', [bidResult.insertId]);
        await connection.execute(
          "INSERT INTO bids (auction_id, user_id, amount, source, is_winning) VALUES (?, ?, ?, 'auto', 1)",
          [auction.id, winningUserId, winningAmount]
        );
      }
    }
    let endsAt = new Date(auction.ends_at);
    const windowMs = auction.extension_window_minutes * 60 * 1000;
    if (endsAt.getTime() - now.getTime() <= windowMs) {
      endsAt = new Date(endsAt.getTime() + auction.extension_minutes * 60 * 1000);
    }
    await connection.execute(
      'UPDATE auctions SET current_price = ?, highest_bidder_id = ?, ends_at = ? WHERE id = ?',
      [winningAmount, winningUserId, endsAt, auction.id]
    );
    if (previousBidder && previousBidder !== winningUserId) {
      await addNotification(connection, previousBidder, 'outbid', `You were outbid on ${auction.gemstone_name}`,
        'Return to the auction to place another bid.', `/auction/${auction.id}`);
    }
    if (winningUserId !== req.user.id) {
      await addNotification(connection, req.user.id, 'outbid', `Your bid on ${auction.gemstone_name} was exceeded`,
        'An automatic bid remains ahead of you.', `/auction/${auction.id}`);
    }
    await connection.commit();
    const payload = { auctionId: auction.id, currentPrice: auction.type === 'sealed' ? null : winningAmount, highestBidderId: winningUserId, endsAt, bidCountDelta: winningUserId === req.user.id ? 1 : 2 };
    broadcastAuction(auction.id, payload);
    res.status(201).json({ success: true, bid: payload, leading: winningUserId === req.user.id });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.post('/api/auctions/:id/buy-now', requireAuth, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT * FROM auctions WHERE id = ? FOR UPDATE', [req.params.id]);
    const auction = rows[0];
    if (!auction?.buy_now_price || auction.status !== 'live') throw Object.assign(new Error('Buy Now is not available.'), { status: 409 });
    const [bidCount] = await connection.execute('SELECT COUNT(*) AS count FROM bids WHERE auction_id = ?', [auction.id]);
    if (bidCount[0].count > 0) throw Object.assign(new Error('Buy Now is no longer available after bidding begins.'), { status: 409 });
    await connection.execute("INSERT INTO bids (auction_id, user_id, amount, source, is_winning) VALUES (?, ?, ?, 'manual', 1)", [auction.id, req.user.id, auction.buy_now_price]);
    await connection.execute("UPDATE auctions SET current_price = ?, highest_bidder_id = ?, status = 'ended', ends_at = UTC_TIMESTAMP() WHERE id = ?", [auction.buy_now_price, req.user.id, auction.id]);
    const fee = Number((auction.buy_now_price * auction.service_fee_percent / 100).toFixed(2));
    const orderNumber = `TO-${new Date().getUTCFullYear()}-${String(auction.id).padStart(6, '0')}`;
    await connection.execute(
      `INSERT INTO orders (order_number, user_id, auction_id, subtotal, service_fee, total, currency, due_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR))`,
      [orderNumber, req.user.id, auction.id, auction.buy_now_price, fee, auction.buy_now_price + fee, auction.currency]
    );
    await connection.commit();
    res.status(201).json({ success: true, checkout: `/checkout/${auction.id}` });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.post('/api/watchlist/:auctionId', requireAuth, async (req, res, next) => {
  try {
    await pool.execute('INSERT IGNORE INTO watchlists (user_id, auction_id) VALUES (?, ?)', [req.user.id, req.params.auctionId]);
    res.status(201).json({ watched: true });
  } catch (error) { next(error); }
});

app.delete('/api/watchlist/:auctionId', requireAuth, async (req, res, next) => {
  try {
    await pool.execute('DELETE FROM watchlists WHERE user_id = ? AND auction_id = ?', [req.user.id, req.params.auctionId]);
    res.json({ watched: false });
  } catch (error) { next(error); }
});

app.get('/api/dashboard', requireAuth, async (req, res, next) => {
  try {
    await settleExpiredAuctions();
    const [watchlist] = await pool.execute(`${auctionSelect} JOIN watchlists ownw ON ownw.auction_id = a.id AND ownw.user_id = ? WHERE a.visibility <> 'hidden' ORDER BY ownw.created_at DESC`, [req.user.id, req.user.id]);
    const [bids] = await pool.execute(
      `SELECT b.id, b.amount, b.source, b.is_winning, b.created_at, a.id AS auction_id, a.status,
       a.ends_at, a.currency, g.name, g.primary_image
       FROM bids b JOIN auctions a ON a.id = b.auction_id JOIN gemstones g ON g.id = a.gemstone_id
       WHERE b.user_id = ? ORDER BY b.created_at DESC LIMIT 100`, [req.user.id]
    );
    const [orders] = await pool.execute(
      `SELECT o.*, g.name, g.primary_image FROM orders o JOIN auctions a ON a.id = o.auction_id
       JOIN gemstones g ON g.id = a.gemstone_id WHERE o.user_id = ? ORDER BY o.created_at DESC`, [req.user.id]
    );
    const [notifications] = await pool.execute('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.user.id]);
    res.json({ watchlist, bids, orders, notifications });
  } catch (error) { next(error); }
});

app.patch('/api/notifications/:id/read', requireAuth, async (req, res, next) => {
  try {
    await pool.execute('UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (error) { next(error); }
});

app.get('/api/orders/:auctionId', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT o.*, g.name, g.product_code, g.primary_image FROM orders o
       JOIN auctions a ON a.id = o.auction_id JOIN gemstones g ON g.id = a.gemstone_id
       WHERE o.auction_id = ? AND (o.user_id = ? OR ? = 'admin') LIMIT 1`,
      [req.params.auctionId, req.user.id, req.user.role]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Order not found.' });
    res.json({ order: rows[0] });
  } catch (error) { next(error); }
});

app.post('/api/orders/:auctionId/checkout', requireAuth, async (req, res, next) => {
  try {
    const fields = ['shippingName', 'shippingEmail', 'shippingPhone', 'address1', 'address2', 'city', 'postalCode', 'country', 'notes'];
    const data = Object.fromEntries(fields.map((field) => [field, cleanText(req.body[field], field === 'notes' ? 1000 : 190)]));
    if (!data.shippingName || !validEmail(data.shippingEmail) || !data.address1 || !data.city || !data.country) {
      return res.status(400).json({ error: 'Complete the required delivery fields.' });
    }
    const reference = cleanText(req.body.paymentReference, 120) || null;
    const [result] = await pool.execute(
      `UPDATE orders SET shipping_name=?, shipping_email=?, shipping_phone=?, shipping_address1=?, shipping_address2=?,
       shipping_city=?, shipping_postal_code=?, shipping_country=?, notes=?, payment_method='bank_transfer',
       payment_reference=?, payment_status='submitted' WHERE auction_id=? AND user_id=? AND payment_status IN ('pending','submitted')`,
      [data.shippingName, data.shippingEmail, data.shippingPhone, data.address1, data.address2 || null,
       data.city, data.postalCode || null, data.country, data.notes || null, reference, req.params.auctionId, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Payable order not found.' });
    res.json({ success: true, message: 'Your payment details were submitted for verification.' });
  } catch (error) { next(error); }
});

app.post('/api/private-access', requireAuth, async (req, res, next) => {
  try {
    if (req.user.private_access === 'approved') return res.status(409).json({ error: 'Your account already has private access.' });
    await pool.execute(
      'INSERT INTO private_access_requests (user_id, occupation, country, collection_interest) VALUES (?, ?, ?, ?)',
      [req.user.id, cleanText(req.body.occupation, 140) || null, cleanText(req.body.country, 100) || null, cleanText(req.body.interest, 2000) || null]
    );
    await pool.execute("UPDATE users SET private_access = 'pending' WHERE id = ?", [req.user.id]);
    res.status(201).json({ success: true, status: 'pending' });
  } catch (error) { next(error); }
});

app.post('/api/contact', async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 120);
    const email = cleanText(req.body.email, 190).toLowerCase();
    const subject = cleanText(req.body.subject, 180);
    const message = cleanText(req.body.message, 5000);
    if (!name || !validEmail(email) || !subject || message.length < 10) return res.status(400).json({ error: 'Complete all required contact fields.' });
    await pool.execute('INSERT INTO contact_messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)', [name, email, cleanText(req.body.phone, 40) || null, subject, message]);
    res.status(201).json({ success: true });
  } catch (error) { next(error); }
});

app.post('/api/stone-requests', optionalAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 120);
    const email = cleanText(req.body.email, 190).toLowerCase();
    const type = cleanText(req.body.gemstoneType, 100);
    if (!name || !validEmail(email) || !type) return res.status(400).json({ error: 'Name, email, and gemstone type are required.' });
    await pool.execute(
      `INSERT INTO stone_requests (user_id, name, email, gemstone_type, weight, dimensions, treatment, shape, colour, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user?.id || null, name, email, type, cleanText(req.body.weight, 80) || null, cleanText(req.body.dimensions, 100) || null,
       cleanText(req.body.treatment, 100) || null, cleanText(req.body.shape, 80) || null, cleanText(req.body.colour, 80) || null, cleanText(req.body.notes, 3000) || null]
    );
    res.status(201).json({ success: true });
  } catch (error) { next(error); }
});

app.post('/api/newsletter', async (req, res, next) => {
  try {
    const email = cleanText(req.body.email, 190).toLowerCase();
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    await pool.execute('INSERT INTO newsletter_subscribers (email) VALUES (?) ON DUPLICATE KEY UPDATE active = 1', [email]);
    res.status(201).json({ success: true });
  } catch (error) { next(error); }
});

app.get('/api/media/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const target = path.join(uploadDir, filename);
  if (!fs.existsSync(target)) return res.status(404).end();
  res.sendFile(target);
});

app.post('/api/admin/uploads', requireAuth, requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an image to upload.' });
  res.status(201).json({ path: `/api/media/${req.file.filename}` });
});

app.get('/api/admin/overview', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    await settleExpiredAuctions();
    const [[stats], [auctions], [users], [requests]] = await Promise.all([
      pool.query(`SELECT
        (SELECT COUNT(*) FROM auctions WHERE status='live') AS live_auctions,
        (SELECT COUNT(*) FROM users WHERE role='bidder') AS bidders,
        (SELECT COUNT(*) FROM bids) AS bids,
        (SELECT COALESCE(SUM(total),0) FROM orders WHERE payment_status='paid') AS revenue,
        (SELECT COUNT(*) FROM orders WHERE payment_status IN ('pending','submitted')) AS pending_orders`),
      pool.query(`SELECT a.id, a.status, a.visibility, a.type, a.current_price, a.currency, a.starts_at, a.ends_at,
        a.featured, g.name, g.product_code, (SELECT COUNT(*) FROM bids b WHERE b.auction_id=a.id) AS bid_count
        FROM auctions a JOIN gemstones g ON g.id=a.gemstone_id ORDER BY a.created_at DESC`),
      pool.query(`SELECT id, name, email, role, status, private_access, created_at, last_login_at FROM users ORDER BY created_at DESC LIMIT 200`),
      pool.query(`SELECT r.*, u.name, u.email FROM private_access_requests r JOIN users u ON u.id=r.user_id WHERE r.status='pending' ORDER BY r.created_at`)
    ]);
    res.json({ stats: stats[0], auctions, users, accessRequests: requests });
  } catch (error) { next(error); }
});

app.get('/api/admin/auctions/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    await settleExpiredAuctions();
    const [rows] = await pool.execute(
      `SELECT a.id, a.type, a.visibility, a.status, a.starting_price, a.current_price,
        a.reserve_price, a.buy_now_price, a.minimum_increment, a.entry_fee,
        a.service_fee_percent, a.currency, a.starts_at, a.ends_at,
        a.extension_minutes, a.extension_window_minutes, a.featured, a.winner_message,
        a.highest_bidder_id, a.created_at, a.updated_at,
        g.id AS gemstone_id, g.product_code, g.name, g.description, g.weight_carats,
        g.dimensions, g.treatment, g.cut_shape, g.colour, g.origin,
        g.certification_lab, g.certificate_number, g.primary_image,
        c.name AS category,
        leader.name AS leader_name, leader.email AS leader_email,
        leader.phone AS leader_phone, leader.status AS leader_status,
        (SELECT COUNT(*) FROM bids b WHERE b.auction_id = a.id) AS bid_count,
        (SELECT COUNT(DISTINCT b.user_id) FROM bids b WHERE b.auction_id = a.id) AS unique_bidders
       FROM auctions a
       JOIN gemstones g ON g.id = a.gemstone_id
       LEFT JOIN categories c ON c.id = g.category_id
       LEFT JOIN users leader ON leader.id = a.highest_bidder_id
       WHERE a.id = ? LIMIT 1`, [req.params.id]
    );
    const auction = rows[0];
    if (!auction) return res.status(404).json({ error: 'Auction not found.' });
    const [bids] = await pool.execute(
      `SELECT b.id, b.amount, b.source, b.is_winning, b.created_at,
        u.id AS user_id, u.name AS bidder_name, u.email AS bidder_email,
        u.phone AS bidder_phone, u.status AS bidder_status,
        CASE WHEN b.is_winning = 1 THEN 'leading' ELSE 'outbid' END AS bid_state
       FROM bids b JOIN users u ON u.id = b.user_id
       WHERE b.auction_id = ? ORDER BY b.created_at DESC, b.id DESC`, [req.params.id]
    );
    const [autoBids] = await pool.execute(
      `SELECT ab.id, ab.maximum_amount, ab.active, ab.created_at, ab.updated_at,
        u.id AS user_id, u.name AS bidder_name, u.email AS bidder_email
       FROM auto_bids ab JOIN users u ON u.id = ab.user_id
       WHERE ab.auction_id = ? ORDER BY ab.maximum_amount DESC`, [req.params.id]
    );
    const [orders] = await pool.execute(
      `SELECT id, order_number, subtotal, service_fee, total, currency, payment_status,
        fulfillment_status, due_at, created_at FROM orders WHERE auction_id = ? LIMIT 1`, [req.params.id]
    );
    const reserveMet = auction.reserve_price == null ||
      (auction.type === 'reverse' ? auction.current_price <= auction.reserve_price : auction.current_price >= auction.reserve_price);
    res.json({ auction: { ...auction, reserve_met: reserveMet }, bids, autoBids, order: orders[0] || null, serverTime: new Date().toISOString() });
  } catch (error) { next(error); }
});

app.post('/api/admin/auctions', requireAuth, requireAdmin, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const gem = req.body.gemstone || {};
    const auction = req.body.auction || {};
    if (!cleanText(gem.name, 160) || !cleanText(gem.productCode, 40) || !Number(auction.startingPrice)) {
      throw Object.assign(new Error('Gemstone name, product code, and starting price are required.'), { status: 400 });
    }
    const slugBase = cleanText(gem.name, 160).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const slug = `${slugBase}-${crypto.randomBytes(3).toString('hex')}`;
    const [gemResult] = await connection.execute(
      `INSERT INTO gemstones (category_id, product_code, name, slug, description, story, weight_carats, dimensions,
       treatment, cut_shape, colour, origin, certification_lab, certificate_number, primary_image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [gem.categoryId || null, cleanText(gem.productCode, 40), cleanText(gem.name, 160), slug,
       cleanText(gem.description, 5000) || null, cleanText(gem.story, 8000) || null, Number(gem.weightCarats) || null,
       cleanText(gem.dimensions, 100) || null, cleanText(gem.treatment, 100) || null, cleanText(gem.cutShape, 80) || null,
       cleanText(gem.colour, 80) || null, cleanText(gem.origin, 120) || null, cleanText(gem.certificationLab, 140) || null,
       cleanText(gem.certificateNumber, 100) || null, cleanText(gem.primaryImage, 500) || '/assets/violet-taaffeite.jpg']
    );
    const start = new Date(auction.startsAt);
    const end = new Date(auction.endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw Object.assign(new Error('Choose valid start and end times.'), { status: 400 });
    }
    const startingPrice = Number(auction.startingPrice);
    const [auctionResult] = await connection.execute(
      `INSERT INTO auctions (gemstone_id, type, visibility, status, starting_price, current_price, reserve_price,
       buy_now_price, minimum_increment, entry_fee, service_fee_percent, currency, starts_at, ends_at, featured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [gemResult.insertId, ['standard','reverse','sealed'].includes(auction.type) ? auction.type : 'standard',
       ['public','private','hidden'].includes(auction.visibility) ? auction.visibility : 'public',
       ['draft','scheduled','live'].includes(auction.status) ? auction.status : 'draft', startingPrice, startingPrice,
       Number(auction.reservePrice) || null, Number(auction.buyNowPrice) || null, Number(auction.minimumIncrement) || 1,
       Number(auction.entryFee) || 0, Number(auction.serviceFeePercent) || 0, cleanText(auction.currency, 3) || 'USD', start, end,
       auction.featured ? 1 : 0]
    );
    await connection.execute("INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES (?, 'create', 'auction', ?)", [req.user.id, auctionResult.insertId]);
    await connection.commit();
    res.status(201).json({ id: auctionResult.insertId });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally { connection.release(); }
});

app.patch('/api/admin/auctions/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const allowed = {
      status: ['draft','scheduled','live','ended','cancelled'],
      visibility: ['public','private','hidden']
    };
    const fields = [];
    const values = [];
    for (const key of ['status', 'visibility']) {
      if (req.body[key] && allowed[key].includes(req.body[key])) { fields.push(`${key} = ?`); values.push(req.body[key]); }
    }
    if (typeof req.body.featured === 'boolean') { fields.push('featured = ?'); values.push(req.body.featured ? 1 : 0); }
    if (req.body.endsAt && !Number.isNaN(new Date(req.body.endsAt).getTime())) { fields.push('ends_at = ?'); values.push(new Date(req.body.endsAt)); }
    if (!fields.length) return res.status(400).json({ error: 'No valid changes were supplied.' });
    values.push(req.params.id);
    await pool.execute(`UPDATE auctions SET ${fields.join(', ')} WHERE id = ?`, values);
    await pool.execute("INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata) VALUES (?, 'update', 'auction', ?, ?)", [req.user.id, req.params.id, JSON.stringify(req.body)]);
    res.json({ success: true });
  } catch (error) { next(error); }
});

app.patch('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const status = req.body.status;
    if (!['active','restricted','banned'].includes(status)) return res.status(400).json({ error: 'Invalid user status.' });
    await pool.execute("UPDATE users SET status = ? WHERE id = ? AND role <> 'admin'", [status, req.params.id]);
    res.json({ success: true });
  } catch (error) { next(error); }
});

app.patch('/api/admin/private-access/:id', requireAuth, requireAdmin, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const status = req.body.status;
    if (!['approved','declined'].includes(status)) return res.status(400).json({ error: 'Choose approved or declined.' });
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT user_id FROM private_access_requests WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!rows[0]) throw Object.assign(new Error('Request not found.'), { status: 404 });
    await connection.execute('UPDATE private_access_requests SET status=?, admin_notes=?, reviewed_at=UTC_TIMESTAMP(), reviewed_by=? WHERE id=?', [status, cleanText(req.body.notes, 2000) || null, req.user.id, req.params.id]);
    await connection.execute('UPDATE users SET private_access=? WHERE id=?', [status, rows[0].user_id]);
    await addNotification(connection, rows[0].user_id, 'private_access', `Private collection access ${status}`, status === 'approved' ? 'You can now explore our private collection.' : 'Contact our concierge if you would like more information.', '/private-collection');
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally { connection.release(); }
});

app.get('/api/admin/export/bids.csv', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT b.id, b.auction_id, g.product_code, g.name AS gemstone, u.name AS bidder,
      u.email, b.amount, a.currency, b.source, b.is_winning, b.created_at
      FROM bids b JOIN auctions a ON a.id=b.auction_id JOIN gemstones g ON g.id=a.gemstone_id
      JOIN users u ON u.id=b.user_id ORDER BY b.created_at DESC`);
    const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const headers = ['id','auction_id','product_code','gemstone','bidder','email','amount','currency','source','is_winning','created_at'];
    const csv = [headers.join(','), ...rows.map((row) => headers.map((key) => escapeCsv(row[key])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="taaffeite-bids.csv"');
    res.send(`\ufeff${csv}`);
  } catch (error) { next(error); }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));

const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false, maxAge: isProduction ? '1d' : 0 }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  app.get('/', (req, res) => res.status(503).send('Frontend not built. Run npm run build locally and upload the dist folder.'));
}

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.message });
  const status = error.status || (error.code === 'ER_DUP_ENTRY' ? 409 : 500);
  if (status >= 500) console.error(error);
  res.status(status).json({ error: status >= 500 ? 'We are experiencing a temporary issue. Please try again shortly.' : error.message });
});

const server = app.listen(PORT, () => {
  console.log(`Taaffeite Origin listening on port ${PORT}`);
});

module.exports = { app, server, pool };
