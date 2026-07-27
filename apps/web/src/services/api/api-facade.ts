import * as rulesApi from './rules.api';
import * as merchantApi from './merchant.api';
import * as overviewApi from './overview.api';
import * as zeroSalesApi from './zero-sales.api';
import * as dashboardApi from './dashboard.api';
import * as packageApi from './package.api';
import * as configApi from './config.api';
import * as copyApi from './copy.api';
import * as alertApi from './alert.api';
import * as communityApi from './community.api';
import * as performanceApi from './performance.api';
import * as gmvApi from './gmv.api';
import * as merchantSalesApi from './merchant-sales.api';
import * as dataAnalysisApi from './data-analysis.api';
import * as movementApi from './movement.api';
import * as refundApi from './refund.api';
import * as campaignApi from './campaign.api';
import * as taskApi from './task.api';
import * as communityLibraryApi from './community-library.api';
import * as userApi from './user.api';
import * as auditLogApi from './audit-log.api';
import { clearCache } from '../cache.service';
export const api = {
  ...rulesApi,
  ...merchantApi,
  ...overviewApi,
  ...zeroSalesApi,
  ...dashboardApi,
  ...packageApi,
  ...configApi,
  ...copyApi,
  ...alertApi,
  ...communityApi,
  ...performanceApi,
  ...gmvApi,
  ...merchantSalesApi,
  ...dataAnalysisApi,
  ...movementApi,
  ...refundApi,
  ...campaignApi,
  ...taskApi,
  ...communityLibraryApi,
  ...userApi,
  ...auditLogApi,
  clearCache
};
