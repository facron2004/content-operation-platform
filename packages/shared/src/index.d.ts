export type UserRole = 'platform_operator' | 'area_operator' | 'merchant_operator' | 'auditor' | 'admin';
export type PackageType = 'welfare' | 'commission' | 'fallback';
export type PackageStatus = 'pending_launch' | 'cold_start' | 'healthy_sales' | 'surging' | 'nearly_sold_out' | 'sold_out' | 'poor_sales' | 'high_refund_risk' | 'high_verify' | 'low_verify' | 'unclear_selling_point' | 'conversion_weak';
export type PromotionLevel = 'S' | 'A' | 'B' | 'C' | 'D';
export type StrategyType = 'preheat' | 'launch' | 'sprint' | 'fallback' | 'wake_up' | 'conversion_optimize' | 'verify_reminder' | 'merchant_co_promotion' | 'leader_growth';
export type Channel = 'wechat_group' | 'moments' | 'merchant_share';
export type AuditStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'risk';
export interface ContentPackage {
    packageId: string;
    packageName: string;
    packageType: PackageType;
    merchantId: string;
    merchantName: string;
    areaId: string;
    areaName: string;
    category: string;
    originalPrice: number;
    salePrice: number;
    welfarePrice?: number | null;
    commissionRate: number;
    grossProfit: number;
    stockTotal: number;
    stockLeft: number;
    startTime: string;
    endTime: string;
    useRules: string[];
    sellingPoints: string[];
    fallbackPackageId?: string | null;
    miniProgramPath: string;
    merchantCooperationScore: number;
    areaMatchScore: number;
    timeMatchScore: number;
    historyScore: number;
}
export interface SalesSnapshot {
    packageId: string;
    areaId: string;
    merchantId: string;
    snapshotTime: string;
    exposureCount: number;
    clickCount: number;
    orderCount: number;
    paidOrderCount: number;
    refundCount: number;
    verifyCount: number;
    gmv: number;
    paidAmount: number;
    refundAmount: number;
    conversionRate: number;
    verifyRate: number;
    refundRate: number;
    sellThroughRate: number;
    remainingStock: number;
    salesSpeed: number;
}
export interface PromotionScore {
    packageId: string;
    areaId: string;
    score: number;
    level: PromotionLevel;
    status: PackageStatus;
    recommendedStrategy: StrategyType;
    reason: string;
    riskTips: string[];
    recommendedChannels: Channel[];
    copyAngles: string[];
    calculatedAt: string;
}
export interface GeneratedCopy {
    contentId: string;
    packageId: string;
    areaId: string;
    merchantId: string;
    channel: Channel;
    scenario: string;
    title: string;
    body: string;
    cta: string;
    copyVersion: string;
    strategyType: StrategyType;
    riskLevel: 'low' | 'medium' | 'high';
    riskTips: string[];
    auditStatus: AuditStatus;
    auditRemark?: string | null;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}
export interface CopyPerformance {
    id: string;
    contentId: string;
    packageId: string;
    channel: Channel;
    groupId?: string | null;
    leaderId?: string | null;
    exposureCount: number;
    clickCount: number;
    orderCount: number;
    paidOrderCount: number;
    verifyCount: number;
    refundCount: number;
    gmv: number;
    conversionRate: number;
    createdAt: string;
    updatedAt: string;
}
export interface GenerateCopyRequest {
    packageId: string;
    channel: Channel;
    scenario: string;
    tone: string;
    copyCount: number;
    createdBy?: string;
}
export interface AuditCopyRequest {
    auditStatus: Extract<AuditStatus, 'approved' | 'rejected' | 'risk'>;
    auditRemark?: string;
    title?: string;
    body?: string;
}
export interface RecommendPackageItem extends ContentPackage {
    status: PackageStatus;
    promotionLevel: PromotionLevel;
    promotionScore: number;
    recommendedStrategy: StrategyType;
    reason: string;
    riskTips: string[];
    recommendedChannels: Channel[];
    conversionRate: number;
    verifyRate: number;
    refundRate: number;
}
