import client from '../http-client';

export async function listUsers(
  params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    // Residual #208: 0|1 active filter (mirrors CommunityQueryDto).
    isActive?: number;
  } = {}
) {
  const raw = await client.get('/users', { params }).then((res) => res.data);
  // Residual #191: API returns { data, total, page, pageSize }; normalize to items
  // (same shape class as audit logs / residual #185).
  if (raw && Array.isArray(raw.items)) return raw;
  if (raw && Array.isArray(raw.data)) {
    return {
      items: raw.data,
      total: raw.total ?? 0,
      page: raw.page,
      pageSize: raw.pageSize
    };
  }
  return { items: [], total: 0, page: params.page ?? 1, pageSize: params.pageSize ?? 20 };
}

export async function getMe() {
  return client.get('/users/me').then((res) => res.data);
}

// Residual #244: CreateUserDto.roles already accepted + insertRoleBindings on create.
export async function createUser(data: {
  username: string;
  password: string;
  displayName?: string;
  email?: string;
  phone?: string;
  roles?: { role: string; scopeType?: string; scopeId?: string }[];
}) {
  return client.post('/users', data).then((res) => res.data);
}

// Residual #183: password optional (admin reset); matches UpdateUserDto.
export async function updateUser(
  id: string,
  data: {
    displayName?: string;
    email?: string;
    phone?: string;
    password?: string;
    isActive?: boolean;
  }
) {
  return client.patch(`/users/${encodeURIComponent(id)}`, data).then((res) => res.data);
}

export async function deactivateUser(id: string) {
  return client.post(`/users/${encodeURIComponent(id)}/deactivate`).then((res) => res.data);
}

export async function updateUserRoles(
  id: string,
  roles: { role: string; scopeType?: string; scopeId?: string }[]
) {
  return client.post(`/users/${encodeURIComponent(id)}/roles`, { roles }).then((res) => res.data);
}
