import http from 'k6/http';
import { check, sleep } from 'k6';
import { gameOptions, BASE_URL, TEST_USER } from './config.js';
import encoding from 'k6/encoding';

export const options = gameOptions;

function parseJwtSub(token) {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(encoding.b64decode(payload, 'rawurl', 's'));
    return decoded.sub;
}

export function setup() {
    const headers = { 'Content-Type': 'application/json' };
    const password = TEST_USER.password;
    const vuCount = 50;
    const tokens = [];

    for (let i = 1; i <= vuCount; i++) {
        const username = `game_vu_${i}`;

        http.post(
            `${BASE_URL}/api/auth/register`,
            JSON.stringify({ username, password }),
            { headers, tags: { operation: 'register' } }
        );

        const res = http.post(
            `${BASE_URL}/api/auth/login`,
            JSON.stringify({ username, password }),
            { headers, tags: { operation: 'login' } }
        );

        if (res.status === 200) {
            const token = res.json('accessToken');
            console.log(`VU ${i} token acquired, userId: ${parseJwtSub(token)}`);
            tokens.push({ token, userId: parseJwtSub(token) });
        } else {
            console.error(`VU ${i} login FAILED: status=${res.status} body=${res.body}`);
            tokens.push(null);
        }
    }

    const acquired = tokens.filter(t => t !== null).length;
    console.log(`setup() complete: ${acquired}/${vuCount} tokens acquired`);
    return tokens;
}

export default function (tokens) {
    const auth = tokens[(__VU - 1) % tokens.length];

    // Sleep defensivo en TODOS los early returns para evitar busy-loop
    if (!auth) { sleep(1); return; }

    const headers = {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${auth.token}`,
    };

    const createRes = http.post(
        `${BASE_URL}/api/game/matches`,
        JSON.stringify({ boardSize: 5, difficulty: 'medium' }),
        { headers, tags: { operation: 'create' } }
    );

    check(createRes, {
        'match created': (r) => r.status === 201,
        'match has id':  (r) => r.json('matchId') !== undefined,
    });

    // Log temporal para diagnosticar — eliminar tras confirmar
    if (createRes.status !== 201) {
        console.error(`create failed: VU=${__VU} status=${createRes.status} body=${createRes.body?.substring(0, 200)}`);
        sleep(1);
        return;
    }

    const matchId = createRes.json('matchId');

    const getRes = http.get(
        `${BASE_URL}/api/game/matches/${matchId}`,
        { headers, tags: { operation: 'get_match' } }
    );

    check(getRes, {
        'get match status 200': (r) => r.status === 200,
        'get match has status': (r) => r.json('status') !== undefined,
    });

    if (getRes.status !== 200) { sleep(1); return; }

    const moveRes = http.post(
        `${BASE_URL}/api/game/matches/${matchId}/moves`,
        JSON.stringify({ position_yen: '0,0', player: 'USER', moveNumber: 1 }),
        { headers, tags: { operation: 'move' } }
    );

    check(moveRes, {
        'move accepted': (r) => r.status === 202,
    });

    const finishRes = http.put(
        `${BASE_URL}/api/game/matches/${matchId}/finish`,
        JSON.stringify({ winner: 'USER' }),
        { headers, tags: { operation: 'finish' } }
    );

    check(finishRes, {
        'finish accepted': (r) => r.status === 200,
    });

    const statsRes = http.get(
        `${BASE_URL}/api/game/stats/${auth.userId}`,
        { headers, tags: { operation: 'stats' } }
    );

    check(statsRes, {
        'stats status 200': (r) => r.status === 200,
    });

    sleep(1);
}