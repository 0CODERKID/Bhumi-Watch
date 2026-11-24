<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import UiButton from '../kit/UiButton.vue';
import UiIcon from '../kit/UiIcon.vue';

const open = ref(false);
const loading = ref(false);
const error = ref('');
const payload = ref(null);
const filter = ref('all');
const refreshedAt = computed(() => {
  const value = payload.value?.generatedAt;
  return value
    ? new Date(value).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
});
const filters = [
  ['all', 'All signals'],
  ['fire', 'Wildfires'],
  ['flood', 'Floods'],
  ['storm', 'Storms'],
  ['earthquake', 'Earthquakes'],
  ['landslide', 'Landslides'],
  ['sustainability', 'Climate & sustainability'],
];
const events = computed(() =>
  (payload.value?.events ?? []).filter(
    (event) => filter.value === 'all' || event.kind === filter.value,
  ),
);
const articles = computed(() =>
  (payload.value?.articles ?? []).filter(
    (article) => filter.value === 'all' || article.topic === filter.value,
  ),
);
const activeCount = computed(
  () =>
    (payload.value?.events ?? []).filter((event) => event.status === 'active')
      .length,
);
const fireCount = computed(
  () =>
    (payload.value?.events ?? []).filter((event) => event.kind === 'fire')
      .length,
);
const alertCount = computed(
  () =>
    (payload.value?.events ?? []).filter((event) =>
      ['Red', 'Orange'].includes(event.alertLevel),
    ).length,
);
const formatDate = (value) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};
const kindLabel = (kind) =>
  ({
    fire: 'Wildfire',
    flood: 'Flood',
    storm: 'Storm / cyclone',
    earthquake: 'Earthquake',
    landslide: 'Landslide',
    drought: 'Drought',
    volcano: 'Volcanic activity',
    other: 'Natural event',
  })[kind] ?? 'Natural event';
const sourceUrl = (event) => event.url || 'https://eonet.gsfc.nasa.gov/';
let requestController = null;
async function load() {
  requestController?.abort();
  requestController = new AbortController();
  loading.value = true;
  error.value = '';
  try {
    const response = await fetch('/api/india-watch', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: requestController.signal,
    });
    if (!response.ok)
      throw new Error(
        'India Watch is temporarily unavailable. Try refreshing.',
      );
    const next = await response.json();
    if (!Array.isArray(next.events) || !Array.isArray(next.articles))
      throw new Error('The event feed returned an unexpected response.');
    payload.value = next;
  } catch (cause) {
    if (cause?.name !== 'AbortError')
      error.value = cause?.message || 'Could not load India Watch.';
  } finally {
    if (!requestController.signal.aborted) loading.value = false;
  }
}
function toggle() {
  open.value = !open.value;
  if (open.value && !payload.value) load();
}
function onKeydown(event) {
  if (event.key === 'Escape' && open.value) open.value = false;
}
if (typeof window !== 'undefined')
  window.addEventListener('keydown', onKeydown);
