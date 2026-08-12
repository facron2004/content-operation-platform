<template>
  <section v-loading="loading" class="page-stack marketing-private-view">
    <div class="marketing-private-hero panel">
      <div>
        <p class="eyebrow">V2.0 / MARKETING & PRIVATE DOMAIN</p>
        <h1>{{ pageTitle }}</h1>
        <p class="hero-description">
          标签、人群、活动、权益、SOP 触达和私域渠道统一进入可追溯的运营闭环。
        </p>
      </div>
      <div class="marketing-private-hero__actions">
        <span class="source-pill">Audience → Campaign → Attribution</span>
        <el-button :loading="loading" @click="loadData">刷新</el-button>
      </div>
    </div>

    <ErrorAlert :message="error" />

    <section class="marketing-private-metrics">
      <article v-for="metric in metrics" :key="metric.label" class="marketing-private-metric panel">
        <span>{{ metric.label }}</span>
        <strong>{{ metric.value }}</strong>
        <small>{{ metric.note }}</small>
      </article>
    </section>

    <section class="panel marketing-private-nav">
      <button
        v-for="item in navItems"
        :key="item.path"
        type="button"
        class="marketing-private-nav__item"
        :class="{ 'is-active': section === item.key }"
        @click="go(item.path)"
      >
        <span>{{ item.label }}</span>
        <small>{{ item.note }}</small>
      </button>
    </section>

    <section v-if="section === 'tags'" class="panel marketing-private-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">USER TAGS</p>
          <h2>用户标签</h2>
        </div>
        <el-button type="primary" @click="openCreate('tag')">新建标签</el-button>
      </div>
      <el-table :data="tags" row-key="tagId">
        <el-table-column label="标签" min-width="220">
          <template #default="{ row }">
            <div class="marketing-cell">
              <strong>{{ row.name }}</strong>
              <small>{{ row.code }} · {{ row.category }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="120">
          <template #default="{ row }">{{ row.tagType }}</template>
        </el-table-column>
        <el-table-column label="成员数" width="110" align="right">
          <template #default="{ row }">{{ row.memberCount }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'active' ? 'success' : 'info'">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="toggleTag(row)">
              {{ row.status === 'active' ? '停用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !tags.length" description="暂无标签" :image-size="56" />
    </section>

    <section v-else-if="section === 'audiences'" class="panel marketing-private-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">AUDIENCE CENTER</p>
          <h2>{{ isCreateRoute ? '创建人群' : '人群管理' }}</h2>
        </div>
        <el-button type="primary" @click="openCreate('audience')">新建人群</el-button>
      </div>
      <el-table :data="audiences" row-key="audienceId">
        <el-table-column label="人群" min-width="240">
          <template #default="{ row }">
            <div class="marketing-cell">
              <strong>{{ row.name }}</strong>
              <small>{{ row.audienceNo }} · {{ row.audienceType }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="预估人数" width="120" align="right">
          <template #default="{ row }">{{ row.estimatedCount }}</template>
        </el-table-column>
        <el-table-column label="快照人数" width="120" align="right">
          <template #default="{ row }">{{ row.snapshotCount }}</template>
        </el-table-column>
        <el-table-column label="更新时间" width="180">
          <template #default="{ row }">{{ displayDate(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="refreshAudience(row)">刷新人群</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !audiences.length" description="暂无人群" :image-size="56" />
    </section>

    <section v-else-if="section === 'campaigns'" class="panel marketing-private-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">CAMPAIGN ORCHESTRATION</p>
          <h2>{{ activeCampaign ? activeCampaign.name : '营销活动' }}</h2>
        </div>
        <el-button type="primary" @click="openCreate('campaign')">新建活动</el-button>
      </div>
      <el-alert
        v-if="activeCampaign"
        title="当前为活动详情路由；状态迁移仍由后端状态机校验。"
        type="info"
        :closable="false"
        class="marketing-private-alert"
      />
      <el-table :data="activeCampaign ? [activeCampaign] : campaigns" row-key="campaignId">
        <el-table-column label="活动" min-width="230">
          <template #default="{ row }">
            <div class="marketing-cell">
              <strong>{{ row.name }}</strong>
              <small>{{ row.campaignId }} · {{ row.goalType }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="人群" width="140">
          <template #default="{ row }">{{ row.audienceId || '全量/未绑定' }}</template>
        </el-table-column>
        <el-table-column label="目标 GMV" width="130" align="right">
          <template #default="{ row }">{{ displayFen(row.targetGmvFen) }}</template>
        </el-table-column>
        <el-table-column label="周期" width="220">
          <template #default="{ row }">
            {{ displayDate(row.startDate) }} → {{ displayDate(row.endDate) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="campaignType(row.status)">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'draft' || row.status === 'paused'"
              link
              type="primary"
              @click="transitionCampaign(row, 'start')"
            >
              启动
            </el-button>
            <el-button
              v-if="row.status === 'active'"
              link
              type="warning"
              @click="transitionCampaign(row, 'pause')"
            >
              暂停
            </el-button>
            <el-button
              v-if="row.status === 'active' || row.status === 'paused'"
              link
              type="success"
              @click="transitionCampaign(row, 'complete')"
            >
              完成
            </el-button>
            <el-button link @click="go(`/marketing/campaigns/${row.campaignId}`)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty
        v-if="!loading && !campaigns.length && !activeCampaign"
        description="暂无活动"
        :image-size="56"
      />
    </section>

    <section v-else-if="section === 'coupons'" class="panel marketing-private-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">COUPON & BENEFIT</p>
          <h2>优惠券模板</h2>
        </div>
        <el-button type="primary" @click="openCreate('coupon')">新建优惠券</el-button>
      </div>
      <el-table :data="coupons" row-key="couponId">
        <el-table-column label="模板" min-width="230">
          <template #default="{ row }">
            <div class="marketing-cell">
              <strong>{{ row.name }}</strong>
              <small>{{ row.couponNo }} · {{ row.couponType }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="面额 / 门槛" width="150" align="right">
          <template #default="{ row }">
            {{ displayFen(row.amountFen) }} / {{ displayFen(row.thresholdFen) }}
          </template>
        </el-table-column>
        <el-table-column label="库存" width="130" align="right">
          <template #default="{ row }">{{ row.issuedQuantity }} / {{ row.totalQuantity }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'active' ? 'success' : 'info'">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'draft'"
              link
              type="primary"
              @click="toggleCoupon(row)"
            >
              启用
            </el-button>
            <el-button
              v-else-if="row.status === 'active'"
              link
              type="danger"
              @click="toggleCoupon(row)"
            >
              停用
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !coupons.length" description="暂无优惠券模板" :image-size="56" />
    </section>

    <section v-else-if="section === 'benefits'" class="panel marketing-private-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">BENEFIT LEDGER</p>
          <h2>权益账户</h2>
        </div>
        <el-button type="primary" @click="openCreate('benefit')">发放权益</el-button>
      </div>
      <div class="marketing-private-callout">
        <strong>权益余额 {{ displayFen(summary.benefitBalanceFen) }}</strong>
        <span>发放写入 Account + AssetLedger；每次写入都要求幂等键，可在资金中心追溯。</span>
      </div>
      <el-alert
        title="福利/权益第三方兑换尚未接入；当前只落账，不宣称已完成外部核销。"
        type="warning"
        :closable="false"
      />
    </section>

    <section v-else-if="section === 'automation'" class="panel marketing-private-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">AUTOMATION SOP</p>
          <h2>自动化运营</h2>
        </div>
        <el-button type="primary" @click="openCreate('automation')">新建 SOP</el-button>
      </div>
      <el-table :data="automationFlows" row-key="flowId">
        <el-table-column label="流程" min-width="230">
          <template #default="{ row }">
            <div class="marketing-cell">
              <strong>{{ row.name }}</strong>
              <small>{{ row.flowNo }} · {{ row.triggerType }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="动作数" width="100" align="right">
          <template #default="{ row }">
            {{ Array.isArray(row.actions) ? row.actions.length : 0 }}
          </template>
        </el-table-column>
        <el-table-column label="运行 / 转化" width="140" align="right">
          <template #default="{ row }">{{ row.runCount }} / {{ row.conversionCount }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'active' ? 'success' : 'info'">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="toggleAutomation(row)">
              {{ row.status === 'active' ? '停用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty
        v-if="!loading && !automationFlows.length"
        description="暂无自动化流程"
        :image-size="56"
      />
    </section>

    <section v-else-if="section === 'wecom-customers'" class="panel marketing-private-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">WECOM CUSTOMER</p>
          <h2>企微客户</h2>
        </div>
        <el-button type="primary" @click="openCreate('wecomCustomer')">记录客户</el-button>
      </div>
      <el-alert
        title="企微同步适配器未接入；录入数据标记为 pending_sync，避免伪造已同步。"
        type="warning"
        :closable="false"
        class="marketing-private-alert"
      />
      <el-table :data="wecomCustomers" row-key="customerId">
        <el-table-column label="客户" min-width="230">
          <template #default="{ row }">
            <div class="marketing-cell">
              <strong>{{ row.nickname || '未命名客户' }}</strong>
              <small>{{ row.externalUserId }} · {{ row.source || '未知来源' }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="平台用户" min-width="150">
          <template #default="{ row }">{{ row.platformUserId || '未绑定' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="{ row }">
            <el-tag size="small" type="warning">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="180">
          <template #default="{ row }">{{ displayDate(row.updatedAt) }}</template>
        </el-table-column>
      </el-table>
      <el-empty
        v-if="!loading && !wecomCustomers.length"
        description="暂无企微客户"
        :image-size="56"
      />
    </section>

    <section v-else-if="section === 'wecom-groups'" class="panel marketing-private-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">WECOM GROUP</p>
          <h2>企微群</h2>
        </div>
        <el-button type="primary" @click="openCreate('wecomGroup')">记录群聊</el-button>
      </div>
      <el-table :data="wecomGroups" row-key="groupId">
        <el-table-column label="群聊" min-width="250">
          <template #default="{ row }">
            <div class="marketing-cell">
              <strong>{{ row.name }}</strong>
              <small>{{ row.chatId }} · {{ row.groupType }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="成员数" width="110" align="right">
          <template #default="{ row }">{{ row.memberCount }}</template>
        </el-table-column>
        <el-table-column label="负责人" width="150">
          <template #default="{ row }">{{ row.ownerUserId || '未绑定' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="{ row }">
            <el-tag size="small" type="warning">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !wecomGroups.length" description="暂无企微群" :image-size="56" />
    </section>

    <section v-else-if="section === 'channels'" class="panel marketing-private-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">PRIVATE DOMAIN ATTRIBUTION</p>
          <h2>私域渠道</h2>
        </div>
        <el-button type="primary" @click="openCreate('channel')">新建渠道</el-button>
      </div>
      <el-table :data="privateChannels" row-key="channelId">
        <el-table-column label="渠道" min-width="230">
          <template #default="{ row }">
            <div class="marketing-cell">
              <strong>{{ row.name }}</strong>
              <small>{{ row.channelNo }} · {{ row.campaignId || '未关联活动' }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="曝光 → 加企微" width="150" align="right">
          <template #default="{ row }">{{ row.exposureCount }} → {{ row.addCount }}</template>
        </el-table-column>
        <el-table-column label="订单 / GMV" width="170" align="right">
          <template #default="{ row }">
            {{ row.orderCount }} / {{ displayFen(row.gmvFen) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'active' ? 'success' : 'warning'">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-empty
        v-if="!loading && !privateChannels.length"
        description="暂无私域渠道"
        :image-size="56"
      />
    </section>

    <section v-else-if="section === 'sms-templates'" class="panel marketing-private-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">SMS TEMPLATE</p>
          <h2>短信模板</h2>
        </div>
        <el-button type="primary" @click="openCreate('smsTemplate')">新建模板</el-button>
      </div>
      <el-alert
        title="短信供应商适配器未接入；模板可配置，任务触发只会记录人工待处理。"
        type="warning"
        :closable="false"
        class="marketing-private-alert"
      />
      <el-table :data="smsTemplates" row-key="templateId">
        <el-table-column label="模板" min-width="230">
          <template #default="{ row }">
            <div class="marketing-cell">
              <strong>{{ row.name }}</strong>
              <small>{{ row.templateNo }} · {{ row.scene }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="内容" min-width="360" show-overflow-tooltip>
          <template #default="{ row }">{{ row.content }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">{{ statusLabel(row.status) }}</template>
        </el-table-column>
      </el-table>
      <el-empty
        v-if="!loading && !smsTemplates.length"
        description="暂无短信模板"
        :image-size="56"
      />
    </section>

    <section v-else-if="section === 'sms-tasks'" class="panel marketing-private-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">SMS TASK</p>
          <h2>短信任务</h2>
        </div>
        <el-button type="primary" @click="openCreate('smsTask')">新建任务</el-button>
      </div>
      <el-table :data="smsTasks" row-key="taskId">
        <el-table-column label="任务" min-width="230">
          <template #default="{ row }">
            <div class="marketing-cell">
              <strong>{{ row.name }}</strong>
              <small>{{ row.taskNo }} · 模板 {{ row.templateId }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="受众人数" width="110" align="right">
          <template #default="{ row }">{{ row.totalCount }}</template>
        </el-table-column>
        <el-table-column label="状态" width="150">
          <template #default="{ row }">
            <el-tag size="small" type="warning">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="能力" width="150">
          <template #default="{ row }">
            {{ row.capability === 'not_connected' ? '供应商未接入' : '已接入' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'draft' || row.status === 'scheduled'"
              link
              type="primary"
              @click="triggerTask(row)"
            >
              触发
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !smsTasks.length" description="暂无短信任务" :image-size="56" />
    </section>

    <section v-else class="panel marketing-private-panel">
      <div class="section-heading">
        <div>
          <p class="eyebrow">ATTRIBUTION & CAPABILITY</p>
          <h2>{{ section === 'private-analytics' ? '私域分析' : '营销分析' }}</h2>
        </div>
      </div>
      <div class="marketing-private-callout">
        <strong>当前闭环</strong>
        <span>人群 → 活动 → 渠道触达 → 订单归因；订单归因明细继续复用现有 attribution 能力。</span>
      </div>
      <div class="marketing-capability-grid">
        <div>
          <span>优惠券</span>
          <strong>可用</strong>
          <small>模板与库存字段已落库</small>
        </div>
        <div>
          <span>权益账本</span>
          <strong>可用</strong>
          <small>Account / AssetLedger</small>
        </div>
        <div>
          <span>企微</span>
          <strong>未接入</strong>
          <small>只记录 pending_sync</small>
        </div>
        <div>
          <span>短信</span>
          <strong>未接入</strong>
          <small>任务只进入人工待处理</small>
        </div>
      </div>
    </section>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="620px" destroy-on-close>
      <el-form label-position="top" @submit.prevent="submitCreate">
        <template v-if="dialogKind === 'tag'">
          <el-form-item label="名称"><el-input v-model="tagForm.name" /></el-form-item>
          <el-form-item label="编码"><el-input v-model="tagForm.code" /></el-form-item>
          <el-form-item label="分类"><el-input v-model="tagForm.category" /></el-form-item>
          <el-form-item label="说明"><el-input v-model="tagForm.description" /></el-form-item>
        </template>
        <template v-else-if="dialogKind === 'audience'">
          <el-form-item label="名称"><el-input v-model="audienceForm.name" /></el-form-item>
          <el-form-item label="类型">
            <el-radio-group v-model="audienceForm.audienceType">
              <el-radio value="DYNAMIC">动态人群</el-radio>
              <el-radio value="SNAPSHOT">快照人群</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="规则 JSON">
            <el-input v-model="audienceForm.ruleJson" type="textarea" :rows="4" />
          </el-form-item>
          <el-form-item label="预估人数">
            <el-input-number v-model="audienceForm.estimatedCount" :min="0" />
          </el-form-item>
        </template>
        <template v-else-if="dialogKind === 'campaign'">
          <el-form-item label="活动名称"><el-input v-model="campaignForm.name" /></el-form-item>
          <el-form-item label="目标"><el-input v-model="campaignForm.goalType" /></el-form-item>
          <el-form-item label="活动类型">
            <el-input v-model="campaignForm.campaignType" />
          </el-form-item>
          <el-form-item label="周期">
            <div class="marketing-form-grid">
              <el-input v-model="campaignForm.startDate" placeholder="开始时间 ISO" />
              <el-input v-model="campaignForm.endDate" placeholder="结束时间 ISO" />
            </div>
          </el-form-item>
          <el-form-item label="人群 ID（可选）">
            <el-input v-model="campaignForm.audienceId" />
          </el-form-item>
          <el-form-item label="渠道 JSON">
            <el-input v-model="campaignForm.channelsJson" />
          </el-form-item>
          <el-form-item label="权益 JSON">
            <el-input v-model="campaignForm.benefitsJson" />
          </el-form-item>
        </template>
        <template v-else-if="dialogKind === 'coupon'">
          <el-form-item label="名称"><el-input v-model="couponForm.name" /></el-form-item>
          <el-form-item label="类型">
            <el-select v-model="couponForm.couponType">
              <el-option label="现金券" value="cash" />
              <el-option label="折扣券" value="discount" />
              <el-option label="满减券" value="full_reduction" />
            </el-select>
          </el-form-item>
          <div class="marketing-form-grid">
            <el-form-item label="面额（分）">
              <el-input v-model="couponForm.amountFen" />
            </el-form-item>
            <el-form-item label="门槛（分）">
              <el-input v-model="couponForm.thresholdFen" />
            </el-form-item>
          </div>
          <el-form-item label="发行量">
            <el-input-number v-model="couponForm.totalQuantity" :min="0" />
          </el-form-item>
          <el-form-item label="有效类型">
            <el-radio-group v-model="couponForm.validType">
              <el-radio value="fixed">固定日期</el-radio>
              <el-radio value="relative">领取后天数</el-radio>
            </el-radio-group>
          </el-form-item>
        </template>
        <template v-else-if="dialogKind === 'automation'">
          <el-form-item label="流程名称"><el-input v-model="automationForm.name" /></el-form-item>
          <el-form-item label="触发器">
            <el-input
              v-model="automationForm.triggerType"
              placeholder="registration / first_order / coupon_expiry"
            />
          </el-form-item>
          <el-form-item label="条件 JSON">
            <el-input v-model="automationForm.conditionJson" />
          </el-form-item>
          <el-form-item label="动作 JSON 数组">
            <el-input v-model="automationForm.actionsJson" type="textarea" :rows="4" />
          </el-form-item>
        </template>
        <template v-else-if="dialogKind === 'wecomCustomer'">
          <el-form-item label="企微 externalUserId">
            <el-input v-model="wecomCustomerForm.externalUserId" />
          </el-form-item>
          <el-form-item label="昵称">
            <el-input v-model="wecomCustomerForm.nickname" />
          </el-form-item>
          <el-form-item label="平台用户 ID">
            <el-input v-model="wecomCustomerForm.platformUserId" />
          </el-form-item>
          <el-form-item label="来源"><el-input v-model="wecomCustomerForm.source" /></el-form-item>
        </template>
        <template v-else-if="dialogKind === 'wecomGroup'">
          <el-form-item label="群聊 chatId">
            <el-input v-model="wecomGroupForm.chatId" />
          </el-form-item>
          <el-form-item label="群名称"><el-input v-model="wecomGroupForm.name" /></el-form-item>
          <el-form-item label="负责人">
            <el-input v-model="wecomGroupForm.ownerUserId" />
          </el-form-item>
          <el-form-item label="成员数">
            <el-input-number v-model="wecomGroupForm.memberCount" :min="0" />
          </el-form-item>
        </template>
        <template v-else-if="dialogKind === 'channel'">
          <el-form-item label="渠道名称"><el-input v-model="channelForm.name" /></el-form-item>
          <el-form-item label="关联活动 ID">
            <el-input v-model="channelForm.campaignId" />
          </el-form-item>
          <el-form-item label="员工 ID JSON">
            <el-input v-model="channelForm.employeeIdsJson" />
          </el-form-item>
          <el-form-item label="群 ID JSON">
            <el-input v-model="channelForm.groupIdsJson" />
          </el-form-item>
        </template>
        <template v-else-if="dialogKind === 'smsTemplate'">
          <el-form-item label="模板名称"><el-input v-model="smsTemplateForm.name" /></el-form-item>
          <el-form-item label="场景"><el-input v-model="smsTemplateForm.scene" /></el-form-item>
          <el-form-item label="内容">
            <el-input v-model="smsTemplateForm.content" type="textarea" :rows="4" />
          </el-form-item>
        </template>
        <template v-else-if="dialogKind === 'smsTask'">
          <el-form-item label="任务名称"><el-input v-model="smsTaskForm.name" /></el-form-item>
          <el-form-item label="模板 ID"><el-input v-model="smsTaskForm.templateId" /></el-form-item>
          <el-form-item label="人群 ID（可选）">
            <el-input v-model="smsTaskForm.audienceId" />
          </el-form-item>
          <el-form-item label="活动 ID（可选）">
            <el-input v-model="smsTaskForm.campaignId" />
          </el-form-item>
        </template>
        <template v-else-if="dialogKind === 'benefit'">
          <el-form-item label="会员 ID"><el-input v-model="benefitForm.memberId" /></el-form-item>
          <el-form-item label="金额（分）">
            <el-input v-model="benefitForm.amountFen" />
          </el-form-item>
          <el-form-item label="业务 ID"><el-input v-model="benefitForm.businessId" /></el-form-item>
          <el-form-item label="备注"><el-input v-model="benefitForm.remark" /></el-form-item>
        </template>
        <div class="marketing-dialog-actions">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="submitting" native-type="submit">保存</el-button>
        </div>
      </el-form>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onScopeDispose, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import ErrorAlert from '../components/ErrorAlert.vue';
import {
  createAutomationFlow,
  createCouponTemplate,
  createMarketingAudience,
  createMarketingCampaign,
  createMarketingTag,
  createPrivateChannel,
  createSmsTask,
  createSmsTemplate,
  createWeComCustomer,
  createWeComGroup,
  getMarketingPrivateSummary,
  getMarketingCampaign,
  grantBenefit,
  listAutomationFlows,
  listCouponTemplates,
  listMarketingAudiences,
  listMarketingCampaigns,
  listMarketingTags,
  listPrivateChannels,
  listSmsTasks,
  listSmsTemplates,
  listWeComCustomers,
  listWeComGroups,
  refreshMarketingAudience,
  setAutomationFlowStatus,
  setCouponTemplateStatus,
  setMarketingTagStatus,
  transitionMarketingCampaign,
  triggerSmsTask,
  type Audience,
  type AutomationFlow,
  type CouponTemplate,
  type MarketingCampaign,
  type MarketingPrivateSummary,
  type MarketingTag,
  type PrivateDomainChannel,
  type SmsTask,
  type SmsTemplate,
  type WeComCustomer,
  type WeComGroup
} from '../services/api/marketing-private.api';
import { buildBusinessIntentKey } from '../services/idempotency-key';

type Section =
  | 'tags'
  | 'audiences'
  | 'campaigns'
  | 'coupons'
  | 'benefits'
  | 'automation'
  | 'wecom-customers'
  | 'wecom-groups'
  | 'channels'
  | 'sms-templates'
  | 'sms-tasks'
  | 'marketing-analytics'
  | 'private-analytics';
type DialogKind =
  | Section
  | 'tag'
  | 'audience'
  | 'campaign'
  | 'coupon'
  | 'wecomCustomer'
  | 'wecomGroup'
  | 'channel'
  | 'smsTemplate'
  | 'smsTask'
  | 'benefit'
  | null;

const route = useRoute();
const router = useRouter();
const ownerPath = route.path;
const loading = ref(false);
const submitting = ref(false);
const error = ref('');
const dialogVisible = ref(false);
const dialogKind = ref<DialogKind>(null);
const summary = ref<MarketingPrivateSummary>({
  activeTags: 0,
  activeAudiences: 0,
  runningCampaigns: 0,
  activeCoupons: 0,
  activeAutomationFlows: 0,
  wecomCustomers: 0,
  wecomGroups: 0,
  privateChannels: 0,
  pendingSmsTasks: 0,
  benefitBalanceFen: '0',
  capabilities: {
    wecom: 'not_connected',
    sms: 'not_connected',
    coupon: 'ready',
    benefitLedger: 'ready'
  }
});
const tags = ref<MarketingTag[]>([]);
const audiences = ref<Audience[]>([]);
const campaigns = ref<MarketingCampaign[]>([]);
const activeCampaign = ref<MarketingCampaign | null>(null);
const coupons = ref<CouponTemplate[]>([]);
const automationFlows = ref<AutomationFlow[]>([]);
const wecomCustomers = ref<WeComCustomer[]>([]);
const wecomGroups = ref<WeComGroup[]>([]);
const privateChannels = ref<PrivateDomainChannel[]>([]);
const smsTemplates = ref<SmsTemplate[]>([]);
const smsTasks = ref<SmsTask[]>([]);
let loadSequence = 0;
let disposed = false;

onScopeDispose(() => {
  disposed = true;
  loadSequence += 1;
});

const tagForm = reactive({ name: '', code: '', category: '运营', description: '' });
const audienceForm = reactive({
  name: '',
  audienceType: 'DYNAMIC',
  ruleJson: '{"tags":[]}',
  estimatedCount: 0
});
const campaignForm = reactive({
  name: '',
  goalType: '拉新',
  campaignType: 'coupon',
  startDate: '',
  endDate: '',
  audienceId: '',
  channelsJson: '["miniprogram"]',
  benefitsJson: '[]'
});
const couponForm = reactive({
  name: '',
  couponType: 'cash',
  amountFen: '1000',
  thresholdFen: '0',
  totalQuantity: 1000,
  validType: 'fixed'
});
const automationForm = reactive({
  name: '',
  triggerType: 'registration',
  conditionJson: '{}',
  actionsJson: '[{"type":"coupon"}]'
});
const wecomCustomerForm = reactive({
  externalUserId: '',
  nickname: '',
  platformUserId: '',
  source: 'manual'
});
const wecomGroupForm = reactive({ chatId: '', name: '', ownerUserId: '', memberCount: 0 });
const channelForm = reactive({
  name: '',
  campaignId: '',
  employeeIdsJson: '[]',
  groupIdsJson: '[]'
});
const smsTemplateForm = reactive({ name: '', scene: 'campaign', content: '' });
const smsTaskForm = reactive({ name: '', templateId: '', audienceId: '', campaignId: '' });
const benefitForm = reactive({ memberId: '', amountFen: '100', businessId: '', remark: '' });

const section = computed<Section>(() => {
  const path = route.path;
  if (path.startsWith('/users/tags')) return 'tags';
  if (path.startsWith('/users/audiences')) return 'audiences';
  if (path.startsWith('/marketing/campaigns')) return 'campaigns';
  if (path.startsWith('/marketing/coupons')) return 'coupons';
  if (path.startsWith('/marketing/benefits')) return 'benefits';
  if (path.startsWith('/marketing/automation')) return 'automation';
  if (path.startsWith('/marketing/analytics')) return 'marketing-analytics';
  if (path.startsWith('/private/wecom/customers')) return 'wecom-customers';
  if (path.startsWith('/private/wecom/groups')) return 'wecom-groups';
  if (path.startsWith('/private/channels')) return 'channels';
  if (path.startsWith('/private/sms/templates')) return 'sms-templates';
  if (path.startsWith('/private/sms/tasks')) return 'sms-tasks';
  return 'private-analytics';
});

const isCreateRoute = computed(
  () => route.path.endsWith('/create') || route.path.endsWith('/edit')
);
const pageTitle = computed(
  () =>
    ({
      tags: '用户标签',
      audiences: '人群中心',
      campaigns: '营销活动',
      coupons: '优惠券',
      benefits: '权益账户',
      automation: '自动化运营',
      'wecom-customers': '企微客户',
      'wecom-groups': '企微群',
      channels: '私域渠道',
      'sms-templates': '短信模板',
      'sms-tasks': '短信任务',
      'marketing-analytics': '营销分析',
      'private-analytics': '私域分析'
    })[section.value]
);
const dialogTitle = computed(
  () =>
    (
      ({
        tag: '新建标签',
        audience: '新建人群',
        campaign: '新建活动',
        coupon: '新建优惠券',
        automation: '新建自动化流程',
        wecomCustomer: '记录企微客户',
        wecomGroup: '记录企微群',
        channel: '新建私域渠道',
        smsTemplate: '新建短信模板',
        smsTask: '新建短信任务',
        benefit: '发放权益'
      }) as Record<string, string>
    )[dialogKind.value || ''] || '新建'
);
const navItems: Array<{ key: Section; path: string; label: string; note: string }> = [
  { key: 'tags', path: '/users/tags', label: '标签', note: '可运营属性' },
  { key: 'audiences', path: '/users/audiences', label: '人群', note: '动态 / 快照' },
  { key: 'campaigns', path: '/marketing/campaigns', label: '活动', note: '目标与渠道' },
  { key: 'coupons', path: '/marketing/coupons', label: '优惠券', note: '发放约束' },
  { key: 'benefits', path: '/marketing/benefits', label: '权益', note: '资产账本' },
  { key: 'automation', path: '/marketing/automation', label: 'SOP', note: '触发与动作' },
  { key: 'wecom-customers', path: '/private/wecom/customers', label: '企微客户', note: '待同步' },
  { key: 'wecom-groups', path: '/private/wecom/groups', label: '企微群', note: '群运营' },
  { key: 'channels', path: '/private/channels', label: '私域渠道', note: '扫码与归因' },
  { key: 'sms-templates', path: '/private/sms/templates', label: '短信模板', note: '供应商待接入' },
  { key: 'sms-tasks', path: '/private/sms/tasks', label: '短信任务', note: '人工待处理' },
  { key: 'marketing-analytics', path: '/marketing/analytics', label: '营销分析', note: '漏斗指标' },
  { key: 'private-analytics', path: '/private/analytics', label: '私域分析', note: '渠道转化' }
];
const metrics = computed(() => [
  { label: '活跃标签', value: String(summary.value.activeTags), note: '用于人群与 SOP' },
  { label: '有效人群', value: String(summary.value.activeAudiences), note: '动态 / 快照' },
  { label: '运行活动', value: String(summary.value.runningCampaigns), note: '状态机管理' },
  { label: '权益余额', value: displayFen(summary.value.benefitBalanceFen), note: '用户权益总账' },
  { label: '待处理短信', value: String(summary.value.pendingSmsTasks), note: '供应商未接入' }
]);

function optional(value: string) {
  return value.trim() || undefined;
}
function displayFen(value: string | null | undefined) {
  if (value == null || value === '') return '—';
  const amount = Number(value) / 100;
  return `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function displayDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString('zh-CN') : '—';
}
function statusLabel(value: string) {
  return (
    (
      {
        active: '运行中',
        paused: '已暂停',
        completed: '已完成',
        draft: '草稿',
        disabled: '已停用',
        pending_sync: '待同步',
        scheduled: '已排期',
        manual_required: '人工待处理',
        cancelled: '已取消'
      } as Record<string, string>
    )[value] || value
  );
}
function campaignType(value: string) {
  return value === 'active'
    ? 'success'
    : value === 'paused'
      ? 'warning'
      : value === 'completed'
        ? 'info'
        : 'primary';
}
function go(path: string) {
  void router.push(path);
}
function key(operation: Parameters<typeof buildBusinessIntentKey>[0]) {
  return buildBusinessIntentKey(operation, Date.now(), Math.random().toString(36).slice(2));
}
function errorMessage(caught: unknown) {
  const response = (caught as { response?: { data?: { message?: string | string[] } } }).response
    ?.data?.message;
  return Array.isArray(response)
    ? response.join('；')
    : response || (caught instanceof Error ? caught.message : '请求失败');
}

async function loadData() {
  const sequence = ++loadSequence;
  const targetPath = route.fullPath;
  const targetSection = section.value;
  const targetCampaignId = route.params.campaignId
    ? String(route.params.campaignId)
    : undefined;
  loading.value = true;
  error.value = '';
  const isCurrent = () =>
    !disposed && sequence === loadSequence && targetPath === route.fullPath;

  try {
    const nextSummary = await getMarketingPrivateSummary();
    if (!isCurrent()) return;
    summary.value = nextSummary;
    switch (targetSection) {
      case 'tags':
        {
          const result = await listMarketingTags({ pageSize: 50 });
          if (!isCurrent()) return;
          tags.value = result.items;
        }
        break;
      case 'audiences':
        {
          const result = await listMarketingAudiences({ pageSize: 50 });
          if (!isCurrent()) return;
          audiences.value = result.items;
        }
        break;
      case 'campaigns':
        {
          const result = await listMarketingCampaigns({ pageSize: 50 });
          if (!isCurrent()) return;
          campaigns.value = result.items;
        }
        if (targetCampaignId) {
          const campaign = await getMarketingCampaign(targetCampaignId);
          if (!isCurrent()) return;
          activeCampaign.value = campaign;
        }
        break;
      case 'coupons':
        {
          const result = await listCouponTemplates({ pageSize: 50 });
          if (!isCurrent()) return;
          coupons.value = result.items;
        }
        break;
      case 'automation':
        {
          const result = await listAutomationFlows({ pageSize: 50 });
          if (!isCurrent()) return;
          automationFlows.value = result.items;
        }
        break;
      case 'wecom-customers':
        {
          const result = await listWeComCustomers({ pageSize: 50 });
          if (!isCurrent()) return;
          wecomCustomers.value = result.items;
        }
        break;
      case 'wecom-groups':
        {
          const result = await listWeComGroups({ pageSize: 50 });
          if (!isCurrent()) return;
          wecomGroups.value = result.items;
        }
        break;
      case 'channels':
        {
          const result = await listPrivateChannels({ pageSize: 50 });
          if (!isCurrent()) return;
          privateChannels.value = result.items;
        }
        break;
      case 'sms-templates':
        {
          const result = await listSmsTemplates({ pageSize: 50 });
          if (!isCurrent()) return;
          smsTemplates.value = result.items;
        }
        break;
      case 'sms-tasks':
        {
          const result = await listSmsTasks({ pageSize: 50 });
          if (!isCurrent()) return;
          smsTasks.value = result.items;
        }
        break;
      default:
        break;
    }
    if (!isCurrent()) return;
  } catch (caught) {
    if (!isCurrent()) return;
    error.value = errorMessage(caught);
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

function openCreate(kind: Exclude<DialogKind, null>) {
  dialogKind.value = kind;
  dialogVisible.value = true;
}
async function afterSubmit() {
  dialogVisible.value = false;
  await loadData();
}

async function submitCreate() {
  submitting.value = true;
  error.value = '';
  try {
    switch (dialogKind.value) {
      case 'tag':
        await createMarketingTag(
          {
            name: tagForm.name,
            code: tagForm.code,
            category: tagForm.category,
            description: optional(tagForm.description)
          },
          key('marketing-tag')
        );
        break;
      case 'audience':
        await createMarketingAudience(audienceForm, key('audience'));
        break;
      case 'campaign':
        await createMarketingCampaign(
          {
            name: campaignForm.name,
            goalType: campaignForm.goalType,
            campaignType: campaignForm.campaignType,
            startDate: campaignForm.startDate,
            endDate: campaignForm.endDate,
            audienceId: optional(campaignForm.audienceId),
            channelsJson: campaignForm.channelsJson,
            benefitsJson: campaignForm.benefitsJson
          },
          key('marketing-campaign')
        );
        break;
      case 'coupon':
        await createCouponTemplate(
          {
            name: couponForm.name,
            couponType: couponForm.couponType,
            amountFen: couponForm.amountFen,
            thresholdFen: couponForm.thresholdFen,
            totalQuantity: couponForm.totalQuantity,
            validType: couponForm.validType
          },
          key('coupon')
        );
        break;
      case 'automation':
        await createAutomationFlow(automationForm, key('automation'));
        break;
      case 'wecomCustomer':
        await createWeComCustomer(
          {
            externalUserId: wecomCustomerForm.externalUserId,
            nickname: optional(wecomCustomerForm.nickname),
            platformUserId: optional(wecomCustomerForm.platformUserId),
            source: optional(wecomCustomerForm.source)
          },
          key('private-domain')
        );
        break;
      case 'wecomGroup':
        await createWeComGroup(wecomGroupForm, key('private-domain'));
        break;
      case 'channel':
        await createPrivateChannel(
          {
            name: channelForm.name,
            campaignId: optional(channelForm.campaignId),
            employeeIdsJson: channelForm.employeeIdsJson,
            groupIdsJson: channelForm.groupIdsJson
          },
          key('private-domain')
        );
        break;
      case 'smsTemplate':
        await createSmsTemplate(smsTemplateForm, key('sms-task'));
        break;
      case 'smsTask':
        await createSmsTask(
          {
            name: smsTaskForm.name,
            templateId: smsTaskForm.templateId,
            audienceId: optional(smsTaskForm.audienceId),
            campaignId: optional(smsTaskForm.campaignId)
          },
          key('sms-task')
        );
        break;
      case 'benefit':
        await grantBenefit(
          {
            memberId: benefitForm.memberId,
            amountFen: benefitForm.amountFen,
            businessId: benefitForm.businessId,
            remark: optional(benefitForm.remark)
          },
          key('benefit-grant')
        );
        break;
      default:
        return;
    }
    ElMessage.success('已保存');
    await afterSubmit();
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    submitting.value = false;
  }
}

async function toggleTag(row: MarketingTag) {
  try {
    await setMarketingTagStatus(
      row.tagId,
      row.status === 'active' ? 'disabled' : 'active',
      key('marketing-tag')
    );
    await loadData();
  } catch (caught) {
    error.value = errorMessage(caught);
  }
}
async function refreshAudience(row: Audience) {
  try {
    await refreshMarketingAudience(row.audienceId, key('audience'));
    ElMessage.success('人群已刷新');
    await loadData();
  } catch (caught) {
    error.value = errorMessage(caught);
  }
}
async function transitionCampaign(row: MarketingCampaign, action: 'start' | 'pause' | 'complete') {
  try {
    await transitionMarketingCampaign(row.campaignId, action, key('marketing-campaign'));
    await loadData();
  } catch (caught) {
    error.value = errorMessage(caught);
  }
}
async function toggleCoupon(row: CouponTemplate) {
  try {
    await setCouponTemplateStatus(
      row.couponId,
      row.status === 'active' ? 'disabled' : 'active',
      key('coupon')
    );
    await loadData();
  } catch (caught) {
    error.value = errorMessage(caught);
  }
}
async function toggleAutomation(row: AutomationFlow) {
  try {
    await setAutomationFlowStatus(
      row.flowId,
      row.status === 'active' ? 'disabled' : 'active',
      key('automation')
    );
    await loadData();
  } catch (caught) {
    error.value = errorMessage(caught);
  }
}
async function triggerTask(row: SmsTask) {
  try {
    await triggerSmsTask(row.taskId, key('sms-task'));
    ElMessage.warning('短信供应商未接入，任务已记录为人工待处理');
    await loadData();
  } catch (caught) {
    error.value = errorMessage(caught);
  }
}

onMounted(loadData);
watch(
  () => route.fullPath,
  () => {
    if (route.path !== ownerPath) return;
    activeCampaign.value = null;
    void loadData();
  }
);
</script>

<style src="../styles/views/marketing-private.css" scoped></style>
