import { UsersService } from '../services/users.service.js';

export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    recordCreatedUser() {
        this.usersService.onUserCreated();
    }

    recordUpdatedProfile() {
        this.usersService.onProfileUpdated();
    }

    recordDeletedUser() {
        this.usersService.onUserDeleted();
    }
}
