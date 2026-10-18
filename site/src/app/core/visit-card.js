/* Visit card: a 1080px PNG with what to bring and where to go, drawn on a canvas. */
export function makeCard(h) {
  var t = h.t, L = h.L, lang = h.lang, fmtDate = h.fmtDate, cityName = h.cityName, peso = h.peso, SITE_HOST = h.siteHost;
  function wrapText(ctx, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], line = '';
    words.forEach(function (w) {
      var test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }

  function drawCard(list, office, name, p) {
    var W = 1080, PAD = 72, CW = W - PAD * 2;
    var C = { bg: '#ffffff', ink: '#16251f', muted: '#4f5e57', accent: '#0b5d4e', line: '#d3dcd6', sun: '#f0b429', sunInk: '#2b1d00', soft: '#e0eee8' };
    var body = '"Atkinson Hyperlegible", system-ui, sans-serif', disp = '"Bricolage Grotesque", "Atkinson Hyperlegible", system-ui, sans-serif';
    var fontsReady = (document.fonts && document.fonts.load) ? Promise.all([document.fonts.load('700 40px "Atkinson Hyperlegible"'), document.fonts.load('700 40px "Bricolage Grotesque"')]).catch(function () {}) : Promise.resolve();
    return fontsReady.then(function () {
      var c = document.createElement('canvas'); var ctx = c.getContext('2d');
      // Gather content
      var reqs = []; var seen = {};
      list.forEach(function (b) { b.requirements.forEach(function (r) { var s = L(r); if (!seen[s]) { seen[s] = 1; reqs.push(s); } }); });
      var checked = list.map(function (b) { return b.verification.checked_on; }).sort()[0];
      // Measure pass
      function layout(draw) {
        var y = 0;
        // header band
        if (draw) { ctx.fillStyle = C.accent; ctx.fillRect(0, 0, W, 190); ctx.fillStyle = '#ffffff'; ctx.font = '800 64px ' + disp; ctx.fillText('Benepisyo.', PAD, 110); ctx.font = '700 30px ' + body; ctx.fillText(t('plan_title').toUpperCase() + (office && office.city ? ' · ' + cityName(office.city).toUpperCase() : ''), PAD, 158); }
        y = 190;
        // perforation
        if (draw) { ctx.strokeStyle = C.line; ctx.setLineDash([14, 12]); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(PAD / 2, y + 30); ctx.lineTo(W - PAD / 2, y + 30); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = C.bg; }
        y += 80;
        if (name) { ctx.font = '700 40px ' + body; if (draw) { ctx.fillStyle = C.muted; ctx.fillText((lang === 'en' ? 'For ' : 'Para kay ') + name, PAD, y); } y += 64; }
        list.forEach(function (b) {
          ctx.font = '700 52px ' + disp;
          wrapText(ctx, L(b.title), CW).forEach(function (ln) { if (draw) { ctx.fillStyle = C.ink; ctx.fillText(ln, PAD, y); } y += 62; });
          ctx.font = '700 44px ' + body;
          var amt = b.amount_php ? peso(b.amount_php) + ' · ' + L(b.frequency) : (b.value ? L(b.value) : '');
          wrapText(ctx, amt, CW).forEach(function (ln) { if (draw) { ctx.fillStyle = C.accent; ctx.fillText(ln, PAD, y); } y += 54; });
          y += 24;
        });
        y += 16;
        ctx.font = '700 32px ' + body; if (draw) { ctx.fillStyle = C.muted; ctx.fillText(t('card_bring'), PAD, y); } y += 56;
        reqs.forEach(function (r) {
          ctx.font = '400 38px ' + body;
          var lines = wrapText(ctx, r, CW - 70);
          if (draw) { ctx.strokeStyle = C.ink; ctx.lineWidth = 4; ctx.strokeRect(PAD, y - 34, 40, 40); ctx.fillStyle = C.ink; }
          lines.forEach(function (ln) { if (draw) ctx.fillText(ln, PAD + 66, y); y += 50; });
          y += 14;
        });
        y += 24;
        ctx.font = '700 32px ' + body; if (draw) { ctx.fillStyle = C.muted; ctx.fillText(t('card_where'), PAD, y); } y += 56;
        ctx.font = '700 40px ' + body;
        wrapText(ctx, L(office.name), CW).forEach(function (ln) { if (draw) { ctx.fillStyle = C.ink; ctx.fillText(ln, PAD, y); } y += 52; });
        ctx.font = '400 36px ' + body;
        wrapText(ctx, L(office.place), CW).forEach(function (ln) { if (draw) { ctx.fillStyle = C.muted; ctx.fillText(ln, PAD, y); } y += 48; });
        y += 40;
        // free stamp
        if (draw) {
          ctx.save(); ctx.translate(PAD, y); ctx.rotate(-0.03);
          ctx.font = '800 46px ' + body; var sw = ctx.measureText(t('card_free')).width + 56;
          ctx.fillStyle = C.sun; ctx.fillRect(0, 0, sw, 84); ctx.strokeStyle = C.sunInk; ctx.lineWidth = 5; ctx.strokeRect(0, 0, sw, 84);
          ctx.fillStyle = C.sunInk; ctx.fillText(t('card_free'), 28, 58); ctx.restore();
        }
        y += 140;
        if (draw) { ctx.fillStyle = C.line; ctx.fillRect(PAD, y - 40, CW, 3); }
        ctx.font = '400 30px ' + body;
        var foot = t('checked', { date: fmtDate(checked) }) + ' · ' + t('card_confirm');
        wrapText(ctx, foot, CW).forEach(function (ln) { if (draw) { ctx.fillStyle = C.muted; ctx.fillText(ln, PAD, y); } y += 42; });
        if (draw) { ctx.fillStyle = C.accent; ctx.font = '700 30px ' + body; ctx.fillText(SITE_HOST, PAD, y + 8); }
        y += 60;
        return y;
      }
      c.width = W; c.height = 400; ctx.textBaseline = 'alphabetic';
      var H = layout(false);
      c.width = W; c.height = Math.ceil(H);
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, c.height);
      layout(true);
      return new Promise(function (resolve) { c.toBlob(function (bl) { resolve(bl); }, 'image/png'); });
    });
  }

  return drawCard;
}
