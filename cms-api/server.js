import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { MongoClient, ObjectId, GridFSBucket } from 'mongodb';

const required = ['MONGODB_URI', 'JWT_SECRET', 'CMS_SETUP_KEY'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);

const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: (process.env.FRONTEND_ORIGIN || '').split(',').map(v => v.trim()).filter(Boolean), credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }));
app.use('/api/admin/setup', rateLimit({ windowMs: 60 * 60 * 1000, limit: 3, standardHeaders: true, legacyHeaders: false }));

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
  content.createIndex({ key: 1 }, { unique: true })
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
  const doc = await content.findOne({ key: 'main' }, { projection: { _id: 0, key: 0 } });
  res.json(doc || { translations: { fr: {}, ar: {}, en: {} }, updatedAt: null });
});
app.get('/api/public/news', async (_req, res) => res.json(await news.find({ status: 'published' }).sort({ publishedAt: -1 }).limit(50).project({ title: 1, summary: 1, body: 1, imageId: 1, publishedAt: 1, translations: 1 }).toArray()));
app.get('/api/public/products', async (_req, res) => res.json(await products.find({ status: 'published' }).sort({ updatedAt: -1 }).limit(100).project({ name: 1, description: 1, imageId: 1, translations: 1, updatedAt: 1 }).toArray()));

app.post('/api/admin/setup', async (req, res) => {
  if (await admins.countDocuments({}) > 0) return res.status(403).json({ error: 'Configuration initiale déjà effectuée' });
  const { setupKey, email, password } = req.body || {};
  if (!setupKey || setupKey !== process.env.CMS_SETUP_KEY) return res.status(403).json({ error: 'Clé de configuration incorrecte' });
  if (!/^\S+@\S+\.\S+$/.test(email || '') || typeof password !== 'string' || password.length < 12) return res.status(400).json({ error: 'Adresse e-mail invalide ou mot de passe trop court (12 caractères minimum)' });
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await admins.insertOne({ email: email.toLowerCase(), passwordHash, createdAt: new Date(), role: 'admin' });
  const token = tokenFor({ _id: result.insertedId, email: email.toLowerCase() });
  res.status(201).json({ token, email: email.toLowerCase() });
});
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body || {};
  const admin = await admins.findOne({ email: String(email || '').toLowerCase() });
  if (!admin || !(await bcrypt.compare(String(password || ''), admin.passwordHash))) return res.status(401).json({ error: 'Identifiants incorrects' });
  res.json({ token: tokenFor(admin), email: admin.email });
});
app.get('/api/admin/me', auth, async (req, res) => res.json({ email: req.admin.email, role: 'admin' }));
app.get('/api/admin/content', auth, async (_req, res) => res.json(await content.findOne({ key: 'main' }) || { key: 'main', translations: { fr: {}, ar: {}, en: {} } }));
app.put('/api/admin/content', auth, async (req, res) => {
  const translations = req.body?.translations;
  if (!translations || !['fr', 'ar', 'en'].every(lang => translations[lang] && typeof translations[lang] === 'object')) return res.status(400).json({ error: 'Les traductions fr, ar et en sont obligatoires' });
  const doc = { key: 'main', translations, updatedAt: new Date(), updatedBy: req.admin.email };
  await content.updateOne({ key: 'main' }, { $set: doc }, { upsert: true });
  res.json({ ok: true, updatedAt: doc.updatedAt });
});
for (const [route, collection] of [['news', news], ['products', products]]) {
  app.get(`/api/admin/${route}`, auth, async (_req, res) => res.json(await collection.find({}).sort({ updatedAt: -1 }).toArray()));
  app.post(`/api/admin/${route}`, auth, async (req, res) => {
    const data = req.body || {};
    if (!data.translations || typeof data.translations !== 'object') return res.status(400).json({ error: 'Translations required' });
    const doc = { ...data, status: ['draft', 'published'].includes(data.status) ? data.status : 'draft', createdAt: new Date(), updatedAt: new Date(), createdBy: req.admin.email };
    const result = await collection.insertOne(doc);
    res.status(201).json({ ...doc, _id: result.insertedId });
  });
  app.put(`/api/admin/${route}/:id`, auth, async (req, res) => {
    const _id = cleanId(req.params.id);
    if (!_id) return res.status(400).json({ error: 'Invalid id' });
    const data = { ...req.body };
    delete data._id; delete data.createdAt; delete data.createdBy;
    data.updatedAt = new Date(); data.updatedBy = req.admin.email;
    if (data.status && !['draft', 'published'].includes(data.status)) return res.status(400).json({ error: 'Invalid status' });
    const result = await collection.updateOne({ _id }, { $set: data });
    if (!result.matchedCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  });
  app.delete(`/api/admin/${route}/:id`, auth, async (req, res) => {
    const _id = cleanId(req.params.id);
    if (!_id) return res.status(400).json({ error: 'Invalid id' });
    const result = await collection.deleteOne({ _id });
    if (!result.deletedCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  });
}
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|avif)$/.test(file.mimetype)) });
app.post('/api/admin/media', auth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image JPEG, PNG, WEBP ou AVIF requise (8 Mo max)' });
  const id = new ObjectId();
  const stream = bucket.openUploadStreamWithId(id, req.file.originalname, { contentType: req.file.mimetype, metadata: { uploadedBy: req.admin.email } });
  stream.end(req.file.buffer);
  stream.on('finish', () => res.status(201).json({ id: id.toString(), url: `/api/public/media/${id}` }));
  stream.on('error', () => res.status(500).json({ error: 'Upload failed' }));
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

const port = Number(process.env.PORT || 10000);
app.listen(port, '0.0.0.0', () => console.log(`Oro Verde CMS API listening on ${port}`));
