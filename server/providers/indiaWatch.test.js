import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIndiaEvents, parseIndiaNewsRss } from './indiaWatch.js';

const NOW = Date.parse('2026-11-24T12:00:00Z');

test('normalizes recent India events and excludes points outside India or outside the time window', () => {
  const events = normalizeIndiaEvents({
    eonet: {
      events: [
        {
          id: 'EONET_1',
          title: 'Wildfire in India, Uttarakhand',
          categories: [{ title: 'Wildfires' }],
          closed: null,
          geometry: [
            { date: '2026-11-22T10:00:00Z', coordinates: [79.2, 30.1] },
          ],
          sources: [{ url: 'https://example.org/fire' }],
        },
        {
          id: 'EONET_2',
          title: 'Wildfire in California',
          categories: [{ title: 'Wildfires' }],
          geometry: [{ date: '2026-11-22T10:00:00Z', coordinates: [-120, 38] }],
        },
        {
          id: 'EONET_3',
          title: 'Old event',
          categories: [{ title: 'Wildfires' }],
          geometry: [{ date: '2026-08-01T10:00:00Z', coordinates: [79, 30] }],
        },
      ],
    },
    gdacs: {
      features: [
        {
          geometry: { type: 'Point', coordinates: [88, 22] },
          properties: {
            eventtype: 'TC',
            eventid: 42,
            episodeid: 2,
            name: 'Cyclone in India',
            country: 'India',
            fromdate: '2026-11-20T00:00:00Z',
            iscurrent: 'true',
            alertlevel: 'Orange',
            url: { report: 'https://gdacs.org/report' },
          },
        },
      ],
    },
    now: NOW,
  });

  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map(({ kind }) => kind),
    ['fire', 'storm'],
  );
  assert.equal(events[1].alertLevel, 'Orange');
  assert.equal(events[0].status, 'active');
  assert.equal(events[0].url, 'https://example.org/fire');
});

test('parses recent environmental headlines and rejects unsafe links and irrelevant gaming results', () => {
  const rss = `<rss><channel>
    <item><title>Forest fire alert issued in India &amp; nearby districts</title><link>https://news.example/fire</link><pubDate>Tue, 24 Nov 2026 09:00:00 GMT</pubDate><News:Source>India News</News:Source></item>
    <item><title>Free Fire India Redeem Codes</title><link>https://news.example/game</link><pubDate>Tue, 24 Nov 2026 09:00:00 GMT</pubDate></item>
    <item><title>Floods bring heavy rain</title><link>javascript:alert(1)</link><pubDate>Tue, 24 Nov 2026 09:00:00 GMT</pubDate></item>
  </channel></rss>`;
  const articles = parseIndiaNewsRss(rss, { now: NOW });
  assert.equal(articles.length, 1);
  assert.equal(
    articles[0].title,
    'Forest fire alert issued in India & nearby districts',
  );
  assert.equal(articles[0].source, 'India News');
});
