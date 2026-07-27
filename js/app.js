const { createApp, ref, computed, onMounted, watch } = Vue;

const DEFAULT_DATA = {
  profile: { name: '松子鱼', avatar: '🍒', theme: 'svt', height: 166 },
  todos: [],
  stocks: [
    { code: 'sh000001', name: '上证指数', addedAt: '2026-07-27' }
  ],
  expenses: [],
  reviews: [],
  weights: [],
  hotSources: {
    wechatAlbums: ['化妆品观察', '聚美丽']
  }
};

const EXPENSE_COLORS = {
  '餐饮': '#F7CAC9',
  '交通': '#92A8D1',
  '购物': '#4FC3F7',
  '美妆': '#FFB7C5',
  '娱乐': '#C5A3FF',
  '学习': '#81D4FA',
  '其他': '#B0BEC5'
};

const HOT_SOURCE_CONFIG = [
  { key: 'weibo', name: '微博热搜', icon: '🔥', type: 'weibo', appUrl: 'sinaweibo://' },
  { key: 'zhihu', name: '知乎热榜', icon: '💡', type: 'zhihu', appUrl: 'zhihu://' },
  { key: 'bilibili', name: 'B站热门', icon: '📺', type: 'bilibili', appUrl: 'bilibili://' },
  { key: 'douyin', name: '抖音热榜', icon: '🎵', type: 'douyin', appUrl: 'snssdk1128://' },
  { key: 'xiaohongshu', name: '小红书', icon: '📕', type: 'xiaohongshu', appUrl: 'xhsdiscover://' },
  { key: 'wechat', name: '美妆行业精选', icon: '💄', type: null, appUrl: 'weixin://', static: true }
];

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function parseTencentStock(text) {
  const lines = text.trim().split('\n');
  const result = [];
  for (const line of lines) {
    const m = line.match(/v_([a-z]+\d+)="([^"]+)"/);
    if (!m) continue;
    const code = m[1];
    const parts = m[2].split('~');
    if (parts.length < 36) continue;
    const name = parts[1];
    const price = parseFloat(parts[3]);
    const prevClose = parseFloat(parts[4]);
    const open = parseFloat(parts[5]);
    const high = parseFloat(parts[34]);
    const low = parseFloat(parts[35]);
    const change = parseFloat(parts[32]);
    const time = parts[30];
    result.push({ code, name, price, prevClose, open, high, low, change, time });
  }
  return result;
}

async function fetchTencentStocks(codes) {
  if (!codes.length) return [];
  const url = `https://qt.gtimg.cn/q=${codes.join(',')}`;
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const decoder = new TextDecoder('gbk');
  const text = decoder.decode(buffer);
  return parseTencentStock(text);
}

// 股票搜索（腾讯智能搜索接口，使用 JSONP 绕过 CORS）
function searchStocks(keyword) {
  return new Promise((resolve) => {
    const kw = keyword.trim();
    if (!kw) { resolve([]); return; }
    // 使用东方财富搜索API（支持真正的JSONP回调，浏览器可直接调用）
    const callbackName = 'emSearchCb_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
    const script = document.createElement('script');
    const timeout = setTimeout(() => { cleanup(); resolve([]); }, 6000);
    function cleanup() {
      clearTimeout(timeout);
      if (script.parentNode) script.parentNode.removeChild(script);
      delete window[callbackName];
    }
    window[callbackName] = (data) => {
      cleanup();
      try {
        const list = (data && data.QuotationCodeTable && data.QuotationCodeTable.Data) || [];
        const results = list.slice(0, 12).map(item => {
          // MktNum: "1"=沪市, "0"=深市；腾讯行情代码前缀 sh/sz
          const mktNum = item.MktNum;
          const code = item.Code;
          const name = item.Name;
          const typeName = item.SecurityTypeName || '';
          // 只保留 A股、指数；过滤基金、债券、板块等
          const classify = item.Classify || '';
          if (classify !== 'AStock' && classify !== 'Index') return null;
          const prefix = mktNum === '1' ? 'sh' : 'sz';
          return { name: name, code: prefix + code, market: prefix, type: typeName };
        }).filter(s => s !== null);
        resolve(results);
      } catch (e) {
        resolve([]);
      }
    };
    script.onerror = () => { cleanup(); resolve([]); };
    const url = 'https://searchapi.eastmoney.com/api/suggest/get?input=' +
      encodeURIComponent(kw) + '&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=12&cb=' + callbackName;
    script.src = url;
    document.head.appendChild(script);
  });
}

async function fetchHotBoard(type) {
  const url = `https://uapis.cn/api/v1/misc/hotboard?type=${type}`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.list || []).slice(0, 10).map(item => ({
    title: item.title,
    url: item.url,
    hot: item.hot_value
  }));
}

// 每日要闻智能汇总（60s读世界API，支持CORS）
async function fetchDailyNews() {
  const res = await fetch('https://60s.viki.moe/v2/60s?encoding=json');
  const json = await res.json();
  const data = json.data || {};
  return {
    news: data.news || [],
    date: data.date || '',
    dayOfWeek: data.day_of_week || '',
    lunarDate: data.lunar_date || '',
    link: data.link || '',
    tip: data.tip || ''
  };
}

