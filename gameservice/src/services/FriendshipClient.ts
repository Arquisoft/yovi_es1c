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

export class FriendshipClient {
  constructor(private readonly baseUrl = process.env.USERS_SERVICE_URL ?? 'http://users:3000/api/users') {}

  async getFriendshipStatus(friendUserId: number, authorizationHeader: string): Promise<FriendshipStatus> {
    const response = await fetch(`${trimTrailingSlash(this.baseUrl)}/friends/${friendUserId}/status`, {
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
