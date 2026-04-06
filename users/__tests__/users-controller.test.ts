import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { UsersController } from '../src/controllers/users.controller.js';
import { UsersService } from '../src/services/users.service.js';
import { UserRepository } from '../src/repositories/users.repository.js';

function makeRes() {
    const res = {
        status: vi.fn(),
        json: vi.fn(),
    } as unknown as Response;
    (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
    (res.json as ReturnType<typeof vi.fn>).mockReturnValue(res);
    return res;
}

function makeReq(params: Record<string, string> = {}, body: Record<string, unknown> = {}): Request {
    return { params, body } as unknown as Request;
}

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

describe('UsersController HTTP handlers', () => {
    let controller: UsersController;
    let mockService: UsersService;
    let mockRepo: UserRepository;

    const fakeProfile = { id: 1, username: 'alex', avatar: null, created_at: '2026-01-01' };

    beforeEach(() => {
        mockService = {
            onUserCreated: vi.fn(),
            onProfileUpdated: vi.fn(),
            onUserDeleted: vi.fn(),
        } as unknown as UsersService;

        mockRepo = {
            createProfile: vi.fn(),
            getById: vi.fn(),
            getByUsername: vi.fn(),
            updateProfile: vi.fn(),
        } as unknown as UserRepository;

        controller = new UsersController(mockService, mockRepo);
    });

    // ── createProfile ──────────────────────────────────────────────────────

    it('createProfile returns 400 when username is missing', async () => {
        const req = makeReq({}, {});
        const res = makeRes();

        await controller.createProfile(req, res);

        expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(400);
        expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ error: 'username is required' });
    });

    it('createProfile returns 201 with profile on success', async () => {
        (mockRepo.createProfile as ReturnType<typeof vi.fn>).mockResolvedValue(fakeProfile);
        const req = makeReq({}, { username: 'alex', avatar: 'img.png' });
        const res = makeRes();

        await controller.createProfile(req, res);

        expect(mockService.onUserCreated).toHaveBeenCalledOnce();
        expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(201);
        expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(fakeProfile);
    });

    it('createProfile returns 409 on duplicate username', async () => {
        (mockRepo.createProfile as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error('UNIQUE constraint failed: user_profiles.username')
        );
        const req = makeReq({}, { username: 'alex' });
        const res = makeRes();

        await controller.createProfile(req, res);

        expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(409);
        expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ error: 'Username already exists' });
    });

    it('createProfile returns 500 on unexpected error', async () => {
        (mockRepo.createProfile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('disk full'));
        const req = makeReq({}, { username: 'alex' });
        const res = makeRes();

        await controller.createProfile(req, res);

        expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(500);
        expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    // ── getProfile ─────────────────────────────────────────────────────────

    it('getProfile returns 400 for non-numeric id', async () => {
        const req = makeReq({ id: 'abc' });
        const res = makeRes();

        await controller.getProfile(req, res);

        expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(400);
        expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ error: 'Invalid id' });
    });

    it('getProfile returns 404 when profile not found', async () => {
        (mockRepo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        const req = makeReq({ id: '99' });
        const res = makeRes();

        await controller.getProfile(req, res);

        expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(404);
        expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ error: 'Profile not found' });
    });

    it('getProfile returns profile on success', async () => {
        (mockRepo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(fakeProfile);
        const req = makeReq({ id: '1' });
        const res = makeRes();

        await controller.getProfile(req, res);

        expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(fakeProfile);
    });

    // ── getProfileByUsername ───────────────────────────────────────────────

    it('getProfileByUsername returns 404 when not found', async () => {
        (mockRepo.getByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        const req = makeReq({ username: 'ghost' });
        const res = makeRes();

        await controller.getProfileByUsername(req, res);

        expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(404);
        expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ error: 'Profile not found' });
    });

    it('getProfileByUsername returns profile on success', async () => {
        (mockRepo.getByUsername as ReturnType<typeof vi.fn>).mockResolvedValue(fakeProfile);
        const req = makeReq({ username: 'alex' });
        const res = makeRes();

        await controller.getProfileByUsername(req, res);

        expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(fakeProfile);
    });

    // ── updateProfile ──────────────────────────────────────────────────────

    it('updateProfile returns 400 for non-numeric id', async () => {
        const req = makeReq({ id: 'nope' }, { avatar: 'img.png' });
        const res = makeRes();

        await controller.updateProfile(req, res);

        expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(400);
        expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ error: 'Invalid id' });
    });

    it('updateProfile returns 404 when profile not found', async () => {
        (mockRepo.updateProfile as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        const req = makeReq({ id: '99' }, { avatar: 'img.png' });
        const res = makeRes();

        await controller.updateProfile(req, res);

        expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(404);
        expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ error: 'Profile not found' });
    });

    it('updateProfile returns updated profile on success', async () => {
        const updated = { ...fakeProfile, avatar: 'new.png' };
        (mockRepo.updateProfile as ReturnType<typeof vi.fn>).mockResolvedValue(updated);
        const req = makeReq({ id: '1' }, { avatar: 'new.png' });
        const res = makeRes();

        await controller.updateProfile(req, res);

        expect(mockService.onProfileUpdated).toHaveBeenCalledOnce();
        expect((res.json as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(updated);
    });
});