// 新闻分类关键词映射
const NEWS_CATEGORIES = [
  { key: 'politics', name: '🏛️ 政治经济', keywords: ['GDP', '政策', '改革', '经济', '金融', '股市', '贸易', '央行', '财政', '关税', '外交', '会议', '政府', '部长', '主席', '总统', '改革', '十四五', '十五五', '规划', '省份', '增速'] },
  { key: 'society', name: '🏠 社会民生', keywords: ['民生', '教育', '医疗', '就业', '房价', '城市', '退休', '养老', '社保', '工资', '入学', '高考', '大学', '医院', '药品', '医保', '居民', '交通', '高铁', '地铁'] },
  { key: 'tech', name: '💻 科技行业', keywords: ['科技', '芯片', 'AI', '人工智能', '互联网', '手机', '汽车', '新能源', '电池', '半导体', '量子', '5G', '6G', '大模型', '机器人', '百度', '阿里', '腾讯', '华为', '小米', '字节', '抖音', '长鑫'] },
  { key: 'entertainment', name: '🎬 文体娱乐', keywords: ['电影', '票房', '明星', '体育', '综艺', '音乐', '演唱会', '奥运', '世界杯', '联赛', '女排', '足球', '篮球', '演员', '导演', '播出', '收官'] },
  { key: 'safety', name: '⚠️ 安全警示', keywords: ['事故', '火灾', '食品', '召回', '超标', '犯罪', '坠楼', '爆炸', '塌陷', '中毒', '铅含量', '奶粉', '下架', '违法', '刑拘', '查处', '假冒', '侵权', '起诉'] },
  { key: 'nature', name: '🌿 自然生态', keywords: ['动物', '自然', '环境', '气候', '生态', '暴雨', '洪水', '台风', '地震', '高温', '寒潮', '保护', '物种', '熊猫', '保护区', '碳', '排放', '绿色'] }
];

function categorizeNews(newsList) {
  const result = NEWS_CATEGORIES.map(cat => ({ ...cat, items: [] }));
  for (const news of newsList) {
    let matched = false;
    for (const cat of result) {
      if (cat.keywords.some(kw => news.includes(kw))) {
        cat.items.push(news);
        matched = true;
        break;
      }
    }
    if (!matched) {
      // 未匹配的归入社会民生
      result.find(c => c.key === 'society').items.push(news);
    }
  }
  return result.filter(c => c.items.length > 0);
}

function generateNewsSummary(categories) {
  const parts = [];
  for (const cat of categories) {
    if (cat.items.length === 0) continue;
    const cleanName = cat.name.replace(/[^\u4e00-\u9fa5a-zA-Z]/g, '').trim();
    const sample = cat.items[0];
    if (cat.items.length === 1) {
      parts.push(`${cleanName}方面关注「${sample.slice(0, 20)}...」`);
    } else {
      parts.push(`${cleanName}方面有${cat.items.length}条要闻`);
    }
  }
  if (!parts.length) return '今日要闻加载中...';
  return '今日关注：' + parts.join('，') + '。详细内容见下方分类。';
}

function generateAIReply(content) {
  const prompts = [
    '从你今天的记录来看，你对美妆行业有自己的观察，这正是做自媒体的好起点。',
    '可以把今天的一个灵感做成一条短视频选题，比如「一个被低估的护肤细节」。',
    '你的优势在于持续关注行业动态，建议每周固定输出 2-3 条行业解读。',
    '迷茫的时候，先行动 10 分钟：写下 3 个你最近想分享的话题。',
    '自媒体第一步：找到你最愿意聊 100 遍的那个小领域。'
  ];
  if (!content.trim()) {
    return '先把今天的感受或想法写下来，我会帮你梳理出可行的下一步行动 ✨';
  }
  const idx = content.length % prompts.length;
  return `看了你的复盘，我有这些想法：\n\n1. ${prompts[idx]}\n2. 建议你本周尝试发一条「轻内容」，测试反馈。\n3. 把长期目标拆成每周 3 件小事，更容易坚持。\n\n继续保持记录，量变会带来质变 💎`;
}

