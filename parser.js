(function(){
/**
 * 人物信息识别引擎（本地规则解析）
 *
 * 设计原则：
 * 1. 用户提供了什么，就只记录什么；没有提供的字段一律留空，绝不编造/推测。
 * 2. 已在档案中的人物，再次输入新设定时增量补充，绝不重复创建人物。
 * 3. 无法确定说的是哪个人物时，返回候选让前端询问用户确认。
 *
 * 输出结构：
 * {
 *   action: 'create' | 'update' | 'need_target',
 *   characterId: number | null,
 *   name: string,
 *   fields: { role: [], birth_date: [], alias: [], occupation: [], appearance: [], personality: [], background: [] },
 *   candidates: [{id, name, role}],
 *   unknown: string,            // 无法归类但已附到背景的原文
 *   hint: string
 * }
 */

// ---------------------------------------------------------------- 词库

const ROLE_WORDS = [
  '男主角', '女主角', '男主', '女主', '主角', '第一主角', '第二主角',
  '男配角', '女配角', '男配', '女配', '配角',
  '反派', '大反派', '反派boss', '反派BOSS', 'boss', 'BOSS', '幕后黑手',
  '导师', '师父', '师傅', '恩师', '反派女主角', '反派男主角',
  '路人', '龙套', '群演', '旁白', '叙述者',
  '重要���色', '次要角色', '客串角色', '神秘人',
];

const OCCUPATION_WORDS = [
  '医生', '外科医生', '法医', '护士', '药剂师', '律师', '检察官', '法官', '警察', '刑警', '警长',
  '侦探', '私家侦探', '特工', '间谍', '杀手', '保镖', '军人', '士兵', '将军', '元帅', '军官',
  '程序员', '工程师', '设计师', '建筑师', '产品经理', '老板', '总裁', 'ceo', 'CEO', '总经理',
  '作家', '小说家', '诗人', '记者', '编辑', '画家', '音乐家', '钢琴家', '歌手', '演员', '明星',
  '老师', '教师', '教授', '讲师', '学生', '大学生', '研究生', '留学生',
  '考古学家', '历史学家', '科学家', '研究员', '学者', '教授',
  '文物修复师', '鉴定师', '拍卖师', '策展人', '馆长', '收藏家', '古董商', '商人', '富豪',
  '厨师', '服务员', '司机', '飞行员', '船长', '海盗', '渔夫', '农民', '猎人', '铁匠', '木匠',
  '巫师', '法师', '魔法师', '剑客', '骑士', '祭司', '修士', '道士', '和尚', '尼姑',
  '乞丐', '小偷', '骗子', '管家', '侍女', '丫鬟', '太监', '皇帝', '王爷', '公主', '王子',
  '皇后', '太后', '大臣', '宰相', '校尉', '掌门', '长老', '弟子', '门主', '少主',
  '快递员', '保安', '清洁工', '医生助理', '心理咨询师', '翻译', '导游',
];

const APPEARANCE_HINTS = [
  '长得', '长相', '外貌', '容貌', '面容', '面庞', '样子', '模样', '身高', '身材', '体型',
  '皮肤', '眼睛', '眼神', '瞳孔', '眸', '头发', '发色', '短发', '长发', '戴着', '穿着', '一身',
  '眉', '鼻', '唇', '嘴角', '笑容', '声音', '嗓音', '手上', '左手', '右手', '纹身', '疤痕', '伤疤',
  '英俊', '俊美', '帅气', '美丽', '漂亮', '清秀', '可爱', '高挑', '魁梧', '瘦弱', '肥胖', '矮小', '苍老', '年轻',
];

const PERSONALITY_HINTS = [
  '性格', '性情', '脾气', '为人', '内心', '骨子里', '本质上', '本性',
  '温柔', '冷酷', '冷漠', '冷淡', '开朗', '乐观', '悲观', '内向', '外向', '孤僻', '孤独',
  '执着', '固执', '倔强', '善良', '恶毒', '狡猾', '谨慎', '小心', '冲动', '勇敢', '胆小', '懦弱',
  '聪明', '机智', '愚笨', '幽默', '风趣', '严肃', '古板', '豪爽', '细腻', '敏感', '残忍', '正直',
  '阴险', '坚韧', '坚强', '脆弱', '懒惰', '勤奋', '好奇', '多疑', '专情', '花心', '傲娇', '腹黑',
  '热血', '冷静', '理智', '感性', '理性', '偏执', '疯狂', '温和', '暴躁', '温柔体贴', '沉默寡言',
];

const BACKGROUND_HINTS = [
  '小时候', '童年', '儿时', '从小', '曾经', '过去', '以前', '当年', '往事', '出身', '身世', '来历',
  '经历', '背景', '长大', '生于', '出生于', '出生在', '孤儿院', '孤儿', '家庭', '家境',
  '父母', '父亲', '母亲', '爸爸', '妈妈', '爷爷', '奶奶', '外公', '外婆', '哥哥', '姐姐', '弟弟', '妹妹',
  '毕业于', '读过', '念过', '参军', '退役', '离婚', '丧偶', '去世', '死亡', '失踪', '失忆',
  '因为', '后来', '之后', '从此', '一直', '梦想', '愿望', '目的', '目标', '秘密', '真相',
];

const ALIAS_HINTS = ['别名', '又叫', '也叫', '人称', '外号', '绰号', '被叫', '被人称为', '化名', '字', '号'];

// ---------------------------------------------------------------- 工具

const SPLIT_RE = /[，,。；;！？!?、\n\r]+/;

function splitClauses(text) {
  return String(text || '')
    .split(SPLIT_RE)
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripPrefix(s) {
  return s
    .replace(/^(他|她|它|这个|那个|这个角色|该角色|人物)?\s*/, '')
    .replace(/^(是|叫|名叫|名字是|名为|叫作|叫做|称为|为|做|当|担任|的职业是|职业是|工作是|工作是做)\s*/, '')
    .replace(/^(一个|一名|一位|个|名|位)\s*/, '')
    .replace(/[。.!！？?]$/, '')
    .trim();
}

// 日期识别
const DATE_PATTERNS = [
  /(\d{4})\s*[年\-\/.]\s*(\d{1,2})\s*[月\-\/.]\s*(\d{1,2})\s*[日号]?/,
  /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/,
  /(\d{4})\s*年\s*(\d{1,2})\s*月/,
  /(\d{4})\s*年/,
];

function findDate(text) {
  for (const re of DATE_PATTERNS) {
    const m = text.match(re);
    if (m) return m[0].replace(/\s+/g, '');
  }
  return null;
}

const BIRTH_HINTS = ['生日', '出生日期', '出生于', '出生在', '生于', '出生'];

function hasAny(text, words) {
  return words.some((w) => text.includes(w));
}

// 从文本中找出已有人物的引用（按姓名长度降序，避免"小"被误匹配）
function matchExistingCharacters(text, characters) {
  const pool = [];
  for (const c of characters) {
    if (c.name) pool.push({ id: c.id, name: c.name, role: c.role });
    const aliases = String(c.alias || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const a of aliases) pool.push({ id: c.id, name: a, role: c.role, isAlias: true });
  }
  pool.sort((a, b) => b.name.length - a.name.length);

  const hits = [];
  for (const p of pool) {
    if (!p.name) continue;
    if (text.includes(p.name)) {
      hits.push(p);
    }
  }
  // 同一人物可能命中多个别名，去重
  const ids = [];
  const uniq = [];
  for (const h of hits) {
    if (!ids.includes(h.id)) {
      ids.push(h.id);
      uniq.push(h);
    }
  }
  return uniq;
}

// 从"男主角叫宪法"这类句式里提取新人物名
function extractName(clause) {
  const patterns = [
    /(?:男主角|女主角|主角|男主|女主|男配角|女配角|男配|女配|配角|反派|大反派|导师|路人|龙套)?\s*(?:名字|姓名)?\s*(?:叫|名叫|名字叫|称为|叫作|叫做|是)\s*([^\s，。,.！？!?；;：:]{1,15})/,
    /(?:人物|角色|主角)?\s*(?:名字|姓名)\s*(?:是|叫|为|：|:)\s*([^\s，。,.！？!?；;]{1,15})/,
    /^([^\s，。,.！？!?；;]{1,15})\s*(?:，|,)?\s*(?:男主角|女主角|男主|女主|主角|男配|女配|配角|反派)/,
  ];
  for (const re of patterns) {
    const m = clause.match(re);
    if (m && m[1]) {
      let name = m[1].trim();
      // 去掉尾部常见虚词
      name = name.replace(/(的|了|吧|呢|啊)$/, '').trim();
      // 排除纯身份词
      if (ROLE_WORDS.includes(name)) continue;
      if (name.length >= 1 && name.length <= 15) return name;
    }
  }
  return null;
}

function extractRole(text) {
  for (const w of ROLE_WORDS) {
    if (text.includes(w)) return w;
  }
  return null;
}

function extractAlias(clause) {
  for (const h of ALIAS_HINTS) {
    const idx = clause.indexOf(h);
    if (idx >= 0) {
      let rest = clause.slice(idx + h.length).trim();
      rest = rest.replace(/^[：:\s]*/, '').trim();
      rest = rest.replace(/^(叫|叫作|叫做|称为|是)/, '').trim();
      rest = rest.replace(/[。.!！？?，,；;]$/g, '').trim();
      if (rest) return rest;
    }
  }
  return null;
}

function extractOccupation(clause) {
  // 显式："职业是医生"
  let m = clause.match(/(?:职业|工作|职位|身份)\s*(?:是|为|：|:)\s*([^\s，。,.！？!?；;]{1,20})/);
  if (m) return stripPrefix(m[1]);
  // 词库直接命中
  for (const w of OCCUPATION_WORDS) {
    if (clause.includes(w)) return w;
  }
  // "是一名xxx" / "是个xxx"
  m = clause.match(/(?:是|当|做|成为|担任)\s*(?:一个|一名|一位|个|名|位)?\s*([^\s，。,.！？!?；;]{2,10}?(?:师|员|家|人|者|长|工|商|警|医|官|士|匠|夫|徒|生|手|爷|主|娘|婆|公|后|相|王|帝|将))/);
  if (m) return stripPrefix(m[1]);
  return null;
}

// ---------------------------------------------------------------- 主解析

/**
 * @param {string} input 用户原始输入
 * @param {Array} characters 当前小说已有的人物档案
 */
function parseCharacterInput(input, characters = []) {
  const text = String(input || '').trim();
  const result = {
    action: 'need_target',
    characterId: null,
    name: '',
    fields: {
      role: [],
      birth_date: [],
      alias: [],
      occupation: [],
      appearance: [],
      personality: [],
      background: [],
    },
    candidates: [],
    raw: text,
    hint: '',
  };

  if (!text) return result;

  // 1) 判断是否提到已有人物
  const hits = matchExistingCharacters(text, characters);

  let targetId = null;
  let targetName = '';

  if (hits.length === 1) {
    targetId = hits[0].id;
    targetName = hits[0].name;
  } else if (hits.length > 1) {
    // 提到多个人物，无法判断说的是谁 —— 交由用户确认
    result.action = 'need_target';
    result.candidates = hits.map((h) => ({ id: h.id, name: h.name, role: h.role }));
    result.hint = '你这段话里提到了多个人物，请确认这条设定属于谁。';
    result.fields = collectFields(text, '');
    return result;
  } else {
    // 2) 新人名提取
    const clauses = splitClauses(text);
    for (const c of clauses) {
      const n = extractName(c);
      if (n) {
        // 与已有人物做近似比对（包含关系），避免重复创建
        const similar = characters.filter(
          (ch) => ch.name && (ch.name.includes(n) || n.includes(ch.name))
        );
        if (similar.length === 1) {
          targetId = similar[0].id;
          targetName = similar[0].name;
        } else if (similar.length > 1) {
          result.action = 'need_target';
          result.candidates = similar.map((ch) => ({ id: ch.id, name: ch.name, role: ch.role }));
          result.hint = `有 ${similar.length} 个人物的名字与「${n}」相近，请确认这条设定属于谁。`;
          result.name = n;
          result.fields = collectFields(text, n);
          return result;
        } else {
          targetName = n;
        }
        break;
      }
    }
  }

  if (targetId) {
    result.action = 'update';
    result.characterId = targetId;
    const exist = characters.find((c) => c.id === targetId);
    result.name = exist ? exist.name : targetName;
    result.hint = `已识别到人物「${result.name}」，这条新信息将补充进 TA 已有的档案。`;
  } else if (targetName) {
    result.action = 'create';
    result.name = targetName;
    result.hint = `将创建新人物「${targetName}」。`;
  } else {
    // 3) 完全无法判断归属 —— 询问用户
    result.action = 'need_target';
    result.candidates = characters.map((c) => ({ id: c.id, name: c.name, role: c.role }));
    result.hint = '没能判断出这条设定属于哪个人物，请选择人物，或先补上人物名字再输入。';
    result.fields = collectFields(text, '');
    return result;
  }

  result.fields = collectFields(text, targetName);
  return result;
}

// 从文本中抽取各字段内容（不做任何推测补充）
function collectFields(text, name) {
  const fields = {
    role: [],
    birth_date: [],
    alias: [],
    occupation: [],
    appearance: [],
    personality: [],
    background: [],
  };

  const clauses = splitClauses(text);
  const consumed = new Set();
  let roleDone = false;

  clauses.forEach((clause, idx) => {
    let c = clause;
    // 去掉已识别的人名，避免干扰
    if (name) c = c.split(name).join('');

    // 出生日期
    if (hasAny(c, BIRTH_HINTS) || /\d{4}\s*年/.test(c) || /\d{1,2}\s*月\s*\d{1,2}\s*日/.test(c)) {
      const date = findDate(c);
      if (date) {
        fields.birth_date.push(date);
        consumed.add(idx);
        return;
      }
      const rest = stripPrefix(c.replace(/(生日|出生日期|出生于|出生在|生于|出生)/, ''));
      if (rest) {
        fields.birth_date.push(rest);
        consumed.add(idx);
        return;
      }
    }

    // 别名
    const alias = extractAlias(c);
    if (alias) {
      fields.alias.push(alias);
      consumed.add(idx);
      return;
    }

    // 身份
    if (!roleDone) {
      const role = extractRole(c);
      if (role) {
        fields.role.push(role);
        roleDone = true;
        // 该句可能还含名字，不消费，继续看是否还有其它字段
        if (stripPrefix(c.replace(role, '')).length === 0) {
          consumed.add(idx);
          return;
        }
      }
    }

    // 职业
    if (/(职业|工作|职位)/.test(c) || hasAny(c, OCCUPATION_WORDS) || /(?:是|当|做|成为|担任)\s*(?:一个|一名|一位|个|名|位)?/.test(c)) {
      const occ = extractOccupation(c);
      if (occ) {
        fields.occupation.push(occ);
        consumed.add(idx);
        return;
      }
    }

    // 外貌
    if (hasAny(c, APPEARANCE_HINTS)) {
      const v = cleanSentence(c);
      if (v) {
        fields.appearance.push(v);
        consumed.add(idx);
        return;
      }
    }

    // 性格
    if (hasAny(c, PERSONALITY_HINTS)) {
      const v = cleanSentence(c);
      if (v) {
        fields.personality.push(v);
        consumed.add(idx);
        return;
      }
    }

    // 背景（含叙述性内容）
    if (hasAny(c, BACKGROUND_HINTS) || /\d{4}\s*年/.test(c)) {
      const v = cleanSentence(c);
      if (v) {
        fields.background.push(v);
        consumed.add(idx);
        return;
      }
    }
  });

  // 未被任何规则消费的句子：只要有叙述性（长度 >= 4）就原样存入背景，绝不丢弃、绝不改写
  clauses.forEach((clause, idx) => {
    if (consumed.has(idx)) return;
    const v = cleanSentence(clause);
    if (!v) return;
    if (name && v === name) return;
    if (ROLE_WORDS.includes(v)) return;
    fields.background.push(v);
  });

  return fields;
}

function cleanSentence(s) {
  let v = String(s || '').trim();
  if (!v) return '';
  v = v.replace(/^(他|她|它|这个人物|这个角色|人物|角色)?\s*/, '');
  v = v.replace(/[。.!！？?，,；;]$/g, '').trim();
  return v;
}

window.parseCharacterInput = parseCharacterInput;

})();
