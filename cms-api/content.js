export function validateSiteTranslations(translations) {
  if (!translations || typeof translations !== 'object' || Array.isArray(translations) ||
      !['fr', 'ar', 'en'].every(lang => translations[lang] && typeof translations[lang] === 'object' && !Array.isArray(translations[lang]))) {
    return 'Les traductions fr, ar et en doivent être des objets';
  }
  for (const lang of ['fr', 'ar', 'en']) {
    const fields = Object.entries(translations[lang]);
    if (fields.length > 100) return 'Maximum 100 champs par langue';
    for (const [key, value] of fields) {
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) return 'Nom de champ invalide';
      if (typeof value !== 'string' || value.length > 30000) return 'Chaque champ doit être un texte de 30 000 caractères maximum';
    }
  }
  return null;
}

export function normalizeItem(route, input, adminEmail, previous = null) {
  const data = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const translations = data.translations;
  if (!translations || typeof translations !== 'object' || Array.isArray(translations) ||
      !['fr', 'ar', 'en'].every(lang => translations[lang] && typeof translations[lang] === 'object' && !Array.isArray(translations[lang]))) {
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
  } else if (route === 'products') {
    doc.name = cleanTranslations.fr.title;
    doc.description = cleanTranslations.fr.summary || cleanTranslations.fr.body;
  } else {
    return { error: 'Type de contenu invalide' };
  }
  return doc;
}

export function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp' && ['avif', 'avis'].includes(buffer.toString('ascii', 8, 12))) return 'image/avif';
  return null;
}
