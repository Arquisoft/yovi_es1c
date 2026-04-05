import { recordProfileUpdate, recordUserCreated, recordUserDeleted } from '../metrics.js';

export class UsersService {
    onUserCreated() {
        recordUserCreated();
    }

    onProfileUpdated() {
        recordProfileUpdate();
    }

    onUserDeleted() {
        recordUserDeleted();
    }
}
