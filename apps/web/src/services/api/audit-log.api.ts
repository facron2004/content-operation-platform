import client from '../http-client';

export async function listAuditLogs(
  params: {
    userId?: string;
    action?: string;
    objectType?: string;
    // Residual #185: match AuditLogQueryDto date keys (legacy misnamed keys never wired).
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const raw = await client.get('/audit-logs', { params }).then((res) => res.data);
  // Residual #185: API returns { data, total, page, pageSize }; normalize to items.
  // Residual #273: forward INTERACTIVE window (dateFrom/dateTo) for SPA honesty.
  if (raw && Array.isArray(raw.items)) {
    return {
      ...raw,
      dateFrom: raw.dateFrom,
      dateTo: raw.dateTo
    };
  }
  if (raw && Array.isArray(raw.data)) {
    return {
      items: raw.data,
      total: raw.total ?? 0,
      page: raw.page,
      pageSize: raw.pageSize,
      dateFrom: raw.dateFrom,
      dateTo: raw.dateTo
    };
  }
  return { items: [], total: 0, page: params.page ?? 1, pageSize: params.pageSize ?? 20 };
}

export async function getAuditLog(id: string) {
  return client.get(`/audit-logs/${encodeURIComponent(id)}`).then((res) => res.data);
}
