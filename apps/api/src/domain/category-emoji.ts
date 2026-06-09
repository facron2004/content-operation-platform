// 品类到 emoji 的映射
export const categoryEmoji: Record<string, string> = {
  '酒水/甜品': '🍹',
  '烧烤': '🍢',
  '火锅': '🍲',
  '西餐': '🍽️',
  '中餐': '🥘',
  '日料': '🍱',
  '韩餐': '🍜',
  '自助餐': '🍴',
  '健身': '💪',
  '美容': '💅',
  '美发': '💇',
  'SPA': '🧖',
  '按摩': '💆',
  '足浴': '🦶',
  '电影': '🎬',
  'KTV': '🎤',
  '桌游': '🎲',
  '密室': '🔐',
  '剧本杀': '📖',
  '酒店': '🏨',
  '民宿': '🏠',
  '景点': '🎡',
  '亲子': '👶',
  '摄影': '📷',
  '洗车': '🚗',
  '宠物': '🐾'
};

// 菜品类型 emoji
export const dishEmoji: Record<string, string> = {
  '沙拉': '🥗',
  '凉菜': '🥗',
  '汤': '🍲',
  '炖菜': '🍲',
  '蔬菜': '🥬',
  '时蔬': '🥬',
  '饮品': '🥤',
  '饮料': '🥤',
  '茶': '🍵',
  '咖啡': '☕',
  '主食': '🍚',
  '米饭': '🍚',
  '面': '🍜',
  '面包': '🍞',
  '鱼': '🐟',
  '海鲜': '🦐',
  '虾': '🦐',
  '猪': '🐗',
  '猪肉': '🐗',
  '鸡': '🐔',
  '鸡肉': '🐔',
  '牛': '🥩',
  '牛肉': '🥩',
  '羊': '🐑',
  '羊肉': '🐑',
  '烧烤': '🍢',
  '串': '🍢',
  '火锅': '🍲',
  '甜品': '🍰',
  '蛋糕': '🎂',
  '水果': '🍎'
};

// 根据菜品名称匹配 emoji
export function getDishEmoji(dishName: string): string {
  for (const [keyword, emoji] of Object.entries(dishEmoji)) {
    if (dishName.includes(keyword)) {
      return emoji;
    }
  }
  return '🍽️'; // 默认
}

// 获取品类 emoji
export function getCategoryEmoji(category: string): string {
  return categoryEmoji[category] || '🎁';
}
