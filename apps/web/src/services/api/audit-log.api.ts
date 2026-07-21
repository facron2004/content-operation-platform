import client from '../http-client';

export async function listAuditLogs(
  params: {
    userId?: string;
    action?: string;
    objectType?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  } = {}
) {
  return client.get('/api/audit-logs', { params }).then((res) => res.data);
}

export async function getAuditLog(id: string) {
  return client.get(`/api/audit-logs/${encodeURIComponent(id)}`).then((res) => res.data);
}
