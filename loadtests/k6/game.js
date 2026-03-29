import http from 'k6/http';
import { check, sleep } from 'k6';
import { options, BASE_URL, TEST_USER } from './config.js';

export { options };

function login() {
    const res = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify({ username: TEST_USER.username, password: TEST_USER.password }),
        { headers: { 'Content-Type': 'application/json' } }
    );
    if (res.status !== 200) return null;
    return res.json('accessToken');
}

export default function () {
    const token = login();
    if (!token) return;

    const headers = {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
    };

    // Create a new AI match
    const createRes = http.post(
        `${BASE_URL}/api/game/matches`,
        JSON.stringify({ size: 5, strategy: 'heuristic', difficulty: 2 }),
        { headers }
    );

    check(createRes, {
        'match created':       (r) => r.status === 201,
        'match has id':        (r) => r.json('id') !== undefined,
        'match has yen state': (r) => r.json('state') !== undefined,
    });

    if (createRes.status !== 201) return;

    const matchId = createRes.json('id');

    // Get match state
    const getRes = http.get(`${BASE_URL}/api/game/matches/${matchId}`, { headers });

    check(getRes, {
        'get match status 200': (r) => r.status === 200,
        'get match has state':  (r) => r.json('state') !== undefined,
    });

    // Submit a move
    const moveRes = http.post(
        `${BASE_URL}/api/game/matches/${matchId}/moves`,
        JSON.stringify({ position: '0,0', updatedYEN: getRes.json('state') }),
        { headers }
    );

    check(moveRes, {
        'move accepted': (r) => r.status === 200 || r.status === 201,
    });

    // Get stats
    const statsRes = http.get(`${BASE_URL}/api/game/stats/me`, { headers });

    check(statsRes, {
        'stats status 200': (r) => r.status === 200,
    });

    sleep(1);
}