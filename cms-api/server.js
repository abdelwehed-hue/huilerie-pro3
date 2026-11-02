import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { MongoClient, ObjectId, GridFSBucket } from 'mongodb';

const required = ['MONGODB_URI', 'JWT_SECRET'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: (process.env.FRONTEND_ORIGIN || '').split(',').map(v => v.trim()).filter(Boolean), credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }));
app.use('/api/admin', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));
app.use('/api/admin/setup', rateLimit({ windowMs: 60 * 60 * 1000, limit: 3, standardHeaders: true, legacyHeaders: false }));

// Express 4 does not automatically forward rejected promises from async route handlers.
for (const method of ['get', 'post', 'put', 'delete']) {
  const register = app[method].bind(app);
  app[method] = (...args) => {
    const index = args.length - 1;
    const handler = args[index];
    if (typeof handler === 'function' && handler.constructor?.name === 'AsyncFunction') {
      args[index] = (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
    }
    return register(...args);
  };
}

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db('oroverde_cms');
const bucket = new GridFSBucket(db, { bucketName: 'site_media' });
const admins = db.collection('admins');
const content = db.collection('site_content');
const news = db.collection('news');
const products = db.collection('products');

await Promise.all([
  admins.createIndex({ email: 1 }, { unique: true }),
  news.createIndex({ status: 1, publishedAt: -1 }),
  products.createIndex({ status: 1, updatedAt: -1 }),
  content.createIndex({ key: 1 }, { unique: true }),
  admins.createIndex({ role: 1 }, { unique: true, partialFilterExpression: { role: 'admin' } })
]);

const tokenFor = admin => jwt.sign({ sub: admin._id.toString(), email: admin.email, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h', issuer: 'oro-verde-cms' });
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try {
    const data = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'oro-verde-cms' });
    if (data.role !== 'admin') throw new Error('role');
    req.admin = data;
    next();
  } catch { res.status(401).json({ error: 'Session invalide ou expirée' }); }
}
const cleanId = id => ObjectId.isValid(id) ? new ObjectId(id) : null;

app.get('/health', (_req, res) => res.json({ ok: true, service: 'oro-verde-cms-api' }));
app.get('/api/public/content', async (_req, res) => {
  const doc = await content.findOne({ key: 'main' }, { projection: { _id: 0, translations: 1, updatedAt: 1 } });
  res.json(doc || { translations: { fr: {}, ar: {}, en: {} }, updatedAt: null });
});
app.get('/api/public/news', async (_req, res) => res.json(await news.find({ status: 'published' }).sort({ publishedAt: -1 }).limit(50).project({ title: 1, summary: 1, body: 1, imageId: 1, imageUrl: 1, publishedAt: 1, translations: 1 }).toArray()));
app.get('/api/public/products', async (_req, res) => res.json(await products.find({ status: 'published' }).sort({ updatedAt: -1 }).limit(100).project({ name: 1, description: 1, imageId: 1, imageUrl: 1, translations: 1, updatedAt: 1 }).toArray()));

