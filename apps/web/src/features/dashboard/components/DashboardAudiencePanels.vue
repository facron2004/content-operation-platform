<template>
  <div class="dashboard-audience-grid">
    <section class="dashboard-panel audience-panel">
      <div class="dashboard-panel__header dashboard-panel__header--compact">
        <div>
          <div class="dashboard-section-label">06 / USERS</div>
          <h2>用户运营</h2>
          <p>不堆人群报表，只呈现最需要经营的结构。</p>
        </div>
        <User class="audience-panel__header-icon" />
      </div>
      <div class="audience-stats">
        <div
          v-for="item in users.stats"
          :key="item.label"
          class="audience-stat"
          :class="`is-${item.tone}`"
        >
          <span>{{ item.label }}</span>
          <strong>{{ count(item.value) }}</strong>
        </div>
      </div>
      <div class="lifecycle-layout">
        <div class="lifecycle-bars">
          <div v-for="item in users.lifecycle" :key="item.label" class="lifecycle-row">
            <span>{{ item.label }}</span>
            <div class="lifecycle-row__track">
              <i :style="{ width: `${item.share}%`, background: item.color }" />
            </div>
            <strong>{{ item.share }}%</strong>
          </div>
        </div>
        <div class="recall-card">
          <span class="recall-card__tag">AI 建议召回</span>
          <strong>{{ count(users.dormantHighValue) }} 名高价值用户</strong>
          <p>已连续 14 天未消费，可发送 5 元优惠券进行召回。</p>
          <button type="button" @click="$emit('recall')">
            立即创建召回
            <ArrowRight />
          </button>
        </div>
      </div>
    </section>

    <section class="dashboard-panel audience-panel community-panel">
      <div class="dashboard-panel__header dashboard-panel__header--compact">
        <div>
          <div class="dashboard-section-label">06 / PRIVATE DOMAIN</div>
          <h2>社群 / 企微运营</h2>
          <p>把数据洞察直接变成社群发送动作。</p>
        </div>
        <button type="button" class="dashboard-text-action" @click="$emit('open-community')">
          社群中心
          <ArrowRight />
        </button>
      </div>
      <div class="community-stats">
        <div
          v-for="item in community.stats"
          :key="item.label"
          class="community-stat"
          :class="`is-${item.tone}`"
        >
          <span>{{ item.label }}</span>
          <strong>{{ item.format === 'currency' ? money(item.value) : count(item.value) }}</strong>
        </div>
      </div>
      <div class="community-body">
        <div class="community-group-list">
          <div class="community-group-list__head">
            <span>社群 TOP3</span>
            <span>GMV</span>
          </div>
          <div
            v-for="(item, index) in community.groups"
            :key="item.name"
            class="community-group-row"
          >
            <span>
              <i>{{ index + 1 }}</i>
              {{ item.name }}
            </span>
            <strong>{{ money(item.gmv) }}</strong>
          </div>
        </div>
        <div class="send-time-card">
          <span class="send-time-card__label">今日最佳发送时间</span>
          <strong>{{ community.bestSendTime }}</strong>
          <p>{{ community.bestSendReason }}</p>
          <button type="button" @click="$emit('open-community')">
            查看发送建议
            <ArrowRight />
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ArrowRight, User } from '@element-plus/icons-vue';
import type { DashboardCommunityData, DashboardUserData } from '../operations-dashboard';

defineProps<{
  users: DashboardUserData;
  community: DashboardCommunityData;
}>();

defineEmits<{
  recall: [];
  'open-community': [];
}>();

const count = (value: number) => Math.round(value).toLocaleString('zh-CN');
const money = (value: number) => `¥${Math.round(value).toLocaleString('zh-CN')}`;
</script>

<style scoped>
.dashboard-audience-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(0, 0.88fr);
  gap: 10px;
}

.audience-panel {
  min-width: 0;
  padding: 18px 20px 16px;
}

.dashboard-panel__header--compact {
  margin-bottom: 14px;
}

.audience-panel__header-icon {
  width: 18px;
  color: #7b61c9;
}

.dashboard-text-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: #2f78d0;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
}

.dashboard-text-action svg,
.recall-card button svg,
.send-time-card button svg {
  width: 13px;
}

.audience-stats,
.community-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 7px;
}

