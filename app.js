/* 墨匣 · AI 小说创作管理工作台 —— 前端 */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // ---------------------------------------------------------------- 工具
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  function fmtTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const p = (n) => String(n).padStart(2, '0');
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
    return sameDay ? `今天 ${hm}` : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${hm}`;
  }
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }
  async function api(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
  }
  function lines(v) {
    return String(v || '').split('\n').map((s) => s.replace(/\s+$/, '')).filter(Boolean);
  }

  // ---------------------------------------------------------------- 弹窗
  function openModal(html, onMount) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-mask"><div class="modal">${html}</div></div>`;
    const mask = root.querySelector('.modal-mask');
    mask.addEventListener('click', (e) => { if (e.target === mask) closeModal(); });
    if (onMount) onMount(root);
  }
  function closeModal() { $('#modal-root').innerHTML = ''; }

  function confirmModal(title, desc, okText, onOk, danger) {
    openModal(
      `<h3>${esc(title)}</h3><p style="font-size:14px;color:var(--ink-2);margin:0 0 16px">${esc(desc)}</p>
       <div class="modal-actions">
         <button class="btn btn-ghost" data-act="cancel">取消</button>
         <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${esc(okText)}</button>
       </div>`,
      (root) => {
        root.querySelector('[data-act="cancel"]').onclick = closeModal;
        root.querySelector('[data-act="ok"]').onclick = async () => { closeModal(); await onOk(); };
      }
    );
  }

  // ---------------------------------------------------------------- 状态
  const state = {
    novels: [],
    novel: null,
    tab: 'characters',
    characters: [],
    ideas: [],
    pendingParse: null,
    doc: null,
    docEditing: false,
  };

  const CHAR_FIELDS = [
    { key: 'role', label: '人物身份' },
    { key: 'birth_date', label: '出生日期' },
    { key: 'alias', label: '别名' },
    { key: 'occupation', label: '职业' },
    { key: 'appearance', label: '外貌' },
    { key: 'personality', label: '性格' },
    { key: 'background', label: '人物背景' },
  ];

  const COLORS = ['#8a6d3b', '#7a6a8c', '#4f6d6a', '#8c5a5a', '#5a6f8c', '#6d7a4f', '#8c7a4f', '#5c5348'];

  // ---------------------------------------------------------------- 首页
  async function loadHome() {
    state.novels = await api('GET', '/api/novels');
    renderHome();
  }

  function renderHome() {
    const active = state.novels.filter((n) => !n.archived);
    const archived = state.novels.filter((n) => n.archived);
    $('#count-active').textContent = active.length ? `${active.length} 本` : '';
    $('#count-archived').textContent = archived.length ? `${archived.length} 本` : '';
    $('#home-empty').style.display = state.novels.length ? 'none' : 'block';
    $('#archive-section').style.display = archived.length ? 'flex' : 'none';
    $('#novel-list').innerHTML = active.map(novelCard).join('');
    $('#novel-archive-list').innerHTML = archived.map(novelCard).join('');

    $$('.novel-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-op]')) return;
        openNovel(Number(card.dataset.id));
      });
      card.querySelectorAll('[data-op]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = Number(card.dataset.id);
          const op = btn.dataset.op;
          if (op === 'edit') return editNovel(id);
          if (op === 'archive') {
            await api('POST', `/api/novels/${id}/archive`, { archived: true });
            toast('已归档');
            return loadHome();
          }
          if (op === 'unarchive') {
            await api('POST', `/api/novels/${id}/archive`, { archived: false });
            toast('已恢复');
            return loadHome();
          }
          if (op === 'delete') {
            return confirmModal('删除小说', '将同时删除这本小说的全部人物、情节与灵感记录，且无法恢复。', '确认删除', async () => {
              await api('DELETE', `/api/novels/${id}`);
              toast('已删除');
              loadHome();
            }, true);
          }
        });
      });
    });
  }

  function novelCard(n) {
    const ops = n.archived
      ? `<button class="mini-btn" data-op="unarchive">恢复</button><button class="mini-btn" data-op="delete">删除</button>`
      : `<button class="mini-btn" data-op="edit">编辑</button><button class="mini-btn" data-op="archive">归档</button><button class="mini-btn" data-op="delete">删除</button>`;
    return `<article class="novel-card ${n.archived ? 'archived' : ''}" data-id="${n.id}" style="--accent:${esc(n.color || '#8a6d3b')}">
      <div class="ops">${ops}</div>
      <h3>${esc(n.title)}</h3>
      ${n.genre ? `<div class="genre">${esc(n.genre)}</div>` : ''}
      <div class="synopsis">${esc(n.synopsis || '暂无简介')}</div>
      <div class="stats">
        <span>人物 <b>${n.stats.characters}</b></span>
        <span>灵感 <b>${n.stats.ideas}</b></span>
      </div>
    </article>`;
  }

  function novelFormModal(n) {
    const isNew = !n;
    const cur = n || { title: '', genre: '', synopsis: '', color: COLORS[0] };
    openModal(
      `<h3>${isNew ? '新建小说' : '编辑小说'}</h3>
       <div class="field-row"><label>小说名称</label><input id="f-title" placeholder="给这本小说起个名字" value="${esc(cur.title)}" /></div>
       <div class="field-row"><label>题材 / 类型（可选）</label><input id="f-genre" placeholder="如：悬疑、都市、历史" value="${esc(cur.genre)}" /></div>
       <div class="field-row"><label>简介（可选）</label><textarea id="f-synopsis" rows="3" placeholder="一句话讲讲这是个什么故事">${esc(cur.synopsis)}</textarea></div>
       <div class="field-row"><label>封面色调</label><div class="color-picker">${COLORS.map(
         (c) => `<div class="color-dot ${c === cur.color ? 'sel' : ''}" data-color="${c}" style="background:${c}"></div>`
       ).join('')}</div></div>
       <div class="modal-actions">
         <button class="btn btn-ghost" data-act="cancel">取消</button>
         <button class="btn btn-primary" data-act="ok">${isNew ? '创建' : '保存'}</button>
       </div>`,
      (root) => {
        let color = cur.color;
        root.querySelectorAll('.color-dot').forEach((d) => {
          d.onclick = () => {
            color = d.dataset.color;
            root.querySelectorAll('.color-dot').forEach((x) => x.classList.remove('sel'));
            d.classList.add('sel');
          };
        });
        root.querySelector('[data-act="cancel"]').onclick = closeModal;
        root.querySelector('[data-act="ok"]').onclick = async () => {
          const title = root.querySelector('#f-title').value.trim();
          if (!title) return toast('请填写小说名称');
          const payload = {
            title,
            genre: root.querySelector('#f-genre').value.trim(),
            synopsis: root.querySelector('#f-synopsis').value.trim(),
            color,
          };
          if (isNew) await api('POST', '/api/novels', payload);
          else await api('PUT', `/api/novels/${n.id}`, payload);
          closeModal();
          toast(isNew ? '已创建' : '已保存');
          loadHome();
        };
      }
    );
  }

  function editNovel(id) {
    const n = state.novels.find((x) => x.id === id);
    if (n) novelFormModal(n);
  }

  // ---------------------------------------------------------------- 小说详情
  async function openNovel(id) {
    state.novel = await api('GET', `/api/novels/${id}`);
    $('#novel-title').textContent = state.novel.title;
    $('#view-home').style.display = 'none';
    $('#view-novel').style.display = 'block';
    window.scrollTo(0, 0);
    await Promise.all([loadCharacters(), loadIdeas()]);
    updateNovelMeta();
  }

  function updateNovelMeta() {
    const n = state.novel;
    const bits = [];
    if (n.genre) bits.push(n.genre);
    bits.push(`人物 ${state.characters.length} · 灵感 ${state.ideas.length}`);
    $('#novel-meta').textContent = bits.join(' · ');
  }

  async function loadCharacters() {
    state.characters = await api('GET', `/api/novels/${state.novel.id}/characters`);
    renderCharacters();
    updateNovelMeta();
  }
  async function loadIdeas() {
    state.ideas = await api('GET', `/api/novels/${state.novel.id}/ideas`);
    renderIdeas();
    updateNovelMeta();
  }

  // ---------------------------------------------------------------- 人物模块
  function renderCharacters() {
    $('#count-characters').textContent = state.characters.length ? `${state.characters.length} 位` : '';
    $('#char-empty').style.display = state.characters.length ? 'none' : 'block';
    $('#character-list').innerHTML = state.characters.map(charCard).join('');

    $$('#character-list .char-card').forEach((card) => {
      const id = Number(card.dataset.id);
      card.querySelectorAll('[data-act]').forEach((btn) => {
        btn.onclick = async () => {
          const act = btn.dataset.act;
          if (act === 'del') {
            return confirmModal('删除人物', `确定删除「${charName(id)}」的档案吗？`, '删除', async () => {
              await api('DELETE', `/api/novels/${state.novel.id}/characters/${id}`);
              toast('已删除');
              loadCharacters();
            }, true);
          }
          if (act === 'edit-field') return editField(id, btn.dataset.field);
          if (act === 'del-line') return deleteLine(id, btn.dataset.field, Number(btn.dataset.index));
          if (act === 'edit-name') return editName(id);
        };
      });
    });
  }

  function charName(id) {
    const c = state.characters.find((x) => x.id === id);
    return c ? c.name : '';
  }

  function charCard(c) {
    const role = lines(c.role)[0] || '';
    const fields = CHAR_FIELDS.map((f) => {
      const vals = lines(c[f.key]);
      const inner = vals.length
        ? vals.map((v, i) => `<div class="field-line"><span>${esc(v)}</span><button class="del-x" data-act="del-line" data-field="${f.key}" data-index="${i}" title="删除这条">✕</button></div>`).join('')
        : `<span class="field-value empty">暂未填写</span>`;
      return `<div class="field">
        <div class="field-label">${f.label}</div>
        <div class="field-value">${inner}
          <div style="margin-top:4px"><button class="link-btn" data-act="edit-field" data-field="${f.key}">＋ 填写/修改</button></div>
        </div>
      </div>`;
    }).join('');
    return `<article class="char-card" data-id="${c.id}">
      <div class="ops">
        <button class="mini-btn" data-act="edit-name">改名</button>
        <button class="mini-btn" data-act="del">删除</button>
      </div>
      <h3>${esc(c.name)}</h3>
      <div class="char-role">${esc(role)}</div>
      <div style="margin-top:8px">${fields}</div>
    </article>`;
  }

  function editName(id) {
    const c = state.characters.find((x) => x.id === id);
    if (!c) return;
    openModal(
      `<h3>修改人物姓名</h3>
       <div class="field-row"><label>姓名</label><input id="f-name" value="${esc(c.name)}" /></div>
       <div class="modal-actions"><button class="btn btn-ghost" data-act="cancel">取消</button><button class="btn btn-primary" data-act="ok">保存</button></div>`,
      (root) => {
        root.querySelector('[data-act="cancel"]').onclick = closeModal;
        root.querySelector('[data-act="ok"]').onclick = async () => {
          const name = root.querySelector('#f-name').value.trim();
          if (!name) return toast('姓名不能为空');
          await api('PUT', `/api/novels/${state.novel.id}/characters/${id}`, { name });
          closeModal(); toast('已保存'); loadCharacters();
        };
      }
    );
  }

  function editField(id, fieldKey) {
    const c = state.characters.find((x) => x.id === id);
    if (!c) return;
    const meta = CHAR_FIELDS.find((f) => f.key === fieldKey);
    openModal(
      `<h3>${esc(c.name)} · ${meta.label}</h3>
       <p class="hint" style="margin:0 0 8px">一行一条，可一次填写多条；保存后会补充进档案，不会覆盖其他字段。</p>
       <div class="field-row"><textarea id="f-val" rows="6">${esc(c[fieldKey] || '')}</textarea></div>
       <div class="modal-actions"><button class="btn btn-ghost" data-act="cancel">取消</button><button class="btn btn-primary" data-act="ok">保存</button></div>`,
      (root) => {
        root.querySelector('[data-act="cancel"]').onclick = closeModal;
        root.querySelector('[data-act="ok"]').onclick = async () => {
          const v = root.querySelector('#f-val').value;
          await api('PUT', `/api/novels/${state.novel.id}/characters/${id}`, { [fieldKey]: v });
          closeModal(); toast('已保存'); loadCharacters();
        };
      }
    );
  }

  async function deleteLine(id, fieldKey, index) {
    const c = state.characters.find((x) => x.id === id);
    if (!c) return;
    const vals = lines(c[fieldKey]);
    vals.splice(index, 1);
    await api('PUT', `/api/novels/${state.novel.id}/characters/${id}`, { [fieldKey]: vals.join('\n') });
    loadCharacters();
  }

  // 新建人物入口
  function newCharacterModal() {
    openModal(
      `<h3>新建人物</h3>
       <p class="hint" style="margin:0 0 6px"><b>方式一 · 输入一句话，AI 自动建档（推荐）</b></p>
       <div class="field-row">
         <textarea id="nc-text" rows="3" placeholder="例如：男主角叫宪法，生日是1982年12月4日。&#10;没提到的信息会自动留空，以后随时可以补充。"></textarea>
       </div>
       <div class="modal-actions" style="margin-bottom:14px">
         <button class="btn btn-primary" data-act="ai">AI 识别并建档</button>
       </div>
       <div style="border-top:1px dashed var(--line);padding-top:12px">
         <p class="hint" style="margin:0 0 6px"><b>方式二 · 先建一份空白档案</b></p>
         <div class="field-row"><input id="nc-name" placeholder="人物姓名，如：宪法" /></div>
         <div class="modal-actions">
           <button class="btn btn-ghost" data-act="cancel">取消</button>
           <button class="btn" data-act="blank">创建空白档案</button>
         </div>
       </div>`,
      (root) => {
        root.querySelector('[data-act="cancel"]').onclick = closeModal;
        root.querySelector('[data-act="ai"]').onclick = async () => {
          const text = root.querySelector('#nc-text').value.trim();
          if (!text) return toast('请先写一句人物设定');
          closeModal();
          $('#char-input').value = text;
          $('#char-input').scrollIntoView({ behavior: 'smooth', block: 'center' });
          await parseCharacter();
        };
        root.querySelector('[data-act="blank"]').onclick = async () => {
          const name = root.querySelector('#nc-name').value.trim();
          if (!name) return toast('请填写人物姓名');
          const c = await api('POST', `/api/novels/${state.novel.id}/characters`, { name });
          closeModal();
          toast(`已创建空白档案「${c.name}」，可随时补充信息`);
          loadCharacters();
        };
      }
    );
  }

  // 自然语言识别
  async function parseCharacter() {
    const input = $('#char-input');
    const text = input.value.trim();
    if (!text) return toast('请先输入人物设定');
    const r = await api('POST', `/api/novels/${state.novel.id}/characters/parse`, { text });
    state.pendingParse = r;
    renderParseResult();
  }

  function renderParseResult() {
    const r = state.pendingParse;
    if (!r) { $('#char-parse-result').innerHTML = ''; return; }
    const targetHtml =
      r.action === 'update'
        ? `<div class="hint">补充到已有人物：<b style="color:var(--accent);font-family:var(--serif)">${esc(r.name)}</b></div>`
        : r.action === 'create'
        ? `<div class="hint">新建人物：<b style="color:var(--accent);font-family:var(--serif)">${esc(r.name)}</b></div>`
        : `<div class="hint">${esc(r.hint)}</div>`;

    const candidates = r.candidates && r.candidates.length
      ? `<div class="candidate-list">${r.candidates.map(
          (c, i) => `<div class="candidate" data-idx="${i}">
            <input type="radio" name="cand" ${i === 0 ? 'checked' : ''} />
            <span><b>${esc(c.name)}</b> <span class="hint">${esc(lines(c.role)[0] || '')}</span></span>
          </div>`
        ).join('')}</div>`
      : '';

    const fieldsHtml = CHAR_FIELDS.map((f) => {
      const v = (r.fields[f.key] || []).join('\n');
      return `<div><label>${f.label}</label><textarea rows="2" data-f="${f.key}" placeholder="留空表示未填写">${esc(v)}</textarea></div>`;
    }).join('');

    $('#char-parse-result').innerHTML = `<div class="parse-card">
      <h4>识别结果</h4>
      ${targetHtml}
      ${candidates}
      <div class="parse-fields">${fieldsHtml}</div>
      <div class="hint" style="margin-bottom:8px">可直接在上面修改识别结果；不确定的信息删掉即可，不会自动编造。</div>
      <div class="parse-actions">
        <button class="btn btn-primary" data-act="confirm">确认归档</button>
        <button class="btn btn-ghost" data-act="cancel">取消</button>
      </div>
    </div>`;

    const box = $('#char-parse-result');
    box.querySelector('[data-act="cancel"]').onclick = () => {
      state.pendingParse = null;
      renderParseResult();
    };
    box.querySelector('[data-act="confirm"]').onclick = async () => {
      const fields = {};
      box.querySelectorAll('[data-f]').forEach((t) => {
        const v = t.value.trim();
        if (v) fields[t.dataset.f] = v;
      });
      let characterId = r.characterId;
      if (!characterId) {
        const sel = box.querySelector('input[name="cand"]:checked');
        if (sel) {
          const idx = Number(sel.closest('.candidate').dataset.idx);
          characterId = r.candidates[idx].id;
        }
      }
      if (!characterId && !r.name) return toast('请先选择这条设定属于哪个人物');
      const res = await api('POST', `/api/novels/${state.novel.id}/characters/apply`, {
        characterId,
        name: r.name,
        fields,
      });
      state.pendingParse = null;
      renderParseResult();
      $('#char-input').value = '';
      toast(res.mode === 'create' ? `已创建人物「${res.character.name}」` : `已补充「${res.character.name}」的档案`);
      loadCharacters();
    };
    box.querySelectorAll('.candidate').forEach((c) => {
      c.onclick = () => { c.querySelector('input').checked = true; };
    });
  }

  // ---------------------------------------------------------------- 情节 / 灵感
  function entryHtml(item, idx, kind) {
    return `<article class="entry" data-id="${item.id}" data-kind="${kind}">
      <div class="no"><span>第 ${idx + 1} 条</span><span class="time">${esc(fmtTime(item.created_at))}</span></div>
      <div class="text">${esc(item.content)}</div>
      <div class="ops">
        <button class="link-btn" data-act="append">补充</button>
        <button class="link-btn" data-act="edit">修改</button>
        <button class="link-btn danger" data-act="del">删除</button>
      </div>
    </article>`;
  }

  function bindEntries(selector, kind, reload) {
    $$(selector + ' .entry').forEach((el) => {
      const id = Number(el.dataset.id);
      el.querySelectorAll('[data-act]').forEach((btn) => {
        btn.onclick = async () => {
          const act = btn.dataset.act;
          const item = state.ideas.find((x) => x.id === id);
          if (!item) return;
          if (act === 'del') {
            return confirmModal('删除记录', '删除后无法恢复，确定删除这条记录吗？', '删除', async () => {
              await api('DELETE', `/api/novels/${state.novel.id}/${kind}/${id}`);
              toast('已删除'); reload();
            }, true);
          }
          if (act === 'edit') {
            return openModal(
              `<h3>修改记录</h3><div class="field-row"><textarea id="f-c" rows="6">${esc(item.content)}</textarea></div>
               <div class="modal-actions"><button class="btn btn-ghost" data-act="cancel">取消</button><button class="btn btn-primary" data-act="ok">保存</button></div>`,
              (root) => {
                root.querySelector('[data-act="cancel"]').onclick = closeModal;
                root.querySelector('[data-act="ok"]').onclick = async () => {
                  const v = root.querySelector('#f-c').value.trim();
                  if (!v) return toast('内容不能为空');
                  await api('PUT', `/api/novels/${state.novel.id}/${kind}/${id}`, { content: v });
                  closeModal(); toast('已保存'); reload();
                };
              }
            );
          }
          if (act === 'append') {
            return openModal(
              `<h3>补充这条记录</h3><p class="hint" style="margin:0 0 8px">新内容会追加在原记录后面，原文不会被改动。</p>
               <div class="field-row"><textarea id="f-c" rows="4" placeholder="继续写下新的想法"></textarea></div>
               <div class="modal-actions"><button class="btn btn-ghost" data-act="cancel">取消</button><button class="btn btn-primary" data-act="ok">追加</button></div>`,
              (root) => {
                root.querySelector('[data-act="cancel"]').onclick = closeModal;
                root.querySelector('[data-act="ok"]').onclick = async () => {
                  const v = root.querySelector('#f-c').value.trim();
                  if (!v) return toast('请输入要补充的内容');
                  await api('PUT', `/api/novels/${state.novel.id}/${kind}/${id}`, {
                    content: item.content + '\n' + v,
                  });
                  closeModal(); toast('已补充'); reload();
                };
              }
            );
          }
        };
      });
    });
  }

  function renderIdeas() {
    $('#count-ideas').textContent = state.ideas.length ? `${state.ideas.length} 条` : '';
    $('#idea-empty').style.display = state.ideas.length ? 'none' : 'block';
    $('#idea-list').innerHTML = state.ideas.map((p, i) => entryHtml(p, i, 'ideas')).join('');
    bindEntries('#idea-list', 'ideas', loadIdeas);
  }

  async function addEntry(kind, inputSel, reload) {
    const el = $(inputSel);
    const content = el.value.trim();
    if (!content) return toast('请输入内容');
    await api('POST', `/api/novels/${state.novel.id}/${kind}`, { content });
    el.value = '';
    toast('灵感已记下');
    reload();
  }

  // ---------------------------------------------------------------- 一键整理（灵感 / 人物）
  async function organize(kind) {
    const list = kind === 'characters' ? state.characters : state.ideas;
    if (!list.length) return toast(kind === 'characters' ? '还没有人物档案' : '灵感收集箱还没有记录');
    const btn = kind === 'characters' ? $('#btn-organize-characters') : $('#btn-organize');
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = '整理中…';
    try {
      const doc = await api(
        'POST',
        kind === 'characters'
          ? `/api/novels/${state.novel.id}/characters/organize`
          : `/api/novels/${state.novel.id}/organize`
      );
      openDoc(doc);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  function openDoc(doc) {
    state.doc = doc;
    state.docEditing = false;
    $('#view-novel').style.display = 'none';
    $('#view-doc').style.display = 'block';
    $('#doc-title').textContent = doc.title;
    $('#doc-meta').textContent =
      doc.type === 'characters'
        ? `共 ${doc.source_count} 位人物`
        : `共 ${doc.source_count} 条灵感`;
    $('#doc-content').value = doc.content;
    $('#doc-content').readOnly = true;
    $('#btn-save-doc').style.display = 'none';
    $('#btn-cancel-edit').style.display = 'none';
    window.scrollTo(0, 0);
  }

  function startEditDoc() {
    state.docEditing = true;
    $('#doc-content').readOnly = false;
    $('#doc-content').focus();
    $('#btn-save-doc').style.display = '';
    $('#btn-cancel-edit').style.display = '';
  }
  function cancelEditDoc() {
    state.docEditing = false;
    $('#doc-content').value = state.doc.content;
    $('#doc-content').readOnly = true;
    $('#btn-save-doc').style.display = 'none';
    $('#btn-cancel-edit').style.display = 'none';
  }
  async function saveDoc() {
    const d = await api('PUT', `/api/novels/${state.novel.id}/documents/${state.doc.id}`, {
      content: $('#doc-content').value,
    });
    state.doc = d;
    cancelEditDoc();
    toast('文档已保存');
  }

  async function copyDoc() {
    const text = $('#doc-content').value;
    try {
      await navigator.clipboard.writeText(text);
      toast('全文已复制到剪贴板');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('全文已复制'); }
      catch (e2) { toast('复制失败，请手动选择文本'); }
      document.body.removeChild(ta);
    }
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function safeName(s) { return String(s).replace(/[\\/:*?"<>|]/g, '_'); }

  function exportTxt() {
    const isChar = state.doc && state.doc.type === 'characters';
    const name = `${safeName(state.novel.title)}-${isChar ? '人物档案' : '灵感汇总'}.txt`;
    download(name, $('#doc-content').value.replace(/\n/g, '\r\n'), 'text/plain;charset=utf-8');
    toast('已导出 TXT');
  }

  function exportWord() {
    const text = $('#doc-content').value;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8" />
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>
 body { font-family: "宋体", "SimSun", serif; font-size: 12pt; line-height: 1.8; }
 p { margin: 0 0 8pt 0; white-space: pre-wrap; }
</style></head><body>
${text.split('\n').map((l) => `<p>${esc(l)}</p>`).join('\n')}
</body></html>`;
    download(`${safeName(state.novel.title)}-${state.doc && state.doc.type === 'characters' ? '人物档案' : '灵感汇总'}.doc`, html, 'application/msword;charset=utf-8');
    toast('已导出 Word');
  }

  async function regenerate() {
    if (!state.doc) return;
    const d = await api('POST', `/api/novels/${state.novel.id}/documents/${state.doc.id}/regenerate`);
    openDoc(d);
    toast(
      d.type === 'characters'
        ? `已按最新的 ${d.source_count} 位人物重新生成`
        : `已按最新的 ${d.source_count} 条灵感重新生成`
    );
  }

  // ---------------------------------------------------------------- 事件绑定
  function bind() {
    $('#btn-new-novel').onclick = () => novelFormModal(null);
    $('#btn-new-novel-2').onclick = () => novelFormModal(null);

    $('#btn-back').onclick = () => {
      $('#view-novel').style.display = 'none';
      $('#view-home').style.display = 'block';
      window.scrollTo(0, 0);
      loadHome();
    };

    $('#btn-novel-menu').onclick = () => {
      const n = state.novel;
      openModal(
        `<h3>${esc(n.title)}</h3>
         <div class="modal-actions" style="flex-direction:column;align-items:stretch">
           <button class="btn" data-act="edit">编辑小说信息</button>
           <button class="btn" data-act="archive">${n.archived ? '取消归档' : '归档这本小说'}</button>
           <button class="btn btn-danger" data-act="delete">删除这本小说</button>
           <button class="btn btn-ghost" data-act="close">关闭</button>
         </div>`,
        (root) => {
          root.querySelector('[data-act="edit"]').onclick = () => { closeModal(); novelFormModal(state.novel); };
          root.querySelector('[data-act="archive"]').onclick = async () => {
            await api('POST', `/api/novels/${state.novel.id}/archive`, { archived: !state.novel.archived });
            state.novel = await api('GET', `/api/novels/${state.novel.id}`);
            closeModal(); toast(state.novel.archived ? '已归档' : '已恢复'); loadHome();
          };
          root.querySelector('[data-act="delete"]').onclick = () => {
            closeModal();
            confirmModal('删除小说', '将同时删除这本小说的全部人物、情节与灵感记录，且无法恢复。', '确认删除', async () => {
              await api('DELETE', `/api/novels/${state.novel.id}`);
              toast('已删除');
              $('#view-novel').style.display = 'none';
              $('#view-home').style.display = 'block';
              loadHome();
            }, true);
          };
          root.querySelector('[data-act="close"]').onclick = closeModal;
        }
      );
    };

    $$('#tabs .tab').forEach((t) => {
      t.onclick = () => {
        $$('#tabs .tab').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
        $$('.panel').forEach((p) => p.classList.remove('active'));
        $(`#panel-${t.dataset.tab}`).classList.add('active');
        state.tab = t.dataset.tab;
      };
    });

    $('#btn-char-parse').onclick = parseCharacter;
    $('#btn-new-character').onclick = newCharacterModal;
    $('#char-input').addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') parseCharacter();
    });
    $('#btn-idea-add').onclick = () => addEntry('ideas', '#idea-input', loadIdeas);
    $('#idea-input').addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') addEntry('ideas', '#idea-input', loadIdeas);
    });

    $('#btn-organize').onclick = () => organize('ideas');
    $('#btn-organize-characters').onclick = () => organize('characters');
    $('#fab').onclick = () => {
      const sel = state.tab === 'characters' ? '#char-input' : '#idea-input';
      $(sel).scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => $(sel).focus(), 300);
    };

    $('#btn-doc-back').onclick = () => {
      $('#view-doc').style.display = 'none';
      $('#view-novel').style.display = 'block';
      loadIdeas();
    };
    $('#btn-copy-doc').onclick = copyDoc;
    $('#btn-edit-doc').onclick = startEditDoc;
    $('#btn-save-doc').onclick = saveDoc;
    $('#btn-cancel-edit').onclick = cancelEditDoc;
    $('#btn-export-txt').onclick = exportTxt;
    $('#btn-export-word').onclick = exportWord;
    $('#btn-regenerate').onclick = regenerate;
    $('#btn-doc-refresh').onclick = regenerate;
  }

  // ---------------------------------------------------------------- 首页访问信息
  async function loadInfo() {
    let info;
    try {
      info = await api('GET', '/api/info');
    } catch (e) {
      info = { lanUrl: null, backup: { count: 0 } };
    }
    state.info = info;
    const bk = info.backup || { count: 0 };
    $('#foot-tip').textContent = info.lanUrl
      ? `手机访问：${info.lanUrl}（与本机同一 WiFi 即可打开，可添加到手机桌面）`
      : '未检测到局域网地址，手机请在同一 WiFi 下用本机 IP 访问';
    $('#btn-copy-url').onclick = () => {
      const url = info.lanUrl || info.localUrl || location.origin;
      copyText(url, `已复制：${url}`);
    };
    $('#foot-backup-note') &&
      ($('#foot-backup-note').textContent = `已自动备份 ${bk.count} 份（保存在 data/backups）`);
  }

  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMsg || '已复制');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast(okMsg || '已复制'); }
      catch (e2) { toast('复制失败，请手动记录：' + text); }
      document.body.removeChild(ta);
    }
  }

  // ---------------------------------------------------------------- 启动
  bind();
  loadHome();
  loadInfo();
})();
