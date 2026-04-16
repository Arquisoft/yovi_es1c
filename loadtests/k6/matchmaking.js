import http from 'k6/http';
import { check, sleep } from 'k6';
import { matchmakingOptions, BASE_URL, TEST_USER } from './config.js';

export const options = matchmakingOptions;

function registerAndLogin() {
    const headers = { 'Content-Type': 'application/json' };
    const username = `mm_vu_${Date.now()}_${__VU}_${__ITER}`;
    const password = TEST_USER.password;

    http.post(
        `${BASE_URL}/api/auth/register`,
        JSON.stringify({ username, password }),
        { headers, tags: { operation: 'register' } },
    );

    const res = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify({ username, password }),
        { headers, tags: { operation: 'login' } },
    );

    if (res.status !== 200) return null;
    return res.json('accessToken');
}

const queueScenarios = [
    {
        boardSize: 5,
        rules: {
            pieRule: { enabled: false },
            honey: { enabled: false, blockedCells: [] },
        },
    },
    {
        boardSize: 7,
        rules: {
            pieRule: { enabled: true },
            honey: { enabled: true, blockedCells: [] },
        },
    },
];

export default function () {
    const token = registerAndLogin();
    if (!token) {
        sleep(1);
        return;
    }

    const scenario = queueScenarios[__ITER % queueScenarios.length];

    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };

    const joinRes = http.post(
        `${BASE_URL}/api/game/online/queue`,
        JSON.stringify(scenario),
        { headers, tags: { operation: 'queue_join' } },
    );

    check(joinRes, {
        'joined queue': (r) => r.status === 201,
        'joinedAt returned': (r) => r.json('joinedAt') !== undefined,
    });

    if (joinRes.status !== 201) {
        sleep(1);
        return;
    }

    let matched = false;
    for (let i = 0; i < 5; i += 1) {
        const pollRes = http.get(`${BASE_URL}/api/game/online/queue/match`, {
            headers,
            tags: { operation: 'queue_poll' },
        });

        if (pollRes.status === 200 && pollRes.json('matched') === true) {
            check(pollRes, {
                'match found': (r) => r.json('matchId') !== undefined,
            });
            matched = true;
            break;
        }

        sleep(2);
    }

    if (!matched) {
        const cancelRes = http.del(`${BASE_URL}/api/game/online/queue`, null, {
            headers,
            tags: { operation: 'queue_cancel' },
        });

        check(cancelRes, {
            'queue cancel accepted': (r) => r.status === 204,
        });
    }

    sleep(1);
}