import axios from 'axios';
import * as cheerio from 'cheerio';

async function testParser() {
  const packageId = '1932685444115415040'; // 孙哈儿套餐
  const url = `https://zdm.zhsh1.cn/a/bargain/bargainCommodity/form?id=${packageId}`;
  const cookie = 'skinName=skin-green; jeesite.session.id=30347bd6a0e64d66b82180c5c27eb6e5';

  console.log(`Fetching ${url}...`);
  const response = await axios.get(url, {
    headers: { Cookie: cookie, 'User-Agent': 'Mozilla/5.0' },
  });

  const $ = cheerio.load(response.data);
  const detailScript = $('#commodityDetailUE').html();

  if (!detailScript) {
    console.log('No commodityDetailUE found');
    return;
  }

  console.log('\n=== Detail Script Content (first 500 chars) ===');
  console.log(detailScript.substring(0, 500));

  const $detail = cheerio.load(detailScript);

  console.log('\n=== All <p> tags with <strong> ===');
  $detail('p').each((i, el) => {
    const $el = $detail(el);
    const strongText = $el.find('strong').text().trim();
    if (strongText) {
      console.log(`${i}: "${strongText}"`);
    }
  });

  console.log('\n=== All <section> with 3 nested sections (item rows) ===');
  $detail('section').each((i, el) => {
    const $el = $detail(el);
    const nestedCount = $el.find('> section').length;
    if (nestedCount === 3) {
      const col1 = $el.find('> section').eq(0).text().trim();
      const col2 = $el.find('> section').eq(1).text().trim();
      const col3 = $el.find('> section').eq(2).text().trim();
      console.log(`Row: "${col2}" - "${col3}"`);
    }
  });
}

testParser().catch(console.error);