onBeforeUnmount(() => {
  requestController?.abort();
  if (typeof window !== 'undefined')
    window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="india-watch" translate="no">
    <UiButton
      class="india-watch__trigger"
      :aria-expanded="open"
      aria-controls="india-watch-panel"
      @click="toggle"
    >
      <span class="india-watch__trigger-mark" aria-hidden="true"
        ><UiIcon name="eco" :size="null"
      /></span>
      <span class="india-watch__trigger-copy"
        ><strong>INDIA WATCH</strong
        ><small>Environment · hazards · news</small></span
      >
      <span class="india-watch__live-dot" aria-label="Live data"></span>
    </UiButton>

    <section
      v-if="open"
      id="india-watch-panel"
      class="india-watch__panel"
      role="region"
      aria-labelledby="india-watch-title"
      :aria-busy="loading ? 'true' : 'false'"
    >
      <header class="india-watch__header">
        <div>
          <p class="india-watch__eyebrow"
            ><span class="india-watch__live-dot" aria-hidden="true"></span>
            INDIA · LIVE ENVIRONMENT BRIEF</p
          >
          <h2 id="india-watch-title">Signals from a changing landscape</h2>
          <p class="india-watch__dek"
            >Wildfire, flood, cyclone and earthquake activity across India,
            alongside current reporting.</p
          >
        </div>
        <UiButton
          class="india-watch__icon-button"
          aria-label="Close India Watch"
          title="Close India Watch"
          @click="open = false"
          ><UiIcon name="close" :size="null"
        /></UiButton>
      </header>

      <div class="india-watch__metrics" aria-label="India event summary">
        <div
          ><strong>{{ activeCount }}</strong
          ><span>ACTIVE EVENTS</span></div
        >
        <div
          ><strong>{{ fireCount }}</strong
          ><span>FIRE SIGNALS</span></div
        >
        <div
          ><strong>{{ alertCount }}</strong
          ><span>GDACS ALERTS</span></div
        >
      </div>

      <div
        class="india-watch__filters"
        role="group"
        aria-label="Filter environmental signals"
      >
        <UiButton
          v-for="item in filters"
          :key="item[0]"
          class="india-watch__filter"
          :class="{ 'is-active': filter === item[0] }"
          :aria-pressed="filter === item[0]"
          @click="filter = item[0]"
          >{{ item[1] }}</UiButton
        >
      </div>

      <div v-if="loading && !payload" class="india-watch__status" role="status"
        >Connecting to NASA, GDACS and India news sources…</div
      >
      <div
        v-else-if="error"
        class="india-watch__status india-watch__status--error"
        role="alert"
      >
        <span>{{ error }}</span>
        <UiButton class="india-watch__refresh" @click="load">Retry</UiButton>
      </div>

      <div v-else class="india-watch__body">
        <section
          class="india-watch__section"
          aria-labelledby="india-watch-news-heading"
        >
          <div class="india-watch__section-head"
            ><h3 id="india-watch-news-heading">LATEST REPORTS</h3
            ><span>{{ articles.length }} ARTICLES</span></div
          >
          <ul v-if="articles.length" class="india-watch__articles">
            <li v-for="article in articles" :key="article.url">
              <a :href="article.url" target="_blank" rel="noopener noreferrer">
                <span class="india-watch__article-title">{{
                  article.title
                }}</span>
                <span class="india-watch__article-meta"
                  >{{ article.source }} <span aria-hidden="true">·</span>
                  {{ formatDate(article.publishedAt) }}</span
                >
              </a>
            </li>
          </ul>
          <p v-else class="india-watch__empty">{{
            payload?.availability?.news
              ? 'No matching headlines for this filter right now.'
              : 'News headlines are temporarily unavailable.'
          }}</p>
        </section>

        <section
          class="india-watch__section"
          aria-labelledby="india-watch-events-heading"
        >
          <div class="india-watch__section-head"
            ><h3 id="india-watch-events-heading">EVENTS · LAST 60 DAYS</h3
            ><span>{{ events.length }} RECORDS</span></div
          >
          <ul v-if="events.length" class="india-watch__events">
            <li
              v-for="event in events"
              :key="event.id"
              :class="`event-${event.kind}`"
            >
              <div class="india-watch__event-marker" aria-hidden="true"></div>
              <div class="india-watch__event-copy">
                <div class="india-watch__event-meta"
                  ><span>{{ kindLabel(event.kind) }}</span
                  ><span
                    v-if="event.alertLevel"
                    class="india-watch__alert"
                    :class="`alert-${event.alertLevel.toLowerCase()}`"
                    >{{ event.alertLevel }} alert</span
                  ><span v-else>{{
                    event.status === 'active' ? 'ACTIVE' : 'RECENT'
                  }}</span></div
                >
                <a
                  :href="sourceUrl(event)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="india-watch__event-title"
                  >{{ event.title }}</a
                >
                <p
                  >{{ event.location }} <span aria-hidden="true">·</span>
                  {{ event.source }} <span aria-hidden="true">·</span>
                  {{ formatDate(event.occurredAt) }}</p
                >
              </div>
            </li>
          </ul>
          <p v-else class="india-watch__empty">{{
            payload?.availability?.events
              ? 'No recent events match this filter.'
              : 'Natural-event feeds are temporarily unavailable.'
          }}</p>
        </section>
      </div>

      <footer class="india-watch__footer">
        <span>Sources: NASA EONET · GDACS · Bing News</span>
        <span v-if="refreshedAt">Updated {{ refreshedAt }}</span>
        <UiButton
          class="india-watch__refresh"
          :disabled="loading"
          @click="load"
          >{{ loading ? 'Updating…' : 'Refresh' }}</UiButton
        >
      </footer>
      <p class="india-watch__disclaimer"
        >Situational awareness only — not an official emergency alert service.
        Always follow local authorities.</p
      >
    </section>
  </div>
</template>
