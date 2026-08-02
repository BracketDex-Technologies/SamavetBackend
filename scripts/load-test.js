import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = (__ENV.BASE_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
const accessToken = __ENV.ACCESS_TOKEN || '';

export const options = {
  scenarios: {
    steady_traffic: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: 20 },
        { duration: '2m', target: 50 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.005'],
  },
};

export default function () {
  const health = http.get(`${baseUrl}/api/v1/health/live`);
  check(health, { 'liveness is healthy': (response) => response.status === 200 });

  if (accessToken) {
    const summary = http.get(`${baseUrl}/api/v1/workspace/summary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    check(summary, {
      'summary is authorized': (response) => response.status === 200,
      'summary is below 800ms': (response) => response.timings.duration < 800,
    });
  }

  sleep(1);
}