app.post('/api/admin/setup', async (req, res) => {
  if (!process.env.CMS_SETUP_KEY) return res.status(503).json({ error: 'Configuration initiale désactivée sur ce serveur' });
  if (await admins.countDocuments({ role: 'admin' }) > 0) return res.status(403).json({ error: 'Configuration initiale déjà effectuée' });
  const { setupKey, email, password } = req.body || {};
  if (!setupKey || setupKey !== process.env.CMS_SETUP_KEY) return res.status(403).json({ error: 'Clé de configuration incorrecte' });
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || typeof password !== 'string' || password.length < 12 || password.length > 128) return res.status(400).json({ error: 'Adresse e-mail invalide ou mot de passe requis entre 12 et 128 caractères' });
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await admins.insertOne({ email: normalizedEmail, passwordHash, createdAt: new Date(), role: 'admin' });
    const token = tokenFor({ _id: result.insertedId, email: normalizedEmail });
    res.status(201).json({ token, email: normalizedEmail });
  } catch (error) {
    if (error?.code === 11000) return res.status(403).json({ error: 'Le compte administrateur existe déjà' });
    throw error;
  }
});
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const admin = await admins.findOne({ email: normalizedEmail });
  if (!admin || !(await bcrypt.compare(String(password || ''), admin.passwordHash))) return res.status(401).json({ error: 'Identifiants incorrects' });
  res.json({ token: tokenFor(admin), email: admin.email });
});
app.get('/api/admin/me', auth, async (req, res) => res.json({ email: req.admin.email, role: 'admin' }));
app.get('/api/admin/content', auth, async (_req, res) => res.json(await content.findOne({ key: 'main' }) || { key: 'main', translations: { fr: {}, ar: {}, en: {} } }));
app.put('/api/admin/content', auth, async (req, res) => {
  const translations = req.body?.translations;
  if (!translations || typeof translations !== 'object' || Array.isArray(translations) || !['fr', 'ar', 'en'].every(lang => translations[lang] && typeof translations[lang] === 'object' && !Array.isArray(translations[lang]))) return res.status(400).json({ error: 'Les traductions fr, ar et en doivent être des objets' });
  for (const lang of ['fr', 'ar', 'en']) {
    const fields = Object.entries(translations[lang]);
    if (fields.length > 100) return res.status(400).json({ error: 'Maximum 100 champs par langue' });
    for (const [key, value] of fields) {
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) return res.status(400).json({ error: 'Nom de champ invalide' });
      if (typeof value !== 'string' || value.length > 30000) return res.status(400).json({ error: 'Chaque champ doit être un texte de 30 000 caractères maximum' });
    }
  }
  const doc = { key: 'main', translations, updatedAt: new Date(), updatedBy: req.admin.email };
  await content.updateOne({ key: 'main' }, { $set: doc }, { upsert: true });
  res.json({ ok: true, updatedAt: doc.updatedAt });
});
function normalizeItem(route, input, adminEmail, previous = null) {
  const data = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const translations = data.translations;
  if (!translations || typeof translations !== 'object' || Array.isArray(translations) || !['fr', 'ar', 'en'].every(lang => translations[lang] && typeof translations[lang] === 'object' && !Array.isArray(translations[lang]))) {
    return { error: 'Les traductions fr, ar et en sont obligatoires' };
  }
  const cleanTranslations = {};
  for (const lang of ['fr', 'ar', 'en']) {
    cleanTranslations[lang] = {};
    for (const field of ['title', 'summary', 'body']) {
      const value = translations[lang][field] ?? '';
      if (typeof value !== 'string' || value.length > (field === 'body' ? 30000 : 5000)) return { error: 'Un champ de traduction est invalide ou trop long' };
      cleanTranslations[lang][field] = value.trim();
    }
  }
  const status = data.status ?? previous?.status ?? 'draft';
  if (!['draft', 'published'].includes(status)) return { error: 'Statut invalide' };
  const imageUrl = data.imageUrl ?? previous?.imageUrl ?? '';
  if (typeof imageUrl !== 'string' || imageUrl.length > 2048 || (imageUrl && !(/^(https?:\/\/|\/api\/public\/media\/)/i.test(imageUrl)))) {
    return { error: 'URL d’image invalide' };
  }
  if (status === 'published' && ['fr', 'ar', 'en'].some(lang => !cleanTranslations[lang].title)) return { error: 'Un titre est obligatoire dans les trois langues pour publier' };
  const now = new Date();
  const wasPublished = previous?.status === 'published';
  const doc = {
    translations: cleanTranslations,
    status,
    imageUrl,
    updatedAt: now,
    updatedBy: adminEmail,
    publishedAt: status === 'published' ? (wasPublished && previous?.publishedAt ? previous.publishedAt : now) : null
  };
  if (route === 'news') {
    doc.title = cleanTranslations.fr.title;
    doc.summary = cleanTranslations.fr.summary;
    doc.body = cleanTranslations.fr.body;
  } else {
    doc.name = cleanTranslations.fr.title;
    doc.description = cleanTranslations.fr.summary || cleanTranslations.fr.body;
  }
  return doc;
}
for (const [route, collection] of [['news', news], ['products', products]]) {
  app.get(`/api/admin/${route}`, auth, async (_req, res) => res.json(await collection.find({}).sort({ updatedAt: -1 }).toArray()));
  app.post(`/api/admin/${route}`, auth, async (req, res) => {
    const doc = normalizeItem(route, req.body, req.admin.email);
    if (doc.error) return res.status(400).json({ error: doc.error });
    doc.createdAt = new Date();
    doc.createdBy = req.admin.email;
    const result = await collection.insertOne(doc);
    res.status(201).json({ ...doc, _id: result.insertedId });
  });
  app.put(`/api/admin/${route}/:id`, auth, async (req, res) => {
    const _id = cleanId(req.params.id);
    if (!_id) return res.status(400).json({ error: 'Identifiant invalide' });
    const previous = await collection.findOne({ _id });
    if (!previous) return res.status(404).json({ error: 'Élément introuvable' });
    const doc = normalizeItem(route, req.body, req.admin.email, previous);
    if (doc.error) return res.status(400).json({ error: doc.error });
    const result = await collection.updateOne({ _id }, { $set: doc });
    if (!result.matchedCount) return res.status(404).json({ error: 'Élément introuvable' });
    res.json({ ok: true });
  });
  app.delete(`/api/admin/${route}/:id`, auth, async (req, res) => {
    const _id = cleanId(req.params.id);
    if (!_id) return res.status(400).json({ error: 'Identifiant invalide' });
    const result = await collection.deleteOne({ _id });
    if (!result.deletedCount) return res.status(404).json({ error: 'Élément introuvable' });
    res.json({ ok: true });
  });
}
app.get('/api/admin/media', auth, async (_req, res) => {
  const files = await db.collection('site_media.files').find({}).sort({ uploadDate: -1 }).limit(100).project({ filename: 1, contentType: 1, length: 1, uploadDate: 1 }).toArray();
  res.json(files.map(file => ({ _id: file._id.toString(), filename: file.filename, contentType: file.contentType, size: file.length, uploadDate: file.uploadDate, url: '/api/public/media/' + file._id })));
});
app.delete('/api/admin/media/:id', auth, async (req, res) => {
  const _id = cleanId(req.params.id);
  if (!_id) return res.status(400).json({ error: 'Identifiant invalide' });
  const idText = _id.toString();
  const [newsUse, productUse, file] = await Promise.all([
    news.countDocuments({ $or: [{ imageId: _id }, { imageUrl: { $regex: idText + String.fromCharCode(36) } }] }),
    products.countDocuments({ $or: [{ imageId: _id }, { imageUrl: { $regex: idText + String.fromCharCode(36) } }] }),
    db.collection('site_media.files').findOne({ _id }, { projection: { _id: 1 } })
  ]);
  if (!file) return res.status(404).json({ error: 'Image introuvable' });
  if (newsUse + productUse > 0) return res.status(409).json({ error: 'Cette image est utilisée par un article ou un produit. Remplacez son image avant de la supprimer.' });
  await bucket.delete(_id);
  res.json({ ok: true });
});
function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp' && ['avif', 'avis'].includes(buffer.toString('ascii', 8, 12))) return 'image/avif';
  return null;
}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|avif)$/.test(file.mimetype)) });
app.post('/api/admin/media', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image JPEG, PNG, WEBP ou AVIF requise (8 Mo max)' });
  const verifiedType = detectImageType(req.file.buffer);
  if (!verifiedType) return res.status(400).json({ error: 'Le contenu du fichier ne correspond pas à une image autorisée' });
  const id = new ObjectId();
  const safeName = String(req.file.originalname || 'image').replace(/[\/\\\x00-\x1f]/g, '_').slice(0, 180);
  const stream = bucket.openUploadStreamWithId(id, safeName, { contentType: verifiedType, metadata: { uploadedBy: req.admin.email } });
  stream.once('error', error => {
    console.error('CMS media upload failed', { message: error?.message });
    if (!res.headersSent) res.status(500).json({ error: 'Échec de l’enregistrement de l’image' });
  });
  stream.once('finish', () => {
    if (!res.headersSent) res.status(201).json({ id: id.toString(), url: `/api/public/media/${id}` });
  });
  stream.end(req.file.buffer);
});
app.get('/api/public/media/:id', async (req, res) => {
  const _id = cleanId(req.params.id);
  if (!_id) return res.status(404).end();
  const file = await db.collection('site_media.files').findOne({ _id });
  if (!file) return res.status(404).end();
  res.set('Content-Type', file.contentType || 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  bucket.openDownloadStream(_id).pipe(res);
});

app.use((error, req, res, next) => {
  console.error('CMS request failed', { method: req.method, path: req.path, message: error?.message });
  if (res.headersSent) return next(error);
  const status = error?.name === 'MulterError'
    ? (error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
    : 500;
  res.status(status).json({ error: status === 413 ? 'Fichier trop volumineux (8 Mo maximum)' : status === 400 ? 'Requête invalide' : 'Erreur interne du serveur' });
});

const port = Number(process.env.PORT || 10000);
app.listen(port, '0.0.0.0', () => console.log(`Oro Verde CMS API listening on ${port}`));