createApp({
  setup() {
    const sidebarOpen = ref(false);
    const currentView = ref('dashboard');
    const toast = ref('');
    const gistReady = ref(false);
    const showSettings = ref(false);
    const syncHintDismissed = ref(false);
    const gistToken = ref('');
    const gistId = ref('');

    const data = ref(JSON.parse(JSON.stringify(DEFAULT_DATA)));

    const menu = [
      { key: 'dashboard', label: '首页仪表盘', icon: '🏠' },
      { key: 'calendar', label: '日历计划', icon: '📅' },
      { key: 'todo', label: '每日待办', icon: '✅' },
      { key: 'stocks', label: '股票盯盘', icon: '📈' },
      { key: 'hot', label: '热点聚合', icon: '🔥' },
      { key: 'inspire', label: '选题灵感', icon: '✨' },
      { key: 'review', label: 'AI 复盘', icon: '💬' },
      { key: 'weight', label: '体重监测', icon: '⚖️' },
      { key: 'money', label: '记账本', icon: '💰' }
    ];

    const currentMenu = computed(() => menu.find(m => m.key === currentView.value) || menu[0]);

    // 日历
    const currentYear = ref(new Date().getFullYear());
    const currentMonth = ref(new Date().getMonth());
    const selectedDate = ref(todayStr());

    // 待办输入
    const newTodoTitle = ref('');
    const newTodoType = ref('custom');
    // 每日待办模块的日期选择
    const todoDate = ref(todayStr());
    const newDailyTodoTitle = ref('');
    const newDailyTodoPriority = ref('normal');

    // 股票输入
    const stockSearchKeyword = ref('');
    const stockSearchResults = ref([]);
    const stockSearching = ref(false);
    let stockSearchTimer = null;

    // 记账输入
    const newExpense = ref({
      amount: '',
      category: '餐饮',
      date: todayStr(),
      note: ''
    });
    const expenseCategories = ['餐饮', '交通', '购物', '美妆', '娱乐', '学习', '其他'];

    // 复盘输入
    const newReview = ref('');
    const aiReply = ref('');

    // 体重监测输入
    const newWeight = ref({
      weight: '',
      date: todayStr(),
      note: ''
    });
    const weightRangeDays = ref(30);

    // 热点 - 每日要闻智能汇总
    const dailyNews = ref([]);
    const dailyNewsDate = ref('');
    const dailyNewsLunar = ref('');
    const dailyNewsTip = ref('');
    const dailyNewsLink = ref('');
    const newsCategories = ref([]);
    const newsSummary = ref('');
    const hotLoading = ref(false);
    const hotSources = ref(HOT_SOURCE_CONFIG.filter(s => !s.static).map(s => ({ ...s, items: [], loading: false })));
    const hotUpdateTime = ref('');

    // 选题灵感模块
    const inspireLoading = ref(false);
    const inspireUpdateTime = ref('');
    const recommendedTopics = ref([]); // 今日推荐选题
    const inspireCategories = ref([]); // 按赛道分类的热点

    // 自媒体赛道分类
    const INSPIRE_TRACKS = [
      { key: 'beauty', name: '💄 美妆穿搭', keywords: ['妆', '护肤', '口红', '粉底', '面膜', '穿搭', '时尚', '衣服', '搭配', '化妆', '美甲', '发型', '瘦身', '减肥', '颜值'] },
      { key: 'lifestyle', name: '🍳 生活美食', keywords: ['美食', '好吃', '餐厅', '探店', '食谱', '做饭', '早餐', '奶茶', '咖啡', '旅行', '出游', '周末', '生活', '收纳', '家居', '装修'] },
      { key: 'knowledge', name: '📚 知识情感', keywords: ['科普', '知识', '解读', '分析', '心理学', '情感', '恋爱', '职场', '成长', '学习', '读书', '观点', '思考', '真相', '揭秘'] },
      { key: 'society', name: '📰 社会热点', keywords: ['热搜', '争议', '曝光', '震惊', '最新', '突发', '通报', '官方', '回应', '事件', '引发', '网友', '热议'] }
    ];

    function classifyForInspire(items, platform) {
      const results = INSPIRE_TRACKS.map(t => ({ ...t, items: [] }));
      for (const item of items) {
        const title = item.title || item;
        let matched = false;
        for (const track of results) {
          if (track.keywords.some(kw => title.includes(kw))) {
            track.items.push({ ...item, platform, track: track.key });
            matched = true;
            break;
          }
        }
        if (!matched) {
          results.find(t => t.key === 'society').items.push({ ...item, platform, track: 'society' });
        }
      }
      return results.filter(t => t.items.length > 0);
    }

    function calcReplicationScore(item) {
      // 可复刻指数：基于热度和标题特征
      let score = 3;
      const title = item.title || '';
      if (/教程|攻略|方法|技巧|分享|推荐|盘点|对比/.test(title)) score += 1;
      if (/翻拍|模仿|跟拍|复刻|挑战/.test(title)) score += 1;
      if (item.hot) {
        const hot = parseInt(item.hot) || 0;
        if (hot > 500000) score += 1;
      }
      return Math.min(score, 5);
    }

    function generateTopicSuggestion(item, platform) {
      const title = item.title || '';
      const platformName = platform === 'douyin' ? '抖音' : platform === 'xiaohongshu' ? '小红书' : platform === 'bilibili' ? 'B站' : '微博';
      const suggestions = [];
      if (/妆|护肤|口红|穿搭/.test(title)) {
        suggestions.push(`做一个「${title.slice(0, 10)}」的平替/学生党版本`);
        suggestions.push(`从成分/性价比角度深度解读`);
      } else if (/美食|探店|食谱/.test(title)) {
        suggestions.push(`复刻这道美食，记录制作过程`);
        suggestions.push(`做一个同类店铺探店对比`);
      } else if (/情感|恋爱|职场/.test(title)) {
        suggestions.push(`结合自身经历分享观点`);
        suggestions.push(`做一个「不同人对这件事的看法」街访`);
      } else if (/热搜|争议|事件/.test(title)) {
        suggestions.push(`快速跟进解读，输出个人观点`);
        suggestions.push(`做一个时间线梳理/科普`);
      } else {
        suggestions.push(`结合自身风格做一次翻拍/解读`);
        suggestions.push(`提取核心话题，做差异化内容`);
      }
      return suggestions[Math.floor(Math.random() * suggestions.length)];
    }

    async function refreshInspire() {
      showToast('正在获取选题灵感...');
      inspireLoading.value = true;
      const now = new Date();
      inspireUpdateTime.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const allTracks = INSPIRE_TRACKS.map(t => ({ ...t, items: [] }));
      const allHotItems = [];

      // 获取各平台热榜
      const platforms = [
        { type: 'douyin', name: '抖音' },
        { type: 'xiaohongshu', name: '小红书' },
        { type: 'weibo', name: '微博' },
        { type: 'bilibili', name: 'B站' }
      ];

      for (const p of platforms) {
        try {
          const items = await fetchHotBoard(p.type);
          for (const item of items.slice(0, 8)) {
            item.platform = p.name;
            item.score = calcReplicationScore(item);
            item.suggestion = generateTopicSuggestion(item, p.type);
            allHotItems.push(item);
            // 分类
            for (const track of allTracks) {
              if (track.keywords.some(kw => (item.title || '').includes(kw))) {
                track.items.push(item);
                break;
              }
            }
          }
        } catch (e) {
          console.error(`${p.name}热榜获取失败`, e);
        }
      }

      // 获取每日新闻中的可蹭热点
      try {
        const newsData = await fetchDailyNews();
        for (const news of newsData.news.slice(0, 5)) {
          const item = {
            title: news,
            platform: '新闻热点',
            score: 3,
            suggestion: generateTopicSuggestion({ title: news }, 'news'),
            url: newsData.link
          };
          allHotItems.push(item);
          for (const track of allTracks) {
            if (track.keywords.some(kw => news.includes(kw))) {
              track.items.push(item);
              break;
            }
          }
        }
      } catch (e) {
        console.error('新闻获取失败', e);
      }

      // 生成3条推荐选题（取可复刻指数最高的）
      inspireCategories.value = allTracks.filter(t => t.items.length > 0);
      recommendedTopics.value = [...allHotItems]
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 3);

      inspireLoading.value = false;
      showToast('选题灵感更新完成');
    }

    // 计算属性
    const todayText = computed(() => {
      const d = new Date();
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAYS[d.getDay()]}`;
    });

    const todayTodos = computed(() => data.value.todos.filter(t => t.date === todayStr()));

    const weeklyTodosLeft = computed(() => {
      const today = new Date();
      const endOfWeek = new Date(today);
      endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
      const endStr = endOfWeek.toISOString().slice(0, 10);
      return data.value.todos.filter(t => !t.done && t.date >= todayStr() && t.date <= endStr).length;
    });

    const stocks = computed(() => data.value.stocks);

    const monthExpenses = computed(() => {
      const prefix = todayStr().slice(0, 7);
      return data.value.expenses
        .filter(e => e.date.startsWith(prefix))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    const monthTotal = computed(() => monthExpenses.value.reduce((sum, e) => sum + e.amount, 0));

    const categoryTotals = computed(() => {
      const map = {};
      for (const e of monthExpenses.value) {
        map[e.category] = (map[e.category] || 0) + e.amount;
      }
      const total = monthTotal.value || 1;
      return Object.entries(map)
        .map(([category, amount]) => ({
          category,
          amount,
          percent: Math.max(8, (amount / total) * 100),
          color: EXPENSE_COLORS[category] || '#B0BEC5'
        }))
        .sort((a, b) => b.amount - a.amount);
    });

    const reviews = computed(() => [...data.value.reviews].sort((a, b) => new Date(b.date) - new Date(a.date)));

    // 体重相关计算属性
    const sortedWeights = computed(() => {
      return [...data.value.weights].sort((a, b) => new Date(a.date) - new Date(b.date));
    });

    const recentWeights = computed(() => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - weightRangeDays.value);
      return sortedWeights.value.filter(w => new Date(w.date) >= cutoff);
    });

    const currentWeight = computed(() => {
      if (sortedWeights.value.length === 0) return null;
      return sortedWeights.value[sortedWeights.value.length - 1].weight;
    });

    const weightChange = computed(() => {
      if (sortedWeights.value.length < 2) return 0;
      const first = sortedWeights.value[0].weight;
      const last = sortedWeights.value[sortedWeights.value.length - 1].weight;
      return +(last - first).toFixed(1);
    });

    const bmi = computed(() => {
      if (!currentWeight.value || !data.value.profile.height) return null;
      const h_m = data.value.profile.height / 100;
      return +(currentWeight.value / (h_m * h_m)).toFixed(1);
    });

    const weightChartData = computed(() => {
      const list = recentWeights.value;
      if (list.length === 0) return { labels: [], values: [] };
      return {
        labels: list.map(w => w.date.slice(5)),
        values: list.map(w => w.weight)
      };
    });

    const calendarDays = computed(() => {
      const year = currentYear.value;
      const month = currentMonth.value;
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const daysInMonth = lastDay.getDate();
      const startWeekday = firstDay.getDay();
      const days = [];
      for (let i = 0; i < startWeekday; i++) {
        days.push({ day: '', date: '', isToday: false, hasTodo: false, dots: [], events: [] });
      }
      const today = todayStr();
      const firstDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

      // 收集本月所有事件（含跨天事件），只显示来源为日历的任务
      const monthEvents = data.value.todos.filter(t => {
        if (t.done) return false;
        // 只显示日历来源的任务（每日待办里添加的不显示在日历）
        if (t.source === 'todo') return false;
        const start = t.startDate || t.date;
        const end = t.endDate || t.date;
        return start <= lastDate && end >= firstDate;
      });

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayTodos = data.value.todos.filter(t => t.date === dateStr && !t.done && t.source !== 'todo');
        const dots = [];
        if (dayTodos.length > 0) dots.push('#F7CAC9');

        // 当天事件条（限制最多显示3条）
        const events = monthEvents
          .filter(t => {
            const start = t.startDate || t.date;
            const end = t.endDate || t.date;
            return dateStr >= start && dateStr <= end;
          })
          .map(t => {
            const start = t.startDate || t.date;
            const end = t.endDate || t.date;
            return {
              ...t,
              isStart: dateStr === start,
              isEnd: dateStr === end,
              displayTitle: t.title,
              startDate: start,
              endDate: end
            };
          })
          .slice(0, 3);

        days.push({
          day: d,
          date: dateStr,
          isToday: dateStr === today,
          hasTodo: dayTodos.length > 0,
          dots,
          events
        });
      }
      return days;
    });

    const selectedTodos = computed(() => {
      return data.value.todos
        .filter(t => t.date === selectedDate.value && t.source !== 'todo')
        .sort((a, b) => {
          if (a.done !== b.done) return a.done ? 1 : -1;
          // 按时间排序
          const ta = a.startTime || '00:00';
          const tb = b.startTime || '00:00';
          return ta.localeCompare(tb);
        });
    });

    // 每日待办模块：当前选中日期的任务
    const dailyTodos = computed(() => {
      return data.value.todos
        .filter(t => t.date === todoDate.value)
        .sort((a, b) => {
          if (a.done !== b.done) return a.done ? 1 : -1;
          const priorityOrder = { high: 0, normal: 1, low: 2 };
          return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
        });
    });

    const dailyTodoStats = computed(() => {
      const list = dailyTodos.value;
      const done = list.filter(t => t.done).length;
      const total = list.length;
      const percent = total === 0 ? 0 : Math.round((done / total) * 100);
      return { done, total, percent };
    });

    const focusTip = computed(() => {
      const left = todayTodos.value.filter(t => !t.done).length;
      if (left === 0) return '今天的任务都完成啦，奖励自己一首 SEVENTEEN 的歌吧 🎧';
      const next = todayTodos.value.find(t => !t.done);
      return `今天还有 ${left} 件事，下一项：${next?.title || ''}，加油 💎`;
    });

    const stockBrief = computed(() => {
      const stocks = data.value.stocks;
      if (!stocks.length) return '还没有添加股票，搜索添加后我会帮你智能盯盘。';
      const withPrice = stocks.filter(s => s.price != null);
      if (!withPrice.length) return '点击右上角刷新获取最新行情后，我会生成盯盘简报。';

      // 大盘走势
      const indexStock = stocks.find(s => s.code === 'sh000001');
      let marketLine = '';
      if (indexStock && indexStock.change != null) {
        const dir = indexStock.change >= 0 ? '上涨' : '下跌';
        marketLine = `大盘上证指数${dir} ${Math.abs(indexStock.change).toFixed(2)}%，`;
        if (indexStock.change > 1) marketLine += '市场情绪偏强，做多氛围浓厚。';
        else if (indexStock.change > 0) marketLine += '整体震荡偏强，个股分化明显。';
        else if (indexStock.change > -1) marketLine += '市场震荡偏弱，注意控制仓位。';
        else marketLine += '市场情绪偏弱，建议谨慎观望。';
      }

      // 个股涨跌统计
      const up = withPrice.filter(s => (s.change || 0) > 0);
      const down = withPrice.filter(s => (s.change || 0) < 0);
      const flat = withPrice.filter(s => (s.change || 0) === 0);
      const individualStocks = withPrice.filter(s => s.code !== 'sh000001' && s.code !== 'sz399001');
      let stockLine = `自选股中 ${individualStocks.length} 只个股，上涨 ${up.filter(s=>s.code!=='sh000001'&&s.code!=='sz399001').length} 只、下跌 ${down.filter(s=>s.code!=='sh000001'&&s.code!=='sz399001').length} 只`;
      if (flat.length) stockLine += `、平盘 ${flat.length} 只`;
      stockLine += '。';

      // 涨跌幅最大点名
      const sorted = [...individualStocks].sort((a, b) => (b.change || 0) - (a.change || 0));
      let highlightLine = '';
      if (sorted.length > 0) {
        const top = sorted[0];
        const bottom = sorted[sorted.length - 1];
        if (top.change > 0) {
          highlightLine += `涨幅居前：${top.name}(${top.change >= 0 ? '+' : ''}${(top.change || 0).toFixed(2)}%)`;
          if (bottom && bottom.change < 0 && bottom !== top) {
            highlightLine += `；跌幅居前：${bottom.name}(${(bottom.change || 0).toFixed(2)}%)`;
          }
          highlightLine += '。';
        } else if (bottom.change < 0) {
          highlightLine += `${bottom.name}跌幅最大(${(bottom.change || 0).toFixed(2)}%)，关注是否超跌反弹。`;
        }
      }

      // 技术面：MA5分析
      let techLines = [];
      for (const s of individualStocks.slice(0, 5)) {
        if (!s.history || s.history.length < 3) continue;
        const closes = s.history.map(h => h.close);
        const ma = closes.reduce((a, b) => a + b, 0) / closes.length;
        const diff = ((s.price - ma) / ma * 100);
        if (Math.abs(diff) < 1) {
          techLines.push(`${s.name}贴近${closes.length}日均线(${ma.toFixed(2)})，方向待选择`);
        } else if (diff > 3) {
          techLines.push(`${s.name}偏离均线${diff.toFixed(1)}%，短期偏强注意回调`);
        } else if (diff < -3) {
          techLines.push(`${s.name}跌破均线${Math.abs(diff).toFixed(1)}%，关注支撑位`);
        }
      }
      let techLine = techLines.length ? techLines.join('；') + '。' : '';

      // 操作建议
      const upRatio = individualStocks.length ? up.filter(s=>s.code!=='sh000001'&&s.code!=='sz399001').length / individualStocks.length : 0;
      let adviceLine = '';
      if (upRatio > 0.7) {
        adviceLine = '多数个股走强，可适度参与但不宜追高，关注量能配合。';
      } else if (upRatio > 0.4) {
        adviceLine = '涨跌参半，建议精选个股轻仓操作，设好止损。';
      } else if (upRatio > 0.2) {
        adviceLine = '弱势个股较多，建议观望为主，等待企稳信号。';
      } else {
        adviceLine = '市场普跌，建议控制仓位耐心等待，不宜抄底。';
      }

      const parts = [marketLine, stockLine, highlightLine, techLine, adviceLine].filter(s => s);
      return parts.join('\n\n');
    });

    // 方法
    function navigate(view) {
      currentView.value = view;
      sidebarOpen.value = false;
    }

    function showToast(msg) {
      toast.value = msg;
      setTimeout(() => toast.value = '', 2500);
    }

    function saveData() {
      if (gistReady.value) {
        writeGist();
      } else {
        localStorage.setItem('svt-workbench-data', JSON.stringify(data.value));
      }
    }

    function loadLocal() {
      const saved = localStorage.getItem('svt-workbench-data');
      const hintDismissed = localStorage.getItem('svt-workbench-sync-hint-dismissed');
      if (hintDismissed) syncHintDismissed.value = true;
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          data.value = { ...DEFAULT_DATA, ...parsed };
        } catch (e) {
          console.error(e);
        }
      }
    }

    async function connectGist() {
      if (!gistToken.value) {
        showToast('请输入 GitHub Token');
        return;
      }
      try {
        if (!gistId.value) {
          const res = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${gistToken.value}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              description: 'Carat Workbench Data',
              public: false,
              files: {
                'workbench-data.json': {
                  content: JSON.stringify(data.value, null, 2)
                }
              }
            })
          });
          const gist = await res.json();
          if (!res.ok) throw new Error(gist.message);
          gistId.value = gist.id;
        }
        await readGist();
        gistReady.value = true;
        showSettings.value = false;
        showToast('Gist 连接成功');
      } catch (e) {
        showToast('Gist 连接失败：' + e.message);
      }
    }

    function saveLocal() {
      showSettings.value = false;
      gistReady.value = false;
      syncHintDismissed.value = true;
      localStorage.setItem('svt-workbench-sync-hint-dismissed', 'true');
      saveData();
      showToast('已切换到本地存储');
    }

    function dismissSyncHint() {
      syncHintDismissed.value = true;
      localStorage.setItem('svt-workbench-sync-hint-dismissed', 'true');
    }

    async function readGist() {
      const res = await fetch(`https://api.github.com/gists/${gistId.value}`, {
        headers: { Authorization: `Bearer ${gistToken.value}` }
      });
      const gist = await res.json();
      const content = gist.files['workbench-data.json']?.content;
      if (content) {
        data.value = { ...DEFAULT_DATA, ...JSON.parse(content) };
        localStorage.setItem('svt-workbench-data', JSON.stringify(data.value));
      }
    }

    async function writeGist() {
      try {
        await fetch(`https://api.github.com/gists/${gistId.value}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${gistToken.value}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            files: {
              'workbench-data.json': {
                content: JSON.stringify(data.value, null, 2)
              }
            }
          })
        });
      } catch (e) {
        console.error('写 Gist 失败', e);
      }
    }

    function prevMonth() {
      currentMonth.value--;
      if (currentMonth.value < 0) {
        currentMonth.value = 11;
        currentYear.value--;
      }
    }

    function nextMonth() {
      currentMonth.value++;
      if (currentMonth.value > 11) {
        currentMonth.value = 0;
        currentYear.value++;
      }
    }

    function weekdayName(idx) {
      return WEEKDAYS[idx];
    }

    function todoTypeIcon(type) {
      return '✨';
    }

    // 日历待办输入
    const newTodoStartTime = ref('09:00');
    const newTodoEndTime = ref('10:00');
    const newTodoEndDate = ref('');
    const newTodoAllDay = ref(false);

    function addTodo() {
      const title = newTodoTitle.value.trim();
      if (!title) return;
      const startDate = selectedDate.value;
      const endDate = newTodoEndDate.value && newTodoEndDate.value >= startDate ? newTodoEndDate.value : startDate;
      data.value.todos.push({
        id: uid(),
        date: startDate,
        startDate,
        endDate,
        title,
        type: newTodoType.value,
        startTime: newTodoAllDay.value ? '' : newTodoStartTime.value,
        endTime: newTodoAllDay.value ? '' : newTodoEndTime.value,
        allDay: newTodoAllDay.value,
        source: 'calendar',
        done: false
      });
      newTodoTitle.value = '';
      newTodoEndDate.value = '';
      newTodoAllDay.value = false;
      saveData();
    }

    function formatTimeRange(todo) {
      if (todo.allDay) return '全天';
      if (todo.startTime && todo.endTime) return `${todo.startTime} - ${todo.endTime}`;
      if (todo.startTime) return todo.startTime;
      return '';
    }

    function isMultiDay(todo) {
      return todo.startDate && todo.endDate && todo.startDate !== todo.endDate;
    }

    function addDailyTodo() {
      const title = newDailyTodoTitle.value.trim();
      if (!title) {
        showToast('请输入任务内容');
        return;
      }
      data.value.todos.push({
        id: uid(),
        date: todoDate.value,
        title,
        type: 'custom',
        priority: newDailyTodoPriority.value,
        source: 'todo',
        done: false
      });
      newDailyTodoTitle.value = '';
      saveData();
    }

    function toggleTodoDone(todo) {
      todo.done = !todo.done;
      saveData();
    }

    function deleteDailyTodo(id) {
      data.value.todos = data.value.todos.filter(t => t.id !== id);
      saveData();
    }

    function clearDailyDone() {
      const before = data.value.todos.length;
      data.value.todos = data.value.todos.filter(t => !(t.date === todoDate.value && t.done));
      const removed = before - data.value.todos.length;
      if (removed > 0) {
        saveData();
        showToast(`已清除 ${removed} 个已完成任务`);
      }
    }

    function shiftTodoDate(days) {
      const d = new Date(todoDate.value);
      d.setDate(d.getDate() + days);
      todoDate.value = d.toISOString().slice(0, 10);
    }

    function todoPriorityLabel(priority) {
      if (priority === 'high') return '🔴 重要';
      if (priority === 'low') return '🟢 次要';
      return '🟡 普通';
    }

    function todoPriorityColor(priority) {
      if (priority === 'high') return '#FFB7C5';
      if (priority === 'low') return '#AEC6CF';
      return '#F7CAC9';
    }

    function deleteTodo(id) {
      data.value.todos = data.value.todos.filter(t => t.id !== id);
      saveData();
    }

    function onStockSearchInput() {
      clearTimeout(stockSearchTimer);
      const kw = stockSearchKeyword.value.trim();
      if (!kw) {
        stockSearchResults.value = [];
        return;
      }
      stockSearching.value = true;
      stockSearchTimer = setTimeout(async () => {
        try {
          stockSearchResults.value = await searchStocks(kw);
        } catch (e) {
          stockSearchResults.value = [];
        }
        stockSearching.value = false;
      }, 300);
    }

    function addStockBySearch(item) {
      if (data.value.stocks.some(s => s.code === item.code)) {
        showToast('该股票已存在');
        return;
      }
      data.value.stocks.push({ code: item.code, name: item.name, addedAt: todayStr() });
      stockSearchKeyword.value = '';
      stockSearchResults.value = [];
      saveData();
      refreshStocks();
      showToast(`已添加 ${item.name}`);
    }

    function deleteStock(code) {
      data.value.stocks = data.value.stocks.filter(s => s.code !== code);
      saveData();
      showToast('已删除');
    }

    async function refreshStocks() {
      if (!data.value.stocks.length) return;
      showToast('正在刷新行情...');
      try {
        const codes = data.value.stocks.map(s => s.code);
        const list = await fetchTencentStocks(codes);
        const today = todayStr();
        for (const item of list) {
          const s = data.value.stocks.find(x => x.code === item.code);
          if (s) {
            s.price = item.price;
            s.change = item.change;
            s.open = item.open;
            s.high = item.high;
            s.low = item.low;
            s.prevClose = item.prevClose;
            s.updatedAt = item.time;
            // 存储历史价格用于计算MA5
            if (!s.history) s.history = [];
            const lastEntry = s.history[s.history.length - 1];
            if (!lastEntry || lastEntry.date !== today) {
              s.history.push({ date: today, close: item.price });
              if (s.history.length > 10) s.history = s.history.slice(-10);
            } else {
              lastEntry.close = item.price;
            }
          }
        }
        saveData();
        showToast('行情刷新完成');
      } catch (e) {
        console.error(e);
        showToast('行情刷新失败');
      }
    }

    function stockChangeText(stock) {
      if (stock.change === undefined || stock.change === null) return '';
      const sign = stock.change >= 0 ? '+' : '';
      return `${sign}${stock.change.toFixed(2)}%`;
    }

    function stockChangeAmount(stock) {
      if (!stock.price || !stock.prevClose) return '';
      const amount = (stock.price - stock.prevClose).toFixed(2);
      return (amount >= 0 ? '+' : '') + amount;
    }

    function addExpense() {
      const amount = parseFloat(newExpense.value.amount);
      if (!amount || amount <= 0) {
        showToast('请输入有效金额');
        return;
      }
      data.value.expenses.push({
        id: uid(),
        date: newExpense.value.date || todayStr(),
        amount,
        category: newExpense.value.category,
        note: newExpense.value.note
      });
      newExpense.value = { amount: '', category: '餐饮', date: todayStr(), note: '' };
      saveData();
    }

    function deleteExpense(id) {
      data.value.expenses = data.value.expenses.filter(e => e.id !== id);
      saveData();
    }

    async function refreshHot() {
      showToast('正在获取今日要闻...');
      hotLoading.value = true;
      const now = new Date();
      hotUpdateTime.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      // 1. 获取每日新闻摘要
      try {
        const newsData = await fetchDailyNews();
        dailyNews.value = newsData.news;
        dailyNewsDate.value = newsData.date;
        dailyNewsLunar.value = newsData.lunarDate;
        dailyNewsTip.value = newsData.tip;
        dailyNewsLink.value = newsData.link;
        newsCategories.value = categorizeNews(newsData.news);
        newsSummary.value = generateNewsSummary(newsCategories.value);
      } catch (e) {
        console.error(e);
        showToast('新闻获取失败');
      }

      // 2. 获取各平台热榜（后台静默获取，不阻塞）
      for (const source of hotSources.value) {
        source.loading = true;
        try {
          source.items = await fetchHotBoard(source.type);
        } catch (e) {
          console.error(e);
          source.items = [];
        } finally {
          source.loading = false;
        }
      }

      hotLoading.value = false;
      showToast('要闻更新完成');
    }

    function openApp(url) {
      window.location.href = url;
    }

    function saveReview() {
      const content = newReview.value.trim();
      if (!content) {
        showToast('先写点什么吧');
        return;
      }
      data.value.reviews.push({
        id: uid(),
        date: todayStr(),
        content,
        aiReply: ''
      });
      newReview.value = '';
      aiReply.value = '';
      saveData();
    }

    function askAIAdvice() {
      aiReply.value = generateAIReply(newReview.value);
    }

    // 体重监测方法
    function addWeight() {
      const weight = parseFloat(newWeight.value.weight);
      if (!weight || weight <= 0 || weight > 300) {
        showToast('请输入有效体重');
        return;
      }
      // 如果当天已有记录，则更新
      const existing = data.value.weights.find(w => w.date === newWeight.value.date);
      if (existing) {
        existing.weight = weight;
        existing.note = newWeight.value.note;
      } else {
        data.value.weights.push({
          id: uid(),
          date: newWeight.value.date,
          weight,
          note: newWeight.value.note
        });
      }
      newWeight.value = { weight: '', date: todayStr(), note: '' };
      saveData();
      showToast('体重记录已保存');
    }

    function deleteWeight(id) {
      data.value.weights = data.value.weights.filter(w => w.id !== id);
      saveData();
    }

    function bmiStatus(bmiValue) {
      if (bmiValue < 18.5) return { label: '偏瘦', color: '#92A8D1' };
      if (bmiValue < 24) return { label: '正常', color: '#4FC3F7' };
      if (bmiValue < 28) return { label: '超重', color: '#FFB7C5' };
      return { label: '肥胖', color: '#FF6B6B' };
    }

    function getWeightPointY(weight, min, max, height) {
      if (max === min) return height / 2;
      return height - ((weight - min) / (max - min)) * height;
    }

    function getWeightPath(values, width, height) {
      if (values.length < 2) return '';
      const min = Math.min(...values) - 0.5;
      const max = Math.max(...values) + 0.5;
      const stepX = width / (values.length - 1);
      let d = '';
      values.forEach((v, i) => {
        const x = i * stepX;
        const y = getWeightPointY(v, min, max, height);
        d += (i === 0 ? 'M' : 'L') + `${x},${y} `;
      });
      return d;
    }

    // 生命周期
    onMounted(() => {
      loadLocal();
      // 尝试读取 localStorage 中的 gist 配置
      const savedToken = localStorage.getItem('svt-workbench-gist-token');
      const savedId = localStorage.getItem('svt-workbench-gist-id');
      if (savedToken && savedId) {
        gistToken.value = savedToken;
        gistId.value = savedId;
        gistReady.value = true;
        showSettings.value = false;
        readGist().catch(() => {
          gistReady.value = false;
          showSettings.value = true;
        });
      }
      refreshStocks();
      refreshHot();
    });

    watch(gistReady, (ready) => {
      if (ready) {
        localStorage.setItem('svt-workbench-gist-token', gistToken.value);
        localStorage.setItem('svt-workbench-gist-id', gistId.value);
      }
    });

    return {
      sidebarOpen,
      currentView,
      menu,
      currentMenu,
      navigate,
      toast,
      gistReady,
      showSettings,
      syncHintDismissed,
      gistToken,
      gistId,
      connectGist,
      saveLocal,
      dismissSyncHint,
      todayText,
      todayTodos,
      weeklyTodosLeft,
      focusTip,
      currentYear,
      currentMonth,
      selectedDate,
      calendarDays,
      selectedTodos,
      prevMonth,
      nextMonth,
      weekdayName,
      todoTypeIcon,
      newTodoTitle,
      newTodoType,
      addTodo,
      deleteTodo,
      saveData,
      todoDate,
      newDailyTodoTitle,
      newDailyTodoPriority,
      dailyTodos,
      dailyTodoStats,
      addDailyTodo,
      toggleTodoDone,
      deleteDailyTodo,
      clearDailyDone,
      shiftTodoDate,
      todoPriorityLabel,
      todoPriorityColor,
      newTodoStartTime,
      newTodoEndTime,
      newTodoEndDate,
      newTodoAllDay,
      formatTimeRange,
      isMultiDay,
      stocks,
      stockSearchKeyword,
      stockSearchResults,
      stockSearching,
      onStockSearchInput,
      addStockBySearch,
      deleteStock,
      stockChangeText,
      stockChangeAmount,
      refreshStocks,
      stockBrief,
      newExpense,
      expenseCategories,
      addExpense,
      deleteExpense,
      monthTotal,
      monthExpenses,
      categoryTotals,
      hotSources,
      hotUpdateTime,
      hotLoading,
      dailyNews,
      dailyNewsDate,
      dailyNewsLunar,
      dailyNewsTip,
      dailyNewsLink,
      newsCategories,
      newsSummary,
      refreshHot,
      inspireLoading,
      inspireUpdateTime,
      recommendedTopics,
      inspireCategories,
      refreshInspire,
      openApp,
      newReview,
      aiReply,
      reviews,
      saveReview,
      askAIAdvice,
      newWeight,
      weightRangeDays,
      sortedWeights,
      recentWeights,
      currentWeight,
      weightChange,
      bmi,
      weightChartData,
      addWeight,
      deleteWeight,
      bmiStatus,
      getWeightPath,
      getWeightPointY,
    };
  }
}).mount('#app');
