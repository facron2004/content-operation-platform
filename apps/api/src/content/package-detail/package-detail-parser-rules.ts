export function isSectionTitle(text: string): boolean {
  const keywords = [
    '选',
    '必备',
    '欢乐送',
    '镇店',
    '人气',
    '特色',
    '时蔬',
    '主食',
    '主菜',
    '配菜',
    '小吃',
    '甜品',
    '饮品',
    '酒水',
    '凉菜',
    '热菜',
    '汤品',
    '素菜',
    '荤菜',
    '海鲜',
    '肉类',
    '招牌',
    '推荐',
    '精选',
    '经典',
    '新品',
    '限定',
    '季节',
    '套餐',
    '组合',
    '搭配',
    '自选',
    '任选',
    '赠送',
    '加购',
    '其他'
  ];

  if (keywords.some((keyword) => text.includes(keyword))) {
    return true;
  }

  const patterns = [
    /\d+选\d+/,
    /第[一二三四五六七八九十]+部分/,
    /[A-Z]\.|[一二三四五六七八九十]+\./,
    /【.*】/,
    /^\d+\.(?!\d)/
  ];

  return patterns.some((pattern) => pattern.test(text));
}
