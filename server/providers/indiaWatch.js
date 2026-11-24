import { readResponseTextCapped } from './common/http.js';

const INDIA_BOUNDS = Object.freeze({ west: 68, east: 98, south: 6, north: 37 });
const LOOKBACK_MS = 60 * 24 * 60 * 60 * 1000;
const MAX_UPSTREAM_BYTES = 4 * 1024 * 1024;
const CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 15_000;
const NEWS_TOPICS = Object.freeze([
  ['fire', 'India forest fire'],
  ['storm', 'India cyclone disaster'],
  ['flood', 'India flood disaster'],
  ['earthquake', 'India earthquake news'],
  ['landslide', 'India landslide disaster'],
  ['sustainability', 'India renewable energy'],
  ['sustainability', 'India climate change'],
  ['sustainability', 'India forest conservation'],
  ['sustainability', 'India pollution cleaner air'],
]);
const URLS = Object.freeze({
  eonet: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=all&limit=1000',
  gdacs:
    'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ%3BTC%3BFL%3BVO%3BDR%3BWF',
});

let cached = null;
let cacheUntil = 0;
let inflight = null;

function boundedText(value, max = 360) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function coordinatePairs(value, pairs = []) {
  if (!Array.isArray(value)) return pairs;
  if (
    value.length >= 2 &&
    Number.isFinite(Number(value[0])) &&
    Number.isFinite(Number(value[1]))
  ) {
    pairs.push([Number(value[0]), Number(value[1])]);
    return pairs;
  }
  for (const part of value) coordinatePairs(part, pairs);
  return pairs;
}

function isInsideIndia(lon, lat) {
  return (
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon >= INDIA_BOUNDS.west &&
    lon <= INDIA_BOUNDS.east &&
    lat >= INDIA_BOUNDS.south &&
    lat <= INDIA_BOUNDS.north
  );
}

function kindFromLabel(value) {
  const label = String(value ?? '').toLowerCase();
  if (/\bwf\b|wildfire|forest fire|fire/.test(label)) return 'fire';
  if (/\bfl\b|flood/.test(label)) return 'flood';
  if (/\btc\b|cyclone|storm|hurricane|typhoon/.test(label)) return 'storm';
  if (/\beq\b|earthquake|seismic/.test(label)) return 'earthquake';
  if (/landslide/.test(label)) return 'landslide';
  if (/\bdr\b|drought/.test(label)) return 'drought';
  if (/\bvo\b|volcano/.test(label)) return 'volcano';
  return 'other';
}

