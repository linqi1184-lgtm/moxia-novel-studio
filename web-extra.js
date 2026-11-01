/* 墨匣 · 手机版增强：备份导出/导入、添加到桌面引导、底部说明 */
(function () {
  'use strict';

  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) { alert(msg); return; }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(window.__mxT);
    window.__mxT = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  function download(name, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  function stamp() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  // ---------------------------------------------------------- 底部说明
  function renderFoot() {
    var foot = document.getElementById('home-foot');
    if (!foot) return;
    var last = window.MoXiaBackup.lastBackup();
    var lastText = last ? '上次备份：' + last.slice(0, 10) : '还没有导出过备份';
    foot.innerHTML =
      '<div class="foot-line install-line" id="install-line">' +
        '<b>把这个链接存到手机桌面</b><br />' +
        '<span id="install-tip">在浏览器菜单里点「添加到主屏幕 / 添加到桌面」，之后点桌面图标就能直接打开，断网也能用。</span>' +
      '</div>' +
      '<div class="foot-actions">' +
        '<button class="chip-btn" id="btn-copy-link">复制本页链接</button>' +
        '<button class="chip-btn" id="btn-install" style="display:none">安装到桌面</button>' +
        '<button class="chip-btn" id="btn-export-json">导出备份</button>' +
        '<button class="chip-btn" id="btn-import-json">导入备份</button>' +
      '</div>' +
      '<div class="foot-note">' +
        '数据保存在这台设备的浏览器里（' + lastText + '），不会过期失效。' +
        '建议每月点一次「导出备份」保存 JSON 文件，换手机或清理浏览器前先导出。' +
      '</div>';
    document.getElementById('btn-copy-link').onclick = function () {
      var url = location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { toast('链接已复制：' + url); }, fallbackCopy);
      } else fallbackCopy();
      function fallbackCopy() {
        var ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); toast('链接已复制'); } catch (e) { prompt('手动复制这个链接：', url); }
        ta.remove();
      }
    };
    document.getElementById('btn-export-json').onclick = function () {
      download('墨匣备份-' + stamp() + '.json', window.MoXiaBackup.exportJson(), 'application/json;charset=utf-8');
      window.MoXiaBackup.markBackup();
      var c = window.MoXiaBackup.count();
      toast('已导出：' + c.novels + ' 本小说 / ' + c.characters + ' 位人物 / ' + c.ideas + ' 条灵感');
      renderFoot();
    };
    document.getElementById('btn-import-json').onclick = function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = function () {
        var f = input.files && input.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          try {
            window.MoXiaBackup.importJson(String(fr.result));
            toast('导入成功，正在刷新…');
            setTimeout(function () { location.reload(); }, 900);
          } catch (e) {
            toast('导入失败：' + (e.message || '文件格式不对'));
          }
        };
        fr.readAsText(f, 'utf-8');
      };
      input.click();
    };
    if (window.__mxInstallEvent) showInstall();
  }

  // ---------------------------------------------------------- 安装提示
  function showInstall() {
    var btn = document.getElementById('btn-install');
    if (!btn) return;
    btn.style.display = '';
    btn.onclick = function () {
      window.__mxInstallEvent.prompt();
      window.__mxInstallEvent.userChoice.then(function (r) {
        if (r.outcome === 'accepted') toast('已添加到桌面');
        window.__mxInstallEvent = null;
        btn.style.display = 'none';
      });
    };
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    window.__mxInstallEvent = e;
    showInstall();
    var tip = document.getElementById('install-tip');
    if (tip) tip.textContent = '点上面的「安装到桌面」，图标就会出现在手机桌面，之后断网也能打开。';
  });

  // iOS Safari 提示
  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function inStandalone() {
    return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  }

  document.addEventListener('DOMContentLoaded', function () { setTimeout(renderFoot, 300); });

  // 首次访问：显示一次「添加到桌面」引导
  setTimeout(function () {
    if (inStandalone()) return;
    if (localStorage.getItem('moxia.installHinted')) return;
    localStorage.setItem('moxia.installHinted', '1');
    var isI = isIos();
    var root = document.getElementById('modal-root');
    if (!root) return;
    root.innerHTML =
      '<div class="modal-mask"><div class="modal">' +
      '<h3>把它存到手机桌面</h3>' +
      '<p style="font-size:14px;color:var(--ink-2);line-height:1.7;margin:0 0 16px">' +
      (isI
        ? 'iPhone：点底部 <b>分享</b> 按钮 → 选 <b>添加到主屏幕</b> → 右上角「添加」。<br />' +
          'Android：点右上角 <b>⋮</b> 菜单 → 选 <b>添加到主屏幕 / 安装应用</b>。'
        : '点浏览器右上角 <b>⋮</b> 菜单 → 选 <b>添加到主屏幕 / 安装应用</b>。<br />' +
          'iPhone 请点底部 <b>分享</b> 按钮 → <b>添加到主屏幕</b>。') +
      '<br /><br />之后桌面上会出现「墨匣」图标，点它就能直接用，<b>断网也能打开</b>，链接不会过期。</p>' +
      '<div class="modal-actions"><button class="btn btn-primary" data-act="ok">知道了</button></div>' +
      '</div></div>';
    var mask = root.querySelector('.modal-mask');
    mask.addEventListener('click', function (e) { if (e.target === mask) root.innerHTML = ''; });
    root.querySelector('[data-act="ok"]').onclick = function () { root.innerHTML = ''; };
  }, 1500);

  // Service Worker（离线可用）
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function (e) {
        console.warn('sw 注册失败', e);
      });
    });
  }
})();
