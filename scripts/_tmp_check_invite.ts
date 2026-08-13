import { PrismaClient } from '@prisma/client';
import { mapJeesiteOrderListToDataset } from '../apps/api/src/content/jeesite-order-adapter';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db' } }
});

const EXTERNAL_API_BASE_URL = process.env.EXTERNAL_API_BASE_URL ?? '';
const JEESITE_COOKIE = process.env.JEESITE_SESSION_ID ?? process.env.EXTERNAL_API_COOKIE ?? '';

function unwrapRows(payload: any): any[] {
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

async function fetchPage(pageNo: number) {
  const url = new URL(`${EXTERNAL_API_BASE_URL.replace(/\/$/, '')}/bargain/bargainOrder/listData`);
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('pageSize', '50');
  const cookie = JEESITE_COOKIE.startsWith('jeesite.session.id=')
    ? JEESITE_COOKIE
    : `jeesite.session.id=${JEESITE_COOKIE}`;
  const res = await fetch(url.toString(), { headers: { Cookie: cookie } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

(async () => {
  try {
    const payload = await fetchPage(1);
    const list = unwrapRows(payload);
    console.log('FETCHED:', list.length, 'orders');
    if (list.length) {
      const first = list[0];
      console.log('FIRST_ROW_KEYS:', Object.keys(first).join(','));
      if (first.centerMember && typeof first.centerMember === 'object') {
        console.log('CENTER_MEMBER_KEYS:', Object.keys(first.centerMember).join(','));
        console.log('CENTER_MEMBER:', JSON.stringify(first.centerMember).slice(0, 500));
      }
    }
    const { orders } = mapJeesiteOrderListToDataset(payload);
    console.log('MAPPED:', orders.length, 'orders');
    if (orders.length) {
      console.log('FIRST_ORDER memberId:', orders[0].memberId);
      console.log('FIRST_ORDER inviteCode:', orders[0].inviteCode);
      console.log('FIRST_ORDER parentInviteCode:', orders[0].parentInviteCode);
    }
    const withInvite = orders.filter((o) => o.inviteCode).length;
    const withParent = orders.filter((o) => o.parentInviteCode).length;
    console.log('WITH_INVITE:', withInvite, 'WITH_PARENT:', withParent, 'OF', orders.length);
  } catch (e: any) {
    console.error('ERR:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