function eventTime(value) {
  const time = Date.parse(value ?? '');
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function recentEnough(value, now) {
  const time = Date.parse(value ?? '');
  return (
    Number.isFinite(time) &&
    time >= now - LOOKBACK_MS &&
    time <= now + 60 * 60 * 1000
  );
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Normalize only geocoded EONET and GDACS records within India's bounds. */
export function normalizeIndiaEvents({ eonet, gdacs, now = Date.now() } = {}) {
  const events = [];
  for (const item of Array.isArray(eonet?.events) ? eonet.events : []) {
    const geometries = Array.isArray(item?.geometry) ? item.geometry : [];
    const latest = geometries
      .filter((entry) => recentEnough(entry?.date, now))
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
    if (!latest) continue;
    const pair = coordinatePairs(latest.coordinates).find(([lon, lat]) =>
      isInsideIndia(lon, lat),
    );
    if (!pair) continue;
    const category = item.categories?.[0]?.title ?? 'Natural event';
    events.push({
      id: `eonet:${boundedText(item.id, 80)}`,
      title: boundedText(item.title, 180) || category,
      kind: kindFromLabel(category),
      source: 'NASA EONET',
      location: boundedText(item.title, 180) || 'India',
      occurredAt: eventTime(latest.date),
      status: item.closed ? 'recent' : 'active',
      alertLevel: null,
      url:
        safeExternalUrl(item.sources?.[0]?.url) ||
        'https://eonet.gsfc.nasa.gov/',
      lat: pair[1],
      lon: pair[0],
    });
  }

  for (const feature of Array.isArray(gdacs?.features) ? gdacs.features : []) {
    const properties = feature?.properties ?? {};
    const countryNames = [
      properties.country,
      ...(Array.isArray(properties.affectedcountries)
        ? properties.affectedcountries.map((country) => country?.countryname)
        : []),
    ].map((name) => String(name ?? '').toLowerCase());
    if (!countryNames.includes('india')) continue;
    const pair = coordinatePairs(feature?.geometry?.coordinates).find(
      ([lon, lat]) => isInsideIndia(lon, lat),
    );
    if (!pair || !recentEnough(properties.fromdate, now)) continue;
    events.push({
      id: `gdacs:${boundedText(properties.eventtype, 8)}:${boundedText(properties.eventid, 24)}:${boundedText(properties.episodeid, 24)}`,
      title:
        boundedText(properties.name || properties.description, 180) ||
        'Natural hazard',
      kind: kindFromLabel(
        `${properties.eventtype ?? ''} ${properties.name ?? ''}`,
      ),
      source: 'GDACS',
      location: boundedText(properties.country || 'India', 100),
      occurredAt: eventTime(properties.fromdate),
      status:
        String(properties.iscurrent).toLowerCase() === 'true'
          ? 'active'
          : 'recent',
      alertLevel: ['Red', 'Orange', 'Green'].includes(properties.alertlevel)
        ? properties.alertlevel
        : null,
      url: safeExternalUrl(properties.url?.report) || 'https://www.gdacs.org/',
      lat: pair[1],
      lon: pair[0],
    });
  }

  return events
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, 60);
}

function decodeXml(value) {
  return String(value ?? '')
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([\da-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function xmlField(xml, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(
    new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'),
  );
  return match ? decodeXml(match[1]) : '';
}

/** Parse Bing News RSS into safe, display-ready headline records. */
export function parseIndiaNewsRss(xml, { now = Date.now() } = {}) {
  return [...String(xml ?? '').matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
    .map(([, item]) => {
      const title = boundedText(xmlField(item, 'title'), 240);
      const url = safeExternalUrl(xmlField(item, 'link'));
      const date = xmlField(item, 'pubDate');
      const source =
        boundedText(xmlField(item, 'News:Source'), 100) || 'News source';
      const publishedAt = eventTime(date);
      const kind = kindFromLabel(title);
      return { title, url, source, publishedAt, kind };
    })
    .filter((item) => {
      if (
        !item.title ||
        !item.url ||
        !item.publishedAt ||
        !recentEnough(item.publishedAt, now)
      )
        return false;
      if (/\bfree fire\b|\bvideo game\b|\bgaming\b/i.test(item.title))
        return false;
      return /fire|wildfire|forest|flood|cyclone|storm|earthquake|landslide|drought|heatwave|disaster|climate|renewable|clean energy|green energy|solar|wind energy|conservation|pollution|sustainability/i.test(
        item.title,
      );
    })
    .slice(0, 20);
}

async function readBody(response, maxBytes = MAX_UPSTREAM_BYTES) {
  if (!response.ok) throw new Error(`upstream_http_${response.status}`);
  return readResponseTextCapped(response, maxBytes);
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return JSON.parse(await readBody(response));
}

async function fetchRss(topic, fetchImpl) {
  const query = new URLSearchParams({
    q: topic,
    format: 'rss',
    cc: 'IN',
    setlang: 'en-IN',
  });
  const response = await fetchImpl(
    `https://www.bing.com/news/search?${query}`,
    {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  return readBody(response, 512 * 1024);
}

async function collectIndiaWatch(fetchImpl, now) {
  const [eonetResult, gdacsResult, ...newsResults] = await Promise.allSettled([
    fetchJson(URLS.eonet, fetchImpl),
    fetchJson(URLS.gdacs, fetchImpl),
    ...NEWS_TOPICS.map(([, topic]) => fetchRss(topic, fetchImpl)),
  ]);
  const eonet = eonetResult.status === 'fulfilled' ? eonetResult.value : null;
  const gdacs = gdacsResult.status === 'fulfilled' ? gdacsResult.value : null;
  const articles = newsResults
    .flatMap((result, index) =>
      result.status === 'fulfilled'
        ? parseIndiaNewsRss(result.value, { now }).map((item) => ({
            ...item,
            topic: NEWS_TOPICS[index][0],
          }))
        : [],
    )
    .filter(
      (item, index, all) =>
        all.findIndex((other) => other.url === item.url) === index,
    )
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 12);
  const events = normalizeIndiaEvents({ eonet, gdacs, now });
  const eventsAvailable = Boolean(eonet || gdacs);
  const newsAvailable = newsResults.some(
    (result) => result.status === 'fulfilled',
  );
  if (!eventsAvailable && !newsAvailable)
    throw new Error('india_watch_sources_unavailable');
  return {
    generatedAt: new Date(now).toISOString(),
    events,
    articles,
    availability: { events: eventsAvailable, news: newsAvailable },
    sources: ['NASA EONET', 'GDACS', 'Bing News'],
  };
}

/** A bounded India-only read endpoint shared by Vite and Vercel. */
export function createIndiaWatchHandler({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  log = (message) => console.warn(message),
} = {}) {
  function json(res, status, value) {
    if (res.destroyed) return;
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control':
        status === 200
          ? 'public, max-age=300, stale-while-revalidate=600'
          : 'no-store',
      ...(status === 405 ? { Allow: 'GET' } : {}),
    });
    res.end(JSON.stringify(value));
  }

  return async function handler(req, res) {
    if (req.method !== 'GET')
      return json(res, 405, { error: 'method_not_allowed' });
    let requestUrl;
    try {
      requestUrl = new URL(req.url || '/', 'http://local');
    } catch {
      return json(res, 400, { error: 'invalid_request' });
    }
    if ([...requestUrl.searchParams].length)
      return json(res, 400, { error: 'unexpected_query' });

    const at = now();
    if (cached && at < cacheUntil) return json(res, 200, cached);
    try {
      inflight ??= collectIndiaWatch(fetchImpl, at).finally(() => {
        inflight = null;
      });
      const payload = await inflight;
      cached = payload;
      cacheUntil = at + CACHE_MS;
      return json(res, 200, payload);
    } catch (error) {
      log(
        `[india-watch] source read failed: ${String(error?.message ?? error).slice(0, 120)}`,
      );
      return json(res, 502, { error: 'india_watch_unavailable' });
    }
  };
}

/** Mount the same-site read endpoint in Vite development and preview servers. */
export function indiaWatchProxy(options = {}) {
  const handler = createIndiaWatchHandler(options);
  return {
    name: 'india-watch',
    configureServer({ middlewares }) {
      middlewares.use('/api/india-watch', handler);
    },
    configurePreviewServer({ middlewares }) {
      middlewares.use('/api/india-watch', handler);
    },
  };
}
