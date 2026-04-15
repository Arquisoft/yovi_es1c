import http from 'k6/http';
import { check, sleep } from 'k6';
import encoding from 'k6/encoding';
import { gameOptions, BASE_URL, TEST_USER } from './config.js';

export const options = gameOptions;

function parseJwtSub(token) {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(encoding.b64decode(payload, 'rawurl', 's'));
    return decoded.sub;
}

function yenFrom(row, col) {
    return `${String.fromCharCode(97 + col)}${row + 1}`;
}

function pickPlayableMove(matchState) {
    const blocked = new Set(
        (matchState?.rules?.honey?.blockedCells ?? []).map((cell) => `${cell.row}:${cell.col}`),
    );
    const occupied = new Set((matchState?.moves ?? []).map((move) => move.position_yen));

    for (let row = 0; row < matchState.board_size; row += 1) {
        for (let col = 0; col < matchState.board_size; col += 1) {
            if (blocked.has(`${row}:${col}`)) continue;
            const pos = yenFrom(row, col);
            if (!occupied.has(pos)) return pos;
        }
    }

    return yenFrom(0, 0);
}

function buildScenarios() {
    return [
        {
            operationTag: 'create_bot_classic',
            payload: {
                boardSize: 5,
                difficulty: 'medium',
                mode: 'BOT',
                rules: {
                    pieRule: { enabled: false },
                    honey: { enabled: false, blockedCells: [] },
                },
            },
            finisher: 'USER',
        },
        {
            operationTag: 'create_bot_honey_pie',
            payload: {
                boardSize: 6,
                difficulty: 'hard',
                mode: 'BOT',
                rules: {
                    pieRule: { enabled: true },
                    honey: { enabled: true, blockedCells: [] },
                },
            },
            finisher: 'BOT',
        },
        {
            operationTag: 'create_local_2p_pie',
            payload: {
                boardSize: 5,
                difficulty: 'easy',
                mode: 'LOCAL_2P',
                rules: {
                    pieRule: { enabled: true },
                    honey: { enabled: false, blockedCells: [] },
                },
            },
            finisher: 'USER',
        },
    ];
}

export function setup() {
    const headers = { 'Content-Type': 'application/json' };
    const password = TEST_USER.password;
    const vuCount = Number(__ENV.GAME_SETUP_VUS || 50);
    const runId = Date.now();
    const tokens = [];

    for (let i = 1; i <= vuCount; i += 1) {
        const username = `game_vu_${runId}_${i}`;

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

        if (res.status === 200) {
            const token = res.json('accessToken');
            tokens.push({ token, userId: parseJwtSub(token) });
        } else {
            tokens.push(null);
        }
    }

    return {
        tokens,
        scenarios: buildScenarios(),
    };
}

export default function (data) {
    const auth = data.tokens[(__VU - 1) % data.tokens.length];
    if (!auth) {
        sleep(1);
        return;
    }

    const scenario = data.scenarios[__ITER % data.scenarios.length];
    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
    };

    const createRes = http.post(
        `${BASE_URL}/api/game/matches`,
        JSON.stringify(scenario.payload),
        { headers, tags: { operation: scenario.operationTag } },
    );

    const created = check(createRes, {
        'match created': (r) => r.status === 201,
        'match has id': (r) => r.json('matchId') !== undefined,
    });

    if (!created) {
        sleep(1);
        return;
    }

    const matchId = createRes.json('matchId');

    const getRes = http.get(`${BASE_URL}/api/game/matches/${matchId}`, {
        headers,
        tags: { operation: 'get_match' },
    });

    const fetched = check(getRes, {
        'get match status 200': (r) => r.status === 200,
        'rules object returned': (r) => typeof r.json('rules') === 'object',
    });

    if (!fetched) {
        sleep(1);
        return;
    }

    const matchState = getRes.json();
    const position = pickPlayableMove(matchState);

    const moveRes = http.post(
        `${BASE_URL}/api/game/matches/${matchId}/moves`,
        JSON.stringify({ position_yen: position, player: 'USER', moveNumber: 1 }),
        { headers, tags: { operation: 'move' } },
    );

    check(moveRes, {
        'move accepted': (r) => r.status === 202,
    });

    const finishRes = http.put(
        `${BASE_URL}/api/game/matches/${matchId}/finish`,
        JSON.stringify({ winner: scenario.finisher }),
        { headers, tags: { operation: 'finish' } },
    );

    check(finishRes, {
        'finish accepted': (r) => r.status === 200,
    });

    const statsRes = http.get(`${BASE_URL}/api/game/stats/${auth.userId}`, {
        headers,
        tags: { operation: 'stats' },
    });

    check(statsRes, {
        'stats status 200': (r) => r.status === 200,
    });

    sleep(1);
}