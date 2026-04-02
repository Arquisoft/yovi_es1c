import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsersController } from '../src/controllers/users.controller.js';
import { UsersService } from '../src/services/users.service.js';

describe('UsersController', () => {
    let controller: UsersController;
    let mockService: UsersService;

    beforeEach(() => {
        mockService = {
            onUserCreated: vi.fn(),
            onProfileUpdated: vi.fn(),
            onUserDeleted: vi.fn(),
        } as unknown as UsersService;
        controller = new UsersController(mockService);
    });

    it('recordCreatedUser delegates to usersService.onUserCreated', () => {
        controller.recordCreatedUser();
        expect(mockService.onUserCreated).toHaveBeenCalledOnce();
    });

    it('recordUpdatedProfile delegates to usersService.onProfileUpdated', () => {
        controller.recordUpdatedProfile();
        expect(mockService.onProfileUpdated).toHaveBeenCalledOnce();
    });

    it('recordDeletedUser delegates to usersService.onUserDeleted', () => {
        controller.recordDeletedUser();
        expect(mockService.onUserDeleted).toHaveBeenCalledOnce();
    });
});