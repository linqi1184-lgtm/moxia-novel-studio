/* 墨匣 · 本地存储后端（手机/浏览器版）
 * 拦截 /api/* 请求，全部数据保存在本机浏览器 localStorage 中。
 * 不需要服务器，链接永久可用；建议定期用「导出备份」保存一份 JSON。
 */
(function () {
  'use strict';

  var KEY = 'moxia.db.v1';
  var BACKUP_KEY = 'moxia.lastBackupAt';

  // ------------------------------------------------------------ 存储
  var db = null;

  function blank() {
    return { novels: [], characters: [], ideas: [], plots: [], documents: [], seq: {} };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return seed(blank());
      var d = JSON.parse(raw);
      ['novels', 'characters', 'ideas', 'plots', 'documents'].forEach(function (k) {
        if (!Array.isArray(d[k])) d[k] = [];
      });
      d.seq = d.seq || {};
      return d;
    } catch (e) {
      console.error('数据读取失败', e);
      return seed(blank());
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      return true;
    } catch (e) {
      alert('保存失败：浏览器存储空间可能已满。请先「导出备份」，再清理部分内容。');
      return false;
    }
  }

  function now() {
    return new Date().toISOString();
  }

  var CHARACTER_FIELDS = ['name', 'role', 'birth_date', 'alias', 'occupation', 'appearance', 'personality', 'background'];

  function toLines(v) {
    return String(v == null ? '' : v).split('\n').map(function (s) { return s.replace(/\s+$/, ''); }).filter(Boolean);
  }
  function toText(v) {
    if (Array.isArray(v)) return v.filter(Boolean).join('\n');
    return v == null ? '' : String(v);
  }

  // ------------------------------------------------------------ 演示数据
  function seed(d) {
    var t = now();
    var n1 = { id: nextId(d, 'novels'), title: '藏品之影', genre: '悬疑', summary: '', color: '#8a6d3b', archived: 0, created_at: t, updated_at: t };
    d.novels.push(n1);
    [
      { name: '宪法', role: '男主角', birth_date: '1982年12月4日', alias: '老宪', occupation: '医生', background: '小时候在孤儿院长大' },
      { name: '林晚', role: '女主角', occupation: '藏品修复师' },
    ].forEach(function (c, i) {
      d.characters.push({
        id: nextId(d, 'characters'), novel_id: n1.id, sort_order: i,
        name: c.name, role: c.role || '', birth_date: c.birth_date || '', alias: c.alias || '',
        occupation: c.occupation || '', appearance: c.appearance || '', personality: c.personality || '',
        background: c.background || '', created_at: t, updated_at: t,
      });
    });
    [
      '女主需要在186万件藏品之中，找到真正属于她的那件藏品。',
      '男主其实早就知道这件藏品的存在。',
      '这件藏品可能和女主的前世有关。',
      '男主其实早就认识女主。',
      '女主小时候曾经见过一件特殊的藏品。',
      '这个故事需要一个反转。',
      '男主不能太早暴露自己的身份。',
      '女主最后发现自己寻找的东西一直在身边。',
    ].forEach(function (content, i) {
      d.ideas.push({ id: nextId(d, 'ideas'), novel_id: n1.id, content: content, created_at: t, updated_at: t });
    });
    return d;
  }

  function nextId(d, kind) {
    d.seq[kind] = (d.seq[kind] || 0) + 1;
    return d.seq[kind];
  }

  db = load();

  // ------------------------------------------------------------ 文档构建
  function buildIdeaDocument(ideas) {
    var lines = [];
    ideas.forEach(function (it, i) {
      lines.push('【' + (i + 1) + '】' + it.content);
      lines.push('');
    });
    if (!ideas.length) lines.push('（灵感收集箱暂无记录）');
    return lines.join('\n').trim();
  }

  var CHAR_LABELS = [
    ['role', '人物身份'], ['birth_date', '出生日期'], ['alias', '别名'],
    ['occupation', '职业'], ['appearance', '外貌'], ['personality', '性格'], ['background', '人物背景'],
  ];

  function buildCharacterDocument(characters) {
    if (!characters.length) return '（还没有人物档案）';
    var lines = [];
    characters.forEach(function (c, i) {
      lines.push('【' + (i + 1) + '】' + c.name);
      CHAR_LABELS.forEach(function (p) {
        var v = toLines(c[p[0]]);
        if (v.length) lines.push(p[1] + '：' + v.join('；'));
      });
      lines.push('');
    });
    return lines.join('\n').trim();
  }

  // ------------------------------------------------------------ 路由实现
  function ok(data, code) { return { ok: true, status: code || 200, _data: data }; }
  function fail(msg, code) { return { ok: false, status: code || 400, _data: { error: msg } }; }

  function route(method, path, body) {
    var p = path.split('?')[0];
    var m;

    function novel(id) { return db.novels.find(function (x) { return x.id === Number(id); }); }

    // 小说列表
    if (method === 'GET' && p === '/api/novels') {
      var archived = /archived=1/.test(path);
      var list = db.novels.filter(function (x) { return !!x.archived === !!archived; });
      list.sort(function (a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); });
      return ok(list.map(function (n) {
        return Object.assign({}, n, {
          stats: {
            characters: db.characters.filter(function (c) { return c.novel_id === n.id; }).length,
            ideas: db.ideas.filter(function (i) { return i.novel_id === n.id; }).length,
            plots: 0,
          },
        });
      }));
    }
    if (method === 'POST' && p === '/api/novels') {
      if (!body.title || !String(body.title).trim()) return fail('请填写小说名称');
      var t = now();
      var n = {
        id: nextId(db, 'novels'), title: String(body.title).trim(), genre: body.genre || '',
        summary: body.summary || '', color: body.color || '#8a6d3b', archived: 0,
        created_at: t, updated_at: t,
      };
      db.novels.push(n);
      save();
      return ok(n, 201);
    }
    if ((m = p.match(/^\/api\/novels\/(\d+)$/))) {
      var id = Number(m[1]);
      var cur = novel(id);
      if (!cur) return fail('小说不存在', 404);
      if (method === 'GET') return ok(cur);
      if (method === 'PUT') {
        Object.keys(body).forEach(function (k) { if (k !== 'id') cur[k] = body[k]; });
        cur.updated_at = now();
        save();
        return ok(cur);
      }
      if (method === 'DELETE') {
        db.novels = db.novels.filter(function (x) { return x.id !== id; });
        db.characters = db.characters.filter(function (x) { return x.novel_id !== id; });
        db.ideas = db.ideas.filter(function (x) { return x.novel_id !== id; });
        db.documents = db.documents.filter(function (x) { return x.novel_id !== id; });
        save();
        return ok({ ok: true });
      }
    }
    if ((m = p.match(/^\/api\/novels\/(\d+)\/archive$/)) && method === 'POST') {
      var an = novel(m[1]);
      if (!an) return fail('小说不存在', 404);
      an.archived = an.archived ? 0 : 1;
      an.updated_at = now();
      save();
      return ok(an);
    }

    // 人物
    if ((m = p.match(/^\/api\/novels\/(\d+)\/characters$/)) && method === 'GET') {
      return ok(db.characters.filter(function (c) { return c.novel_id === Number(m[1]); })
        .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id; }));
    }
    if ((m = p.match(/^\/api\/novels\/(\d+)\/characters$/)) && method === 'POST') {
      var nid = Number(m[1]);
      var tt = now();
      var c = {
        id: nextId(db, 'characters'), novel_id: nid, sort_order: db.characters.filter(function (x) { return x.novel_id === nid; }).length,
        name: body.name || '未命名人物', role: '', birth_date: '', alias: '', occupation: '',
        appearance: '', personality: '', background: '', created_at: tt, updated_at: tt,
      };
      CHARACTER_FIELDS.forEach(function (f) { if (body[f] != null) c[f] = toText(body[f]); });
      db.characters.push(c);
      save();
      return ok(c, 201);
    }
    if ((m = p.match(/^\/api\/novels\/(\d+)\/characters\/parse$/)) && method === 'POST') {
      var nidp = Number(m[1]);
      var chars = db.characters.filter(function (x) { return x.novel_id === nidp; });
      var res = window.parseCharacterInput(body.text || '', chars);
      return ok(res);
    }
    if ((m = p.match(/^\/api\/novels\/(\d+)\/characters\/apply$/)) && method === 'POST') {
      var nida = Number(m[1]);
      if (body.characterId) {
        var target = db.characters.find(function (x) { return x.id === Number(body.characterId) && x.novel_id === nida; });
        if (!target) return fail('人物不存在', 404);
        var patch = {};
        CHARACTER_FIELDS.forEach(function (f) {
          var incoming = toLines(body.fields ? body.fields[f] : null);
          if (!incoming.length) return;
          if (f === 'name') {
            if (!target.name || target.name === '未命名人物') patch.name = incoming[0];
            return;
          }
          var existing = toLines(target[f]);
          incoming.forEach(function (line) { if (existing.indexOf(line) === -1) existing.push(line); });
          patch[f] = existing.join('\n');
        });
        Object.keys(patch).forEach(function (k) { target[k] = patch[k]; });
        target.updated_at = now();
        save();
        return ok({ mode: 'update', character: target });
      }
      var payload = {};
      CHARACTER_FIELDS.forEach(function (f) { payload[f] = toText(body.fields ? body.fields[f] : ''); });
      payload.name = body.name || payload.name || '未命名人物';
      var tt2 = now();
      var nc = Object.assign({
        id: nextId(db, 'characters'), novel_id: nida, created_at: tt2, updated_at: tt2,
        sort_order: db.characters.filter(function (x) { return x.novel_id === nida; }).length,
      }, payload);
      CHARACTER_FIELDS.forEach(function (f) { if (nc[f] == null) nc[f] = ''; });
      db.characters.push(nc);
      save();
      return ok({ mode: 'create', character: nc }, 201);
    }
    if ((m = p.match(/^\/api\/novels\/(\d+)\/characters\/(\d+)$/))) {
      var cid = Number(m[2]);
      var tc = db.characters.find(function (x) { return x.id === cid && x.novel_id === Number(m[1]); });
      if (!tc) return fail('人物不存在', 404);
      if (method === 'GET') return ok(tc);
      if (method === 'PUT') {
        CHARACTER_FIELDS.forEach(function (f) { if (body[f] != null) tc[f] = toText(body[f]); });
        tc.updated_at = now();
        save();
        return ok(tc);
      }
      if (method === 'DELETE') {
        db.characters = db.characters.filter(function (x) { return x.id !== cid; });
        save();
        return ok({ ok: true });
      }
    }
    if ((m = p.match(/^\/api\/novels\/(\d+)\/characters\/organize$/)) && method === 'POST') {
      var no = novel(m[1]);
      if (!no) return fail('小说不存在', 404);
      var cs = db.characters.filter(function (x) { return x.novel_id === Number(m[1]); })
        .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id; });
      var doc = newDoc(Number(m[1]), 'characters', no.title + ' · 人物档案（' + cs.length + ' 位）', buildCharacterDocument(cs), cs.length);
      return ok(doc, 201);
    }

    // 灵感（kind 复用：plots 也走 ideas 存储，两模块已合并）
    if ((m = p.match(/^\/api\/novels\/(\d+)\/(ideas|plots)$/)) && method === 'GET') {
      return ok(db.ideas.filter(function (x) { return x.novel_id === Number(m[1]); }).sort(function (a, b) { return a.id - b.id; }));
    }
    if ((m = p.match(/^\/api\/novels\/(\d+)\/(ideas|plots)$/)) && method === 'POST') {
      if (!body.content || !String(body.content).trim()) return fail('内容不能为空');
      var t3 = now();
      var it = { id: nextId(db, 'ideas'), novel_id: Number(m[1]), content: String(body.content).trim(), created_at: t3, updated_at: t3 };
      db.ideas.push(it);
      save();
      return ok(it, 201);
    }
    if ((m = p.match(/^\/api\/novels\/(\d+)\/(ideas|plots)\/(\d+)$/))) {
      var iid = Number(m[3]);
      var ti = db.ideas.find(function (x) { return x.id === iid && x.novel_id === Number(m[1]); });
      if (!ti) return fail('记录不存在', 404);
      if (method === 'PUT') {
        if (!body.content || !String(body.content).trim()) return fail('内容不能为空');
        ti.content = String(body.content).trim();
        ti.updated_at = now();
        save();
        return ok(ti);
      }
      if (method === 'DELETE') {
        db.ideas = db.ideas.filter(function (x) { return x.id !== iid; });
        save();
        return ok({ ok: true });
      }
    }

    // 一键整理
    if ((m = p.match(/^\/api\/novels\/(\d+)\/organize$/)) && method === 'POST') {
      var no2 = novel(m[1]);
      if (!no2) return fail('小说不存在', 404);
      var list2 = db.ideas.filter(function (x) { return x.novel_id === Number(m[1]); }).sort(function (a, b) { return a.id - b.id; });
      var d2 = newDoc(Number(m[1]), 'ideas', no2.title + ' · 灵感汇总（' + list2.length + ' 条）', buildIdeaDocument(list2), list2.length);
      return ok(d2, 201);
    }

    // 文档
    if ((m = p.match(/^\/api\/novels\/(\d+)\/documents$/)) && method === 'GET') {
      return ok(db.documents.filter(function (x) { return x.novel_id === Number(m[1]); }).sort(function (a, b) { return b.id - a.id; }));
    }
    if ((m = p.match(/^\/api\/novels\/(\d+)\/documents\/(\d+)$/))) {
      var did = Number(m[2]);
      var td = db.documents.find(function (x) { return x.id === did && x.novel_id === Number(m[1]); });
      if (!td) return fail('文档不存在', 404);
      if (method === 'GET') return ok(td);
      if (method === 'PUT') {
        if (body.content != null) td.content = body.content;
        if (body.title != null) td.title = body.title;
        td.updated_at = now();
        save();
        return ok(td);
      }
      if (method === 'DELETE') {
        db.documents = db.documents.filter(function (x) { return x.id !== did; });
        save();
        return ok({ ok: true });
      }
    }
    if ((m = p.match(/^\/api\/novels\/(\d+)\/documents\/(\d+)\/regenerate$/)) && method === 'POST') {
      var nidr = Number(m[1]);
      var dr = db.documents.find(function (x) { return x.id === Number(m[2]) && x.novel_id === nidr; });
      if (!dr) return fail('文档不存在', 404);
      var nr = novel(nidr);
      var content, title, count;
      if (dr.type === 'characters') {
        var cr = db.characters.filter(function (x) { return x.novel_id === nidr; })
          .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id; });
        content = buildCharacterDocument(cr);
        title = nr.title + ' · 人物档案（' + cr.length + ' 位）';
        count = cr.length;
      } else {
        var ir = db.ideas.filter(function (x) { return x.novel_id === nidr; }).sort(function (a, b) { return a.id - b.id; });
        content = buildIdeaDocument(ir);
        title = nr.title + ' · 灵感汇总（' + ir.length + ' 条）';
        count = ir.length;
      }
      dr.content = content;
      dr.title = title;
      dr.updated_at = now();
      save();
      return ok(Object.assign({}, dr, { source_count: count }));
    }

    // 环境信息
    if (method === 'GET' && p === '/api/info') {
      return ok({
        mode: 'local',
        localUrl: location.origin,
        lanUrl: location.origin,
        backup: { count: db.documents.length, latest: localStorage.getItem(BACKUP_KEY) || '' },
      });
    }

    return fail('接口不存在：' + method + ' ' + p, 404);
  }

  function newDoc(novelId, type, title, content, count) {
    var t = now();
    var d = {
      id: nextId(db, 'documents'), novel_id: novelId, type: type, title: title,
      content: content, source_count: count, created_at: t, updated_at: t,
    };
    db.documents.push(d);
    save();
    return d;
  }

  // ------------------------------------------------------------ fetch 拦截
  function makeResponse(r) {
    var body = JSON.stringify(r._data);
    return {
      ok: r.ok,
      status: r.status,
      statusText: r.ok ? 'OK' : 'Error',
      headers: { get: function () { return 'application/json'; } },
      json: function () { return Promise.resolve(JSON.parse(body)); },
      text: function () { return Promise.resolve(body); },
    };
  }

  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/') === 0 || url.indexOf(location.origin + '/api/') === 0) {
      var p = url.replace(location.origin, '');
      var method = (init && init.method) || 'GET';
      var body = {};
      if (init && init.body) {
        try { body = JSON.parse(init.body); } catch (e) { body = {}; }
      }
      var r;
      try {
        r = route(method.toUpperCase(), p, body);
      } catch (e) {
        r = fail(e.message || '处理失败', 500);
      }
      return Promise.resolve(makeResponse(r));
    }
    return origFetch.apply(window, arguments);
  };

  // ------------------------------------------------------------ 备份导出 / 导入
  window.MoXiaBackup = {
    exportJson: function () {
      return JSON.stringify(db, null, 2);
    },
    importJson: function (text) {
      var d = JSON.parse(text);
      if (!d || !Array.isArray(d.novels)) throw new Error('不是有效的备份文件');
      db = d;
      ['novels', 'characters', 'ideas', 'plots', 'documents'].forEach(function (k) {
        if (!Array.isArray(db[k])) db[k] = [];
      });
      db.seq = db.seq || {};
      save();
    },
    markBackup: function () { localStorage.setItem(BACKUP_KEY, now()); },
    lastBackup: function () { return localStorage.getItem(BACKUP_KEY); },
    size: function () { return (localStorage.getItem(KEY) || '').length; },
    count: function () {
      return { novels: db.novels.length, characters: db.characters.length, ideas: db.ideas.length };
    },
  };
})();
