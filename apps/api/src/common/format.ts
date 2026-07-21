/** * 重新导出 shared 的 safeRatio/nowISO/futureISO/msToISO, * 保持 `from '../common/format'` 的旧导入路径可用。 * 历史调用方集中在 content/ 与 domain/,统一收口到 shared 权威版本。 */ export {
  nowISO,
  futureISO,
  msToISO,
  safeRatio
} from '@content/shared';
