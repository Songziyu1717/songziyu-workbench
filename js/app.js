const { createApp, ref, computed, onMounted, watch } = Vue;

const DEFAULT_DATA = {
  profile: { name: '松子鱼', avatar: '🍒', theme: 'svt', height: 166 },
  courses: {
    fitness: { timesPerWeek: 3, weekdays: [1, 3, 5], time: '19:00' },
    piano: { timesPerWeek: 2, weekdays: [2, 4], time: '18:00' }
  },
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
    if (!keyword.trim()) {
      resolve([]);
      return;
    }
    const callbackName = 'stockSearchCb_' + Date.now();
    const script = document.createElement('script');
    script.charset = 'gbk';
    const timeout = setTimeout(() => {
      cleanup();
      resolve([]);
    }, 5000);

    function cleanup() {
      clearTimeout(timeout);
      if (script.parentNode) script.parentNode.removeChild(script);
      delete window[callbackName];
    }

    window[callbackName] = (data) => {
      cleanup();
      try {
        // data 是字符串，格式：v_hint="..."
        const text = typeof data === 'string' ? data : '';
        const m = text.match(/v_hint="([^"]+)"/);
        if (!m || !m[1]) {
          resolve([]);
          return;
        }
        const items = m[1].split('^').filter(s => s);
        const results = items.slice(0, 12).map(item => {
          const parts = item.split('~');
          if (parts.length < 3) return null;
          const market = parts[0];
          const code = parts[1];
          const name = parts[2];
          const type = parts[4] || '';
          // 保留股票(GP)/指数(ZS)/港股(GP)/美股(GP)，过滤基金/债券
          if (!type.startsWith('GP') && !type.startsWith('ZS')) return null;
          return { name, code: market + code, market, type };
        }).filter(s => s !== null);
        resolve(results);
      } catch (e) {
        resolve([]);
      }
    };

    script.onerror = () => {
      cleanup();
      resolve([]);
    };

    script.src = `https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(keyword)}&t=all&cb=${callbackName}`;
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

    // 热点
    const hotSources = ref(HOT_SOURCE_CONFIG.map(s => ({ ...s, items: [], loading: false })));
    const hotUpdateTime = ref('');

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

    const courses = computed({
      get: () => data.value.courses,
      set: (val) => { data.value.courses = val; }
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

      // 收集本月所有事件（含跨天事件）
      const monthEvents = data.value.todos.filter(t => {
        if (t.done) return false;
        const start = t.startDate || t.date;
        const end = t.endDate || t.date;
        return start <= lastDate && end >= firstDate;
      });

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayTodos = data.value.todos.filter(t => t.date === dateStr && !t.done);
        const dots = [];
        if (dayTodos.some(t => t.type === 'fitness')) dots.push('#F7CAC9');
        if (dayTodos.some(t => t.type === 'piano')) dots.push('#92A8D1');
        if (dayTodos.some(t => t.type === 'custom')) dots.push('#4FC3F7');

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
        .filter(t => t.date === selectedDate.value)
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
      if (!data.value.stocks.length) return '还没有股票，添加后我会帮你盯盘。';
      const up = data.value.stocks.filter(s => (s.change || 0) > 0).length;
      const down = data.value.stocks.filter(s => (s.change || 0) < 0).length;
      return `当前关注 ${data.value.stocks.length} 只股票，上涨 ${up} 只，下跌 ${down} 只。市场有风险，投资需谨慎。`;
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
      if (type === 'fitness') return '💪';
      if (type === 'piano') return '🎹';
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

    function toggleWeekday(course, weekday) {
      const list = courses.value[course].weekdays;
      const idx = list.indexOf(weekday);
      if (idx > -1) list.splice(idx, 1);
      else list.push(weekday);
      list.sort((a, b) => a - b);
      saveData();
    }

    function generateRecurringTodos() {
      const year = currentYear.value;
      const month = currentMonth.value;
      const lastDay = new Date(year, month + 1, 0).getDate();
      let added = 0;
      // 删除当前月已生成的固定课程
      data.value.todos = data.value.todos.filter(t => {
        if (t.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`) && (t.type === 'fitness' || t.type === 'piano')) return false;
        return true;
      });
      for (let d = 1; d <= lastDay; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const wd = new Date(year, month, d).getDay();
        if (courses.value.fitness.weekdays.includes(wd)) {
          data.value.todos.push({ id: uid(), date: dateStr, title: '健身课', type: 'fitness', done: false });
          added++;
        }
        if (courses.value.piano.weekdays.includes(wd)) {
          data.value.todos.push({ id: uid(), date: dateStr, title: '钢琴课', type: 'piano', done: false });
          added++;
        }
      }
      saveData();
      showToast(`已生成本月 ${added} 节固定课程`);
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
        for (const item of list) {
          const s = data.value.stocks.find(x => x.code === item.code);
          if (s) {
            s.price = item.price;
            s.change = item.change;
            s.open = item.open;
            s.high = item.high;
            s.low = item.low;
            s.updatedAt = item.time;
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
      showToast('正在获取热榜...');
      const now = new Date();
      hotUpdateTime.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      for (const source of hotSources.value) {
        source.loading = true;
        try {
          if (source.static) {
            source.items = [
              { title: '化妆品观察 · 本周美妆新品趋势', url: 'https://mp.weixin.qq.com' },
              { title: '聚美丽 · 2026 美妆行业半年报', url: 'https://mp.weixin.qq.com' },
              { title: '用户说 · 小红书护肤热门成分分析', url: 'https://mp.weixin.qq.com' },
              { title: '青眼 · 国货彩妆出海观察', url: 'https://mp.weixin.qq.com' }
            ];
          } else {
            source.items = await fetchHotBoard(source.type);
          }
        } catch (e) {
          console.error(e);
          source.items = [{ title: '获取失败，请稍后重试', url: '#' }];
        } finally {
          source.loading = false;
        }
      }
      showToast('热榜更新完成');
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
      courses,
      toggleWeekday,
      generateRecurringTodos,
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
      refreshHot,
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
