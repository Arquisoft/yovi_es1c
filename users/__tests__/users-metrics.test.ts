import { describe, it, expect, beforeEach } from 'vitest';
import {
    register,
    usersCreated,
    profileUpdates,
    activeUsers,
    recordUserCreated,
    recordProfileUpdate,
    recordUserDeleted,
} from '../src/metrics.js';

describe('metrics.ts', () => {
    beforeEach(async () => {
        register.resetMetrics();
    });

    it('should export a prom-client Registry', () => {
        expect(register).toBeDefined();
        expect(typeof register.metrics).toBe('function');
    });

    it('recordUserCreated increments usersCreated counter', async () => {
        const before = (await usersCreated.get()).values[0]?.value ?? 0;
        recordUserCreated();
        const after = (await usersCreated.get()).values[0]?.value ?? 0;
        expect(after).toBe(before + 1);
    });

    it('recordUserCreated increments activeUsers gauge', async () => {
        const before = (await activeUsers.get()).values[0]?.value ?? 0;
        recordUserCreated();
        const after = (await activeUsers.get()).values[0]?.value ?? 0;
        expect(after).toBe(before + 1);
    });

    it('recordProfileUpdate increments profileUpdates counter', async () => {
        const before = (await profileUpdates.get()).values[0]?.value ?? 0;
        recordProfileUpdate();
        const after = (await profileUpdates.get()).values[0]?.value ?? 0;
        expect(after).toBe(before + 1);
    });

    it('recordUserDeleted decrements activeUsers gauge', async () => {
        recordUserCreated(); // primero subir para poder bajar
        const before = (await activeUsers.get()).values[0]?.value ?? 0;
        recordUserDeleted();
        const after = (await activeUsers.get()).values[0]?.value ?? 0;
        expect(after).toBe(before - 1);
    });

    it('register exposes metrics in prometheus format', async () => {
        const output = await register.metrics();
        expect(output).toContain('users_users_created_total');
        expect(output).toContain('users_profile_updates_total');
        expect(output).toContain('users_active_users');
    });
});