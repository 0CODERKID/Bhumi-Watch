import { createIndiaWatchHandler } from '../server/providers/indiaWatch.js';

const handler = createIndiaWatchHandler();

export default function indiaWatch(req, res) {
  return handler(req, res);
}