.audience-stat,
.community-stat {
  display: grid;
  gap: 6px;
  padding: 10px 9px;
  border-radius: 8px;
  background: #f7f9fb;
}

.audience-stat span,
.community-stat span {
  color: #8390a1;
  font-size: 10px;
}

.audience-stat strong,
.community-stat strong {
  color: #2b3a4d;
  font-family: var(--font-numeric);
  font-size: 15px;
}

.audience-stat.is-orange,
.community-stat.is-orange {
  background: #fff8ed;
}

.audience-stat.is-orange strong,
.community-stat.is-orange strong {
  color: #c5791a;
}

.audience-stat.is-blue,
.community-stat.is-blue {
  background: #f1f7ff;
}

.audience-stat.is-blue strong,
.community-stat.is-blue strong {
  color: #3479ce;
}

.audience-stat.is-green {
  background: #eefaf5;
}

.audience-stat.is-green strong {
  color: #168d6b;
}

.audience-stat.is-purple,
.community-stat.is-purple {
  background: #f6f2ff;
}

.audience-stat.is-purple strong,
.community-stat.is-purple strong {
  color: #7459bb;
}

.community-stat.is-teal {
  background: #eefbf9;
}

.community-stat.is-teal strong {
  color: #168e82;
}

.lifecycle-layout,
.community-body {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(190px, 0.9fr);
  gap: 14px;
  align-items: stretch;
  margin-top: 16px;
}

.lifecycle-bars {
  display: grid;
  align-content: center;
  gap: 10px;
}

.lifecycle-row {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr) 30px;
  align-items: center;
  gap: 8px;
  color: #7e8b9c;
  font-size: 10px;
}

.lifecycle-row__track {
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: #edf1f5;
}

.lifecycle-row__track i {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.lifecycle-row strong {
  color: #53657c;
  font-family: var(--font-numeric);
  font-size: 10px;
  text-align: right;
}

.recall-card {
  display: grid;
  align-content: center;
  gap: 6px;
  padding: 12px;
  border: 1px solid #dfe8fb;
  border-radius: 10px;
  background: linear-gradient(135deg, #f7faff, #f3f7ff);
}

.recall-card__tag {
  color: #3b82f6;
  font-size: 10px;
  font-weight: 800;
}

.recall-card strong {
  color: #2d4260;
  font-size: 13px;
}

.recall-card p,
.send-time-card p {
  margin: 0;
  color: #71839a;
  font-size: 10px;
  line-height: 1.55;
}

.recall-card button,
.send-time-card button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: max-content;
  padding: 0;
  border: 0;
  background: transparent;
  color: #2f78d0;
  cursor: pointer;
  font-size: 10px;
  font-weight: 800;
}

.community-body {
  grid-template-columns: minmax(0, 1fr) minmax(150px, 0.85fr);
}

.community-group-list {
  display: grid;
  align-content: start;
}

.community-group-list__head,
.community-group-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.community-group-list__head {
  padding-bottom: 8px;
  border-bottom: 1px solid #edf1f5;
  color: #9aa6b5;
  font-size: 10px;
}

.community-group-row {
  padding: 10px 0;
  border-bottom: 1px solid #f1f3f6;
  color: #5e6f84;
  font-size: 11px;
}

.community-group-row span {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 7px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.community-group-row i {
  display: inline-grid;
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 5px;
  background: #f1f4f7;
  color: #8291a4;
  font-family: var(--font-numeric);
  font-size: 10px;
  font-style: normal;
}

.community-group-row strong {
  color: #2b3b51;
  font-family: var(--font-numeric);
  font-size: 11px;
}

.send-time-card {
  display: grid;
  align-content: center;
  gap: 6px;
  padding: 12px;
  border-radius: 10px;
  background: #faf7ff;
}

.send-time-card__label {
  color: #8e7bb9;
  font-size: 10px;
  font-weight: 700;
}

.send-time-card > strong {
  color: #6f56b3;
  font-family: var(--font-numeric);
  font-size: 26px;
  letter-spacing: -0.04em;
}

@media (max-width: 1080px) {
  .dashboard-audience-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 620px) {
  .audience-stats,
  .community-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .lifecycle-layout,
  .community-body {
    grid-template-columns: 1fr;
  }
}
</style>
