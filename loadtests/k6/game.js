import http from 'k6/http';
import { check, sleep } from 'k6';
import { gameOptions, BASE_URL, TEST_USER } from './config.js';
export const options = gameOptions;

function registerAndLogin() {
    const headers = { 'Content-Type': 'application/json' };
    const username = `game_vu_${__VU}_${__ITER}`;
    const password = TEST_USER.password;

    http.post(
        `${BASE_URL}/api/auth/register`,
        JSON.stringify({ username, password }),
        { headers }
    );

    const res = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify({ username, password }),
        { headers }
    );

    if (res.status !== 200) return null;
    return {
        token: res.json('accessToken'),
        userId: res.json('userId'),
    };
}

export default function () {
    const auth = registerAndLogin();
    if (!auth) return;

    const headers = {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${auth.token}`,
    };

    const createRes = http.post(
        `${BASE_URL}/api/game/matches`,
        JSON.stringify({ boardSize: 5, difficulty: 'medium' }),
        { headers }
    );

    check(createRes, {
        'match created':  (r) => r.status === 201,
        'match has id':   (r) => r.json('matchId') !== undefined,
    });

    if (createRes.status !== 201) return;

    const matchId = createRes.json('matchId');

    const getRes = http.get(`${BASE_URL}/api/game/matches/${matchId}`, { headers });

    check(getRes, {
        'get match status 200':   (r) => r.status === 200,
        'get match has status':   (r) => r.json('status') !== undefined,
    });

    if (getRes.status !== 200) return;

    const moveRes = http.post(
        `${BASE_URL}/api/game/matches/${matchId}/moves`,
        JSON.stringify({ position_yen: '0,0', player: 'USER', moveNumber: 1 }),
        { headers }
    );

    check(moveRes, {
        'move accepted': (r) => r.status === 200 || r.status === 201,
    });

    const statsRes = http.get(`${BASE_URL}/api/game/stats/${auth.userId}`, { headers });

    check(statsRes, {
        'stats status 200': (r) => r.status === 200,
    });

    sleep(1);
}