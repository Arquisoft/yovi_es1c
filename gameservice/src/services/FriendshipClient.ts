export interface FriendshipUserSummary {
  id: number;
  userId: number;
  username: string;
  displayName?: string | null;
}

export interface FriendshipStatus {
  friend: boolean;
  user?: FriendshipUserSummary;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function resolveUsersServiceBaseUrl(value = process.env.USERS_SERVICE_URL): string {
  const baseUrl = value?.trim();
  if (!baseUrl) {
    throw new Error('USERS_SERVICE_URL must be configured for friend match verification');
  }
  return trimTrailingSlash(baseUrl);
}

export class FriendshipClient {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = resolveUsersServiceBaseUrl(baseUrl);
  }

  async getFriendshipStatus(friendUserId: number, authorizationHeader: string): Promise<FriendshipStatus> {
    const response = await fetch(`${this.baseUrl}/friends/${friendUserId}/status`, {
      method: 'GET',
      headers: {
        Authorization: authorizationHeader,
      },
    });

    if (!response.ok) {
      return { friend: false };
    }

    const payload = (await response.json()) as Partial<FriendshipStatus>;
    return {
      friend: payload.friend === true,
      user: payload.user,
    };
  }
}
