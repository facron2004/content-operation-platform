import client from '../http-client';

export async function listUsers(
  params: { page?: number; pageSize?: number; keyword?: string } = {}
) {
  return client.get('/api/users', { params }).then((res) => res.data);
}

export async function getUser(id: string) {
  return client.get(`/api/users/${encodeURIComponent(id)}`).then((res) => res.data);
}

export async function getMe() {
  return client.get('/api/users/me').then((res) => res.data);
}

export async function createUser(data: {
  username: string;
  password: string;
  displayName?: string;
  email?: string;
  phone?: string;
}) {
  return client.post('/api/users', data).then((res) => res.data);
}

export async function updateUser(
  id: string,
  data: { displayName?: string; email?: string; phone?: string }
) {
  return client.patch(`/api/users/${encodeURIComponent(id)}`, data).then((res) => res.data);
}

export async function deactivateUser(id: string) {
  return client.post(`/api/users/${encodeURIComponent(id)}/deactivate`).then((res) => res.data);
}

export async function updateUserRoles(
  id: string,
  roles: { role: string; scopeType?: string; scopeId?: string }[]
) {
  return client
    .post(`/api/users/${encodeURIComponent(id)}/roles`, { roles })
    .then((res) => res.data);
}
