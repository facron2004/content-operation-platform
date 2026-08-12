import client from '../http-client';
import { buildBusinessIntentKey, type ClientIdempotentOperation } from '../idempotency-key';

export interface MarketingPage<T> {
  items: T[];
  pagination: { page: number; pageSize: number; total: number; hasMore: boolean };
}

export interface MarketingTag {
  tagId: string;
  name: string;
  code: string;
  category: string;
  tagType: string;
  description: string | null;
  status: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserCoupon {
  userCouponId: string;
  couponId: string;
  memberId: string;
  couponCode: string;
  source: string;
  status: string;
  requestId: string;
  issuedAt: string;
  expiredAt: string | null;
}

export interface CampaignAttribution {
  attributionId: string;
  campaignId: string;
  channelId: string | null;
  memberId: string | null;
  orderId: string | null;
  eventType: string;
  eventTime: string;
  metadata: unknown;
  createdAt: string;
}

export interface Audience {
  audienceId: string;
  audienceNo: string;
  name: string;
  description: string | null;
  audienceType: string;
  ruleJson: unknown;
  estimatedCount: number;
  snapshotCount: number;
  status: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingCampaign {
  campaignId: string;
  name: string;
  description: string | null;
  campaignType: string;
  goalType: string;
  audienceId: string | null;
  benefits: unknown;
  channels: Array<{ channelId: string; channelType: string; config: unknown; status: string }>;
  targetMetrics: unknown;
  status: string;
  startDate: string;
  endDate: string;
  budgetFen: string;
  targetGmvFen: string;
  targetOrders: number;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CouponTemplate {
  couponId: string;
  couponNo: string;
  name: string;
  couponType: string;
  amountFen: string;
  thresholdFen: string;
  totalQuantity: number;
  issuedQuantity: number;
  userLimit: number;
  validType: string;
  validDays: number | null;
  validStartAt: string | null;
  validEndAt: string | null;
  scopeType: string;
  scope: unknown;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationFlow {
  flowId: string;
  flowNo: string;
  name: string;
  triggerType: string;
  condition: unknown;
  actions: unknown;
  status: string;
  runCount: number;
  conversionCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WeComCustomer {
  customerId: string;
  externalUserId: string;
  unionId: string | null;
  platformUserId: string | null;
  nickname: string | null;
  followUserId: string | null;
  source: string | null;
  status: string;
  tags: unknown;
  lastOrderAt: string | null;
  userValueFen: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WeComGroup {
  groupId: string;
  chatId: string;
  name: string;
  ownerUserId: string | null;
  regionId: string | null;
  groupType: string;
  memberCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrivateDomainChannel {
  channelId: string;
  channelNo: string;
  name: string;
  campaignId: string | null;
  employeeIds: unknown;
  groupIds: unknown;
  qrCodeUrl: string | null;
  status: string;
  exposureCount: number;
  scanCount: number;
  addCount: number;
  joinCount: number;
  orderCount: number;
  gmvFen: string;
  createdAt: string;
  updatedAt: string;
}

export interface SmsTemplate {
  templateId: string;
  templateNo: string;
  name: string;
  providerTemplateId: string | null;
  content: string;
  scene: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SmsTask {
  taskId: string;
  taskNo: string;
  name: string;
  templateId: string;
  audienceId: string | null;
  campaignId: string | null;
  scheduleAt: string | null;
  status: string;
  totalCount: number;
  successCount: number;
  failCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  capability: 'not_connected' | 'ready';
}

export interface MarketingPrivateSummary {
  activeTags: number;
  activeAudiences: number;
  runningCampaigns: number;
  activeCoupons: number;
  activeAutomationFlows: number;
  wecomCustomers: number;
  wecomGroups: number;
  privateChannels: number;
  pendingSmsTasks: number;
  benefitBalanceFen: string;
  capabilities: {
    wecom: 'not_connected' | 'ready';
    sms: 'not_connected' | 'ready';
    coupon: 'ready';
    benefitLedger: 'ready';
  };
}

function writeHeaders(operation: ClientIdempotentOperation, key: string) {
  return {
    headers: { 'Idempotency-Key': key || buildBusinessIntentKey(operation, crypto.randomUUID()) }
  };
}

export async function getMarketingPrivateSummary() {
  return (await client.get<MarketingPrivateSummary>('/marketing-private/summary')).data;
}

export async function listMarketingTags(params: {
  keyword?: string;
  category?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  return (await client.get<MarketingPage<MarketingTag>>('/marketing-private/tags', { params }))
    .data;
}

export async function createMarketingTag(
  payload: { name: string; code: string; category: string; tagType?: string; description?: string },
  key: string
) {
  return (
    await client.post<MarketingTag>(
      '/marketing-private/tags',
      payload,
      writeHeaders('marketing-tag', key)
    )
  ).data;
}

export async function setMarketingTagStatus(
  tagId: string,
  status: 'active' | 'disabled',
  key: string
) {
  return (
    await client.post<MarketingTag>(
      `/marketing-private/tags/${encodeURIComponent(tagId)}/${status === 'active' ? 'enable' : 'disable'}`,
      {},
      writeHeaders('marketing-tag', key)
    )
  ).data;
}

export async function assignMarketingTag(
  tagId: string,
  payload: { memberId: string; source?: string },
  key: string
) {
  return (
    await client.post<MarketingTag>(
      `/marketing-private/tags/${encodeURIComponent(tagId)}/members`,
      payload,
      writeHeaders('marketing-tag', key)
    )
  ).data;
}

export async function listMarketingAudiences(params: {
  keyword?: string;
  audienceType?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  return (await client.get<MarketingPage<Audience>>('/marketing-private/audiences', { params }))
    .data;
}

export async function createMarketingAudience(
  payload: {
    name: string;
    description?: string;
    audienceType: string;
    ruleJson: string;
    estimatedCount?: number;
  },
  key: string
) {
  return (
    await client.post<Audience>(
      '/marketing-private/audiences',
      payload,
      writeHeaders('audience', key)
    )
  ).data;
}

export async function refreshMarketingAudience(audienceId: string, key: string) {
  return (
    await client.post<Audience>(
      `/marketing-private/audiences/${encodeURIComponent(audienceId)}/refresh`,
      {},
      writeHeaders('audience', key)
    )
  ).data;
}

export async function listMarketingCampaigns(params: {
  keyword?: string;
  goalType?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  return (
    await client.get<MarketingPage<MarketingCampaign>>('/marketing-private/campaigns', { params })
  ).data;
}

export async function getMarketingCampaign(campaignId: string) {
  return (
    await client.get<MarketingCampaign>(
      `/marketing-private/campaigns/${encodeURIComponent(campaignId)}`
    )
  ).data;
}

export async function createMarketingCampaign(payload: Record<string, unknown>, key: string) {
  return (
    await client.post<MarketingCampaign>(
      '/marketing-private/campaigns',
      payload,
      writeHeaders('marketing-campaign', key)
    )
  ).data;
}

export async function transitionMarketingCampaign(
  campaignId: string,
  action: 'start' | 'pause' | 'complete',
  key: string
) {
  return (
    await client.post<MarketingCampaign>(
      `/marketing-private/campaigns/${encodeURIComponent(campaignId)}/${action}`,
      {},
      writeHeaders('marketing-campaign', key)
    )
  ).data;
}

export async function listCampaignAttributions(
  campaignId: string,
  params: { page?: number; pageSize?: number } = {}
) {
  return (
    await client.get<MarketingPage<CampaignAttribution>>(
      `/marketing-private/campaigns/${encodeURIComponent(campaignId)}/attribution`,
      { params }
    )
  ).data;
}

export async function recordCampaignAttribution(
  campaignId: string,
  payload: {
    channelId?: string;
    memberId?: string;
    orderId?: string;
    eventType: string;
    metadataJson?: string;
  },
  key: string
) {
  return (
    await client.post<CampaignAttribution>(
      `/marketing-private/campaigns/${encodeURIComponent(campaignId)}/attribution`,
      payload,
      writeHeaders('marketing-campaign', key)
    )
  ).data;
}

export async function listCouponTemplates(params: {
  keyword?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  return (await client.get<MarketingPage<CouponTemplate>>('/marketing-private/coupons', { params }))
    .data;
}

export async function createCouponTemplate(payload: Record<string, unknown>, key: string) {
  return (
    await client.post<CouponTemplate>(
      '/marketing-private/coupons',
      payload,
      writeHeaders('coupon', key)
    )
  ).data;
}

export async function disableCouponTemplate(couponId: string, key: string) {
  return (
    await client.post<CouponTemplate>(
      `/marketing-private/coupons/${encodeURIComponent(couponId)}/disable`,
      {},
      writeHeaders('coupon', key)
    )
  ).data;
}

export async function setCouponTemplateStatus(
  couponId: string,
  status: 'active' | 'disabled',
  key: string
) {
  return (
    await client.post<CouponTemplate>(
      `/marketing-private/coupons/${encodeURIComponent(couponId)}/${status === 'active' ? 'enable' : 'disable'}`,
      {},
      writeHeaders('coupon', key)
    )
  ).data;
}

export async function issueCoupon(
  couponId: string,
  payload: { memberId: string; source?: string; expiredAt?: string },
  key: string
) {
  return (
    await client.post<UserCoupon>(
      `/marketing-private/coupons/${encodeURIComponent(couponId)}/issue`,
      payload,
      writeHeaders('coupon', key)
    )
  ).data;
}

export async function listAutomationFlows(params: {
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  return (
    await client.get<MarketingPage<AutomationFlow>>('/marketing-private/automation', { params })
  ).data;
}

export async function createAutomationFlow(payload: Record<string, unknown>, key: string) {
  return (
    await client.post<AutomationFlow>(
      '/marketing-private/automation',
      payload,
      writeHeaders('automation', key)
    )
  ).data;
}

export async function setAutomationFlowStatus(
  flowId: string,
  status: 'active' | 'disabled',
  key: string
) {
  return (
    await client.post<AutomationFlow>(
      `/marketing-private/automation/${encodeURIComponent(flowId)}/${status === 'active' ? 'enable' : 'disable'}`,
      {},
      writeHeaders('automation', key)
    )
  ).data;
}

export async function listWeComCustomers(params: {
  keyword?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  return (
    await client.get<MarketingPage<WeComCustomer>>('/marketing-private/wecom/customers', { params })
  ).data;
}

export async function createWeComCustomer(payload: Record<string, unknown>, key: string) {
  return (
    await client.post<WeComCustomer>(
      '/marketing-private/wecom/customers',
      payload,
      writeHeaders('private-domain', key)
    )
  ).data;
}

export async function listWeComGroups(params: {
  keyword?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  return (
    await client.get<MarketingPage<WeComGroup>>('/marketing-private/wecom/groups', { params })
  ).data;
}

export async function createWeComGroup(payload: Record<string, unknown>, key: string) {
  return (
    await client.post<WeComGroup>(
      '/marketing-private/wecom/groups',
      payload,
      writeHeaders('private-domain', key)
    )
  ).data;
}

export async function listPrivateChannels(params: {
  keyword?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  return (
    await client.get<MarketingPage<PrivateDomainChannel>>('/marketing-private/channels', { params })
  ).data;
}

export async function createPrivateChannel(payload: Record<string, unknown>, key: string) {
  return (
    await client.post<PrivateDomainChannel>(
      '/marketing-private/channels',
      payload,
      writeHeaders('private-domain', key)
    )
  ).data;
}

export async function listSmsTemplates(params: {
  keyword?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  return (
    await client.get<MarketingPage<SmsTemplate>>('/marketing-private/sms/templates', { params })
  ).data;
}

export async function createSmsTemplate(payload: Record<string, unknown>, key: string) {
  return (
    await client.post<SmsTemplate>(
      '/marketing-private/sms/templates',
      payload,
      writeHeaders('sms-task', key)
    )
  ).data;
}

export async function listSmsTasks(params: { status?: string; page?: number; pageSize?: number }) {
  return (await client.get<MarketingPage<SmsTask>>('/marketing-private/sms/tasks', { params }))
    .data;
}

export async function createSmsTask(payload: Record<string, unknown>, key: string) {
  return (
    await client.post<SmsTask>(
      '/marketing-private/sms/tasks',
      payload,
      writeHeaders('sms-task', key)
    )
  ).data;
}

export async function triggerSmsTask(taskId: string, key: string) {
  return (
    await client.post<SmsTask>(
      `/marketing-private/sms/tasks/${encodeURIComponent(taskId)}/trigger`,
      {},
      writeHeaders('sms-task', key)
    )
  ).data;
}

export async function grantBenefit(
  payload: { memberId: string; amountFen: string; businessId: string; remark?: string },
  key: string
) {
  return (
    await client.post(
      '/marketing-private/benefits/grant',
      payload,
      writeHeaders('benefit-grant', key)
    )
  ).data;
}
