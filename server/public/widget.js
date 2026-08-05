/**
 * Kasupport Widget — burbuja de soporte embebible.
 * Uso en cualquier página web:
 *   <script src="http://localhost:4100/widget.js" async></script>
 * Opcional: window.KASUPPORT = { title: 'Ayuda', color: '#4f46e5' }
 */
(function () {
  if (window.__kasupportLoaded) return;
  window.__kasupportLoaded = true;

  var scriptEl = document.currentScript || (function () {
    var s = document.getElementsByTagName('script');
    return s[s.length - 1];
  })();
  var SERVER = (scriptEl && scriptEl.src ? new URL(scriptEl.src).origin : 'http://localhost:4100');
  var CFG = window.KASUPPORT || {};
  var COLOR = CFG.color || '#4f46e5';
  var TITLE = CFG.title || 'Soporte';

  var session = null; // { token, channelId, visitor, department }
  try { session = JSON.parse(localStorage.getItem('kasupport_session') || 'null'); } catch (e) {}
  var socket = null;
  var open = false;

  /* ---------------------------------- estilos ---------------------------------- */
  var css = `
  #ks-bubble{position:fixed;bottom:24px;right:24px;width:60px;height:60px;border-radius:50%;
    background:${COLOR};color:#fff;border:none;cursor:pointer;z-index:999998;
    box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;
    transition:transform .15s}
  #ks-bubble:hover{transform:scale(1.08)}
  #ks-panel{position:fixed;bottom:96px;right:24px;width:360px;max-width:calc(100vw - 32px);
    height:520px;max-height:calc(100vh - 130px);background:#fff;border-radius:16px;z-index:999999;
    box-shadow:0 12px 40px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden;
    font-family:-apple-system,'Segoe UI',Roboto,sans-serif}
  #ks-panel.ks-open{display:flex}
  .ks-header{background:${COLOR};color:#fff;padding:16px 18px}
  .ks-header h3{margin:0;font-size:16px;font-weight:600}
  .ks-header p{margin:4px 0 0;font-size:12px;opacity:.85}
  .ks-body{flex:1;overflow-y:auto;padding:16px;background:#f7f7f9}
  .ks-form label{display:block;font-size:12px;font-weight:600;color:#444;margin:10px 0 4px}
  .ks-form input,.ks-form select{width:100%;padding:9px 10px;border:1px solid #ddd;border-radius:8px;
    font-size:14px;box-sizing:border-box}
  .ks-form button{width:100%;margin-top:16px;padding:11px;background:${COLOR};color:#fff;border:none;
    border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}
  .ks-msg{max-width:80%;padding:9px 12px;border-radius:14px;margin-bottom:8px;font-size:14px;
    line-height:1.4;word-break:break-word}
  .ks-msg.ks-visitor{background:${COLOR};color:#fff;margin-left:auto;border-bottom-right-radius:4px}
  .ks-msg.ks-agent{background:#fff;color:#222;border:1px solid #e5e5ea;border-bottom-left-radius:4px}
  .ks-msg small{display:block;font-size:10px;opacity:.65;margin-top:3px}
  .ks-inputbar{display:flex;gap:8px;padding:12px;border-top:1px solid #eee;background:#fff}
  .ks-inputbar input{flex:1;padding:10px;border:1px solid #ddd;border-radius:20px;font-size:14px;outline:none}
  .ks-inputbar button{width:42px;height:42px;border-radius:50%;background:${COLOR};color:#fff;border:none;
    cursor:pointer;font-size:16px}
  .ks-inputbar button.ks-attach{background:transparent;color:#666;font-size:20px}
  .ks-inputbar button.ks-attach:hover{color:${COLOR}}
  .ks-msg img{max-width:100%;border-radius:10px;display:block}
  .ks-uploading{font-size:11px;color:#999;padding:0 12px 6px}
  .ks-typing{font-size:12px;color:#888;font-style:italic;padding:4px 16px;background:#f7f7f9;display:none}
  .ks-note{font-size:11px;color:#999;text-align:center;padding:6px}
  `;
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ----------------------------------- markup ----------------------------------- */
  var bubble = document.createElement('button');
  bubble.id = 'ks-bubble';
  bubble.setAttribute('aria-label', 'Abrir chat de soporte');
  bubble.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  var panel = document.createElement('div');
  panel.id = 'ks-panel';
  document.body.appendChild(bubble);
  document.body.appendChild(panel);

  bubble.onclick = function () {
    open = !open;
    panel.classList.toggle('ks-open', open);
    if (open) render();
  };

  function render() {
    if (session && session.token) renderChat();
    else renderForm();
  }

  /* ------------------------------ formulario inicial ----------------------------- */
  function renderForm() {
    panel.innerHTML =
      '<div class="ks-header"><h3>' + TITLE + '</h3><p>Completa tus datos y te atendemos enseguida</p></div>' +
      '<div class="ks-body"><div class="ks-form">' +
      '<label>Nombre *</label><input id="ks-name" type="text" placeholder="Tu nombre">' +
      '<label>Email</label><input id="ks-email" type="email" placeholder="tu@email.com">' +
      '<label>Teléfono</label><input id="ks-phone" type="tel" placeholder="+52 ...">' +
      '<label>Departamento *</label><select id="ks-dept"><option value="">Cargando...</option></select>' +
      '<button id="ks-start">Iniciar chat</button>' +
      '</div></div>';

    fetch(SERVER + '/api/departments')
      .then(function (r) { return r.json(); })
      .then(function (depts) {
        var sel = document.getElementById('ks-dept');
        sel.innerHTML = '<option value="">Selecciona un departamento</option>';
        depts.forEach(function (d) {
          var o = document.createElement('option');
          o.value = d.id; o.textContent = d.name;
          sel.appendChild(o);
        });
      });

    document.getElementById('ks-start').onclick = function () {
      var name = document.getElementById('ks-name').value.trim();
      var email = document.getElementById('ks-email').value.trim();
      var phone = document.getElementById('ks-phone').value.trim();
      var departmentId = document.getElementById('ks-dept').value;
      if (!name || !departmentId) { alert('Nombre y departamento son obligatorios'); return; }
      fetch(SERVER + '/api/widget/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, email: email, phone: phone, departmentId: Number(departmentId) }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) { alert(data.error); return; }
          session = data;
          localStorage.setItem('kasupport_session', JSON.stringify(data));
          renderChat();
        });
    };
  }

  /* ------------------------------------ chat ------------------------------------ */
  function renderChat() {
    panel.innerHTML =
      '<div class="ks-header"><h3>' + TITLE + ' · ' + (session.department ? session.department.name : '') + '</h3>' +
      '<p>Hola ' + session.visitor.name + ', escribe tu mensaje</p></div>' +
      '<div class="ks-body" id="ks-messages"></div>' +
      '<div class="ks-typing" id="ks-typing"></div>' +
      '<div class="ks-inputbar">' +
      '<input id="ks-file" type="file" accept="image/*" style="display:none">' +
      '<button id="ks-attach" class="ks-attach" title="Adjuntar imagen">📎</button>' +
      '<input id="ks-text" type="text" placeholder="Escribe un mensaje...">' +
      '<button id="ks-send">➤</button></div>' +
      '<div class="ks-note">Kasupport · Chat en vivo</div>';

    loadMessages();
    connectSocket();

    var input = document.getElementById('ks-text');
    function send() {
      var body = input.value.trim();
      if (!body) return;
      input.value = '';
      fetch(SERVER + '/api/widget/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: session.token, body: body }),
      });
    }
    document.getElementById('ks-send').onclick = send;
    input.onkeydown = function (e) { if (e.key === 'Enter') send(); };

    // Avisar que el visitante está escribiendo (máx 1 aviso cada 2 s)
    var lastTypingSent = 0;
    input.oninput = function () {
      if (!socket) return;
      var now = Date.now();
      if (now - lastTypingSent < 2000) return;
      lastTypingSent = now;
      socket.emit('typing', { channelId: session.channelId, token: session.token });
    };

    // Adjuntar imagen
    var fileInput = document.getElementById('ks-file');
    document.getElementById('ks-attach').onclick = function () { fileInput.click(); };
    fileInput.onchange = function () {
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      if (!file.type || file.type.indexOf('image/') !== 0) { alert('Solo se pueden adjuntar imágenes'); return; }
      if (file.size > 15 * 1024 * 1024) { alert('La imagen supera 15 MB'); return; }
      var box = document.getElementById('ks-messages');
      var note = document.createElement('div');
      note.className = 'ks-uploading';
      note.textContent = 'Subiendo imagen...';
      box && box.appendChild(note);
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || '');
        var base64 = result.indexOf(',') >= 0 ? result.split(',')[1] : result;
        fetch(SERVER + '/api/widget/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: session.token, name: file.name, mime: file.type, data: base64 }),
        })
          .then(function (r) { return r.json(); })
          .then(function (up) {
            note.remove();
            if (up.error) { alert(up.error); return; }
            return fetch(SERVER + '/api/widget/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: session.token, body: JSON.stringify(up), kind: 'image' }),
            });
          })
          .catch(function () { note.remove(); });
      };
      reader.readAsDataURL(file);
    };
  }

  function renderContent(m) {
    if (m.kind === 'image' || m.kind === 'file') {
      try {
        var f = JSON.parse(m.body);
        if (f && f.url) {
          if (m.kind === 'image') {
            return '<a href="' + SERVER + f.url + '" target="_blank" rel="noopener">' +
              '<img src="' + SERVER + f.url + '" alt="' + escapeHtml(f.name) + '"></a>';
          }
          return '<a href="' + SERVER + f.url + '" target="_blank" rel="noopener">📄 ' +
            escapeHtml(f.name) + '</a>';
        }
      } catch (e) {}
      return '[archivo]';
    }
    if (m.kind === 'sticker') {
      var src = m.body.indexOf('/') === 0 ? SERVER + m.body : SERVER + '/stickers/' + m.body + '.svg';
      return '<img src="' + src + '" alt="sticker" style="width:80px;height:80px">';
    }
    return escapeHtml(m.body);
  }

  function appendMessage(m) {
    var box = document.getElementById('ks-messages');
    if (!box) return;
    if (box.querySelector('[data-id="' + m.id + '"]')) return;
    var div = document.createElement('div');
    div.className = 'ks-msg ' + (m.author_type === 'visitor' ? 'ks-visitor' : 'ks-agent');
    div.setAttribute('data-id', m.id);
    var time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = renderContent(m) + '<small>' + escapeHtml(m.author_name) + ' · ' + time + '</small>';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function loadMessages() {
    fetch(SERVER + '/api/widget/messages?token=' + encodeURIComponent(session.token))
      .then(function (r) { return r.json(); })
      .then(function (data) { (data.messages || []).forEach(appendMessage); });
  }

  function connectSocket() {
    if (socket) return;
    var s = document.createElement('script');
    s.src = SERVER + '/socket.io/socket.io.js';
    s.onload = function () {
      socket = window.io(SERVER, { auth: { widgetToken: session.token } });
      socket.emit('channel:join', { channelId: session.channelId, token: session.token });
      socket.on('message:new', function (m) {
        if (m.channel_id === session.channelId) appendMessage(m);
      });
      // Mostrar cuando un agente está escribiendo
      var typingTimer = null;
      socket.on('typing', function (p) {
        if (!p || p.channel_id !== session.channelId || p.author_type !== 'agent') return;
        var el = document.getElementById('ks-typing');
        if (!el) return;
        el.textContent = (p.name || 'El agente') + ' está escribiendo…';
        el.style.display = 'block';
        clearTimeout(typingTimer);
        typingTimer = setTimeout(function () { el.style.display = 'none'; }, 3500);
      });
    };
    document.head.appendChild(s);
  }

  function escapeHtml(t) {
    var d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML;
  }
})();
