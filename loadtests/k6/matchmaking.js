import http from 'k6/http';
import { check, sleep } from 'k6';
import { matchmakingOptions, BASE_URL, TEST_USER } from './config.js';
export const options = matchmakingOptions;

function login(username) {
    const res = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify({ username, password: TEST_USER.password }),
        { headers: { 'Content-Type': 'application/json' } }
    );
    if (res.status !== 200) return null;
    return res.json('accessToken');
}

export default function () {
    const token = login(`loadtest_user_${__VU}`);
    if (!token) return;

    const headers = {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
    };

    // Join matchmaking queue
    const joinRes = http.post(
        `${BASE_URL}/api/game/online/queue`,
        JSON.stringify({}),
        { headers }
    );

    check(joinRes, {
        'joined queue': (r) => r.status === 200 || r.status === 201,
    });

    sleep(2);

    // Poll for a match (up to 5 attempts)
    let matched = false;
    for (let i = 0; i < 5; i++) {
        const pollRes = http.get(`${BASE_URL}/api/game/online/queue/match`, { headers });

        if (pollRes.status === 200 && pollRes.json('matchId')) {
            check(pollRes, {
                'match found':       (r) => r.json('matchId') !== undefined,
                'match has opponent': (r) => r.json('opponent') !== undefined,
            });
            matched = true;
            break;
        }
        sleep(2);
    }

    if (!matched) {
        // Cancel queue if no match found
        http.del(`${BASE_URL}/api/game/online/queue`, null, { headers });
    }

    sleep(1);
}