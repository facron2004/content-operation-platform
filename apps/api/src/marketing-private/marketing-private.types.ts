export interface MarketingPage<T> {
  items: T[];
  pagination: { page: number; pageSize: number; total: number; hasMore: boolean };
}

export interface MarketingTagView {
  tagId: string;
  name: string;
  code: string;
  category: string;
  tagType: string;
  description: string | null;
  status: string;
  memberCount: number;
  ruleJson: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface TagRuleEvaluationView {
  tag: MarketingTagView;
  matchedCount: number;
  addedCount: number;
  removedCount: number;
  evaluatedAt: string;
}

export interface TagRulePreviewMemberView {
  memberId: string;
  nickname: string | null;
  phone: string | null;
  level: string | null;
  paidOrderCount: number;
  paidGmvFen: string | null;
}

export interface TagRulePreviewView {
  matchedCount: number;
  sample: TagRulePreviewMemberView[];
}

export interface AudienceView {
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

export interface MarketingCampaignView {
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

export interface CouponTemplateView {
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

export interface UserCouponView {
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

export interface CampaignAttributionView {
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

export interface AutomationFlowView {
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

export interface WeComCustomerView {
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

export interface WeComGroupView {
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

export interface PrivateDomainChannelView {
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

export interface SmsTemplateView {
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

export interface SmsTaskView {
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
