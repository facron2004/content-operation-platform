// 深圳地铁站映射
export const subwayStations: Record<string, string[]> = {
  福田区: ['福田', '市民中心', '会展中心', '购物公园', '车公庙', '香蜜湖', '莲花村', '少年宫'],
  南山区: [
    '世界之窗',
    '华侨城',
    '深大',
    '高新园',
    '科苑',
    '红树湾',
    '后海',
    '海上世界',
    '南油',
    '桃园'
  ],
  罗湖区: ['罗湖', '国贸', '老街', '大剧院', '科学馆', '黄贝岭', '翠竹', '田贝'],
  龙岗区: ['布吉', '木棉湾', '大芬', '丹竹头', '双龙', '龙城广场', '坪地', '大运'],
  宝安区: ['宝安中心', '宝体', '坪洲', '西乡', '固戍', '后瑞', '机场东'],
  龙华区: ['民治', '白石龙', '深圳北站', '红山', '上塘', '龙华', '清湖'],
  盐田区: ['盐田港', '海山', '盐田'],
  光明区: ['光明', '光明大街', '楼村', '红花山'],
  坪山区: ['坪山', '坪山广场', '燕子岭'],
  深圳市: ['市民中心', '福田', '罗湖', '深圳北站']
};

// 根据区域获取地铁站
export function getSubwayStation(areaId: string, merchantName?: string): string {
  const directStation = Object.values(subwayStations)
    .flat()
    .find((station) => areaId.includes(station));
  if (directStation) return directStation;

  const stations = subwayStations[areaId] || subwayStations['深圳市'];

  // 如果商家名包含地铁站关键词，优先使用
  if (merchantName) {
    for (const station of stations) {
      if (merchantName.includes(station)) {
        return station;
      }
    }
  }

  // 否则返回该区域第一个地铁站
  return stations[0] || '市民中心';
}
