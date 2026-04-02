import { collectDefaultMetrics, Counter, Gauge, Registry } from 'prom-client';

export const register = new Registry();
collectDefaultMetrics({ register });

export const usersCreated = new Counter({
    name: 'users_users_created_total',
    help: 'Total users created in the users service',
    registers: [register],
});

export const profileUpdates = new Counter({
    name: 'users_profile_updates_total',
    help: 'Total user profile updates in the users service',
    registers: [register],
});

export const activeUsers = new Gauge({
    name: 'users_active_users',
    help: 'Current active users tracked by the users service',
    registers: [register],
});

export function recordUserCreated() {
    usersCreated.inc();
    activeUsers.inc();
}

export function recordProfileUpdate() {
    profileUpdates.inc();
}

export function recordUserDeleted() {
    activeUsers.dec();
}