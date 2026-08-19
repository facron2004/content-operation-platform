<template>
  <section v-loading="loading" class="page-stack user-center-view">
    <div class="page-toolbar">
      <el-button type="primary" :loading="refreshing" :disabled="refreshing" @click="refreshMembers">
        <el-icon><Refresh /></el-icon>
        同步新增用户
      </el-button>
      <el-button :loading="loading" :disabled="refreshing" @click="reload">
        刷新当前页
      </el-button>
      <span class="user-center-refresh-status">{{ refreshStatusText || '当前页查询不会触发全量目录同步' }}</span>
    </div>

    <ErrorAlert :message="error" />
    <ErrorAlert :message="detailError" />
    <ErrorAlert :message="refreshError" />

    <div class="user-center-metrics">
      <article class="user-center-metric">
          <span>用户总数</span>
          <strong>{{ formatCount(summary.totalMembers) }}</strong>
          <small>{{ dataSources.includes('JeeSite Member') ? 'JeeSite 会员主档' : '当前客户档案' }}</small>
      </article>
      <article class="user-center-metric user-center-metric--new-members">
        <div class="user-center-metric__heading">
          <span>新增用户</span>
          <small>
            {{
              summary.newMembersBasis === 'sourceCreatedAt'
                ? '按源站注册时间'
                : summary.newMembersBasis === 'firstSeenAt'
                  ? '按本地首次发现时间'
                  : '完成目录刷新后可统计'
            }}
          </small>
        </div>
        <div class="user-center-new-members-values">
          <div>
            <strong>{{ formatCount(summary.newMembersToday) }}</strong>
            <span>今日</span>
          </div>
          <div>
            <strong>{{ formatCount(summary.newMembersThisWeek) }}</strong>
            <span>本周</span>
          </div>
          <div>
            <strong>{{ formatCount(summary.newMembersThisMonth) }}</strong>
            <span>本月</span>
          </div>
        </div>
        <small>自然周按周一至今，自然月按每月 1 日至今</small>
      </article>
      <article class="user-center-metric">
        <span>已支付用户</span>
        <strong>{{ formatCount(summary.paidMembers) }}</strong>
        <small>至少完成一笔支付</small>
      </article>
      <article class="user-center-metric">
        <span>近 30 日活跃</span>
        <strong>{{ formatCount(summary.activeMembers30d) }}</strong>
        <small>按最近下单时间统计</small>
      </article>
      <article class="user-center-metric user-center-metric--accent">
        <span>累计用户 GMV</span>
        <strong>{{ displayFen(summary.totalGmvFen) }}</strong>
        <small>{{ formatCount(summary.totalOrders) }} 笔订单</small>
      </article>
    </div>

    <div class="user-center-content">
      <section class="panel user-center-list-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">CUSTOMER DIRECTORY</p>
            <h2>客户列表</h2>
          </div>
          <span class="section-meta">共 {{ formatCount(pagination.total) }} 人</span>
        </div>

        <div class="user-center-toolbar">
          <el-input
            v-model="search"
            clearable
            placeholder="搜索昵称、手机号、邀请码或用户 ID"
            @keyup.enter="applyFilters"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select v-model="level" clearable placeholder="用户等级" @change="applyFilters">
            <el-option label="普通用户" value="normal" />
            <el-option label="银卡用户" value="silver" />
            <el-option label="金卡用户" value="gold" />
            <el-option label="会员用户" value="member" />
          </el-select>
          <el-button type="primary" @click="applyFilters">查询</el-button>
        </div>

        <el-table
          :data="items"
          row-key="memberId"
          highlight-current-row
          :current-row-key="selectedMemberId"
          @row-click="selectTableMember"
        >
          <el-table-column label="用户" min-width="180">
            <template #default="{ row }">
              <div class="user-cell">
                <strong>{{ row.nickname || '未命名用户' }}</strong>
                <small>{{ row.memberId }}</small>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="邀请码" min-width="126" prop="inviteCode">
            <template #default="{ row }">{{ row.inviteCode || '—' }}</template>
          </el-table-column>
          <el-table-column label="上级邀请码" min-width="126" prop="parentInviteCode">
            <template #default="{ row }">{{ row.parentInviteCode || '—' }}</template>
          </el-table-column>
          <el-table-column label="下级用户数" width="104" align="right" prop="downlineCount" />
          <el-table-column label="等级" width="94">
            <template #default="{ row }">
              <el-tag size="small" effect="plain">{{ row.level || '普通' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="手机号" width="128" prop="phone" />
          <el-table-column label="订单" width="78" align="right" prop="totalOrders" />
          <el-table-column label="累计 GMV" width="128" align="right">
            <template #default="{ row }">{{ displayFen(row.totalGmvFen) }}</template>
          </el-table-column>
          <el-table-column label="最近下单" width="112">
            <template #default="{ row }">{{ displayDate(row.lastOrderAt) }}</template>
          </el-table-column>
        </el-table>

        <el-empty v-if="!loading && !items.length" description="暂无匹配用户" />
        <div v-if="pagination.total > pagination.pageSize" class="user-center-pagination">
          <el-pagination
            :current-page="pagination.page"
            :page-size="pagination.pageSize"
            :total="pagination.total"
            layout="prev, pager, next"
            @current-change="setPage"
          />
        </div>
      </section>

      <aside v-loading="detailLoading" class="panel user-center-detail-panel">
        <template v-if="selectedMember">
          <div class="user-detail-header">
            <div>
              <p class="eyebrow">CUSTOMER PROFILE</p>
              <h2>{{ selectedMember.nickname || '未命名用户' }}</h2>
              <p>{{ selectedMember.phone || '未登记手机号' }} · {{ selectedMember.memberId }}</p>
            </div>
            <el-tag effect="plain">{{ selectedMember.level || '普通' }}</el-tag>
          </div>

          <div class="user-detail-stats">
            <div>
              <span>累计 GMV</span>
              <strong>{{ displayFen(selectedMember.totalGmvFen) }}</strong>
            </div>
            <div>
              <span>订单数</span>
              <strong>{{ formatCount(selectedMember.totalOrders) }}</strong>
            </div>
            <div>
              <span>积分余额</span>
              <strong>{{ formatCount(selectedMember.pointsBalance) }}</strong>
            </div>
            <div>
              <span>福利金余额</span>
              <strong>{{ displayFen(selectedMember.welfareBalanceFen) }}</strong>
            </div>
            <div>
              <span>钱包余额</span>
              <strong>{{ displayFen(selectedMember.walletBalanceFen) }}</strong>
            </div>
          </div>

          <div class="user-detail-referral">
            <div>
              <span>邀请码</span>
              <strong>{{ selectedMember.inviteCode || '—' }}</strong>
            </div>
            <div>
              <span>上级邀请码</span>
              <strong>{{ selectedMember.parentInviteCode || '—' }}</strong>
            </div>
            <div>
              <span>直属下级</span>
              <strong>{{ formatCount(selectedMember.downlineCount) }}</strong>
            </div>
          </div>
          <div class="user-detail-referral">
            <div>
              <span>源站注册时间</span>
              <strong>{{ displayDateTime(selectedMember.sourceCreatedAt) }}</strong>
            </div>
            <div>
              <span>源站更新时间</span>
              <strong>{{ displayDateTime(selectedMember.sourceUpdatedAt) }}</strong>
            </div>
            <div>
              <span>最近登录</span>
              <strong>{{ displayDateTime(selectedMember.sourceLastLoginAt) }}</strong>
            </div>
          </div>

          <div v-if="selectedMember.tags" class="user-tags">
            <el-tag v-for="tag in selectedMember.tags.split(',')" :key="tag" size="small">
              {{ tag.trim() }}
            </el-tag>
          </div>

          <div class="user-detail-section">
            <div class="section-heading section-heading--compact">
              <h3>最近订单</h3>
              <span class="section-meta">最近 {{ detail?.orders.length ?? 0 }} 笔</span>
            </div>
            <div v-if="detail?.orders.length" class="order-list">
              <div v-for="order in detail.orders" :key="order.orderId" class="order-row">
                <div class="order-row__main">
                  <strong>{{ order.orderCode || order.orderId }}</strong>
                  <small>
                    {{ order.merchantName || '未标注商家' }} · {{ displayDate(order.orderTime) }}
                  </small>
                </div>
                <div class="order-row__side">
                  <strong>{{ displayFen(order.paidAmountFen || order.orderAmountFen) }}</strong>
                  <small>{{ statusLabel(order.status) }}</small>
                </div>
              </div>
            </div>
            <el-empty v-else description="暂无订单记录" :image-size="48" />
          </div>

          <div class="user-detail-section">
            <div class="section-heading section-heading--compact">
              <h3>积分流水</h3>
              <span class="section-meta">最近 {{ detail?.pointLedgers.length ?? 0 }} 条</span>
            </div>
            <div v-if="detail?.pointLedgers.length" class="ledger-list">
              <div v-for="ledger in detail.pointLedgers" :key="ledger.id" class="ledger-row">
                <div>
                  <strong>{{ ledger.reason }}</strong>
                  <small>{{ displayDateTime(ledger.occurredAt) }}</small>
                </div>
                <strong :class="ledger.delta >= 0 ? 'ledger-positive' : 'ledger-negative'">
                  {{ ledger.delta >= 0 ? '+' : '' }}{{ ledger.delta }}
                </strong>
              </div>
            </div>
            <el-empty v-else description="暂无积分流水" :image-size="48" />
          </div>
        </template>
        <el-empty v-else description="选择一个用户查看详情" />
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Refresh, Search } from '@element-plus/icons-vue';
import ErrorAlert from '../components/ErrorAlert.vue';
import { useUserCenter } from '../features/user-center/useUserCenter';
import type { UserCenterMemberItem } from '../services/api/user-center.api';

const {
  search,
  level,
  loading,
  detailLoading,
  error,
  detailError,
  refreshError,
  refreshStatusText,
  items,
  selectedMemberId,
  selectedMember,
  detail,
  summary,
  pagination,
  dataSources,
  refreshing,
  reload,
  refreshMembers,
  applyFilters,
  setPage,
  selectMember,
  displayFen,
  displayDate,
  displayDateTime,
  statusLabel
} = useUserCenter();

const formatCount = (value: number | null | undefined) =>
  value == null ? '—' : value.toLocaleString('zh-CN');
const selectTableMember = (row: UserCenterMemberItem) => selectMember(row.memberId, true, row.inviteCode);
</script>

<style src="../styles/views/user-center.css" scoped></style>
