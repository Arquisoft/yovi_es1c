import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsersService } from '../src/services/users.service.js';
import * as metrics from '../src/metrics.js';

describe('UsersService', () => {
    let service: UsersService;

    beforeEach(() => {
        service = new UsersService();
        vi.spyOn(metrics, 'recordUserCreated').mockImplementation(() => {});
        vi.spyOn(metrics, 'recordProfileUpdate').mockImplementation(() => {});
        vi.spyOn(metrics, 'recordUserDeleted').mockImplementation(() => {});
    });

    it('onUserCreated calls recordUserCreated', () => {
        service.onUserCreated();
        expect(metrics.recordUserCreated).toHaveBeenCalledOnce();
    });

    it('onProfileUpdated calls recordProfileUpdate', () => {
        service.onProfileUpdated();
        expect(metrics.recordProfileUpdate).toHaveBeenCalledOnce();
    });

    it('onUserDeleted calls recordUserDeleted', () => {
        service.onUserDeleted();
        expect(metrics.recordUserDeleted).toHaveBeenCalledOnce();
    });
});