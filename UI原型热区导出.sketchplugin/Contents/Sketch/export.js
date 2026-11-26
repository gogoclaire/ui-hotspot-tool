var sketch = require('sketch');
var UI = require('sketch/ui');

var DEVICE_W = 340;
var BACK_ID = '__back__';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function pad2(n) {
  return String(n).length < 2 ? '0' + n : String(n);
}

function parseArtboardName(rawName, fallbackIdx) {
  var base = String(rawName || '').trim();
  var m = base.match(/^(\d{1,3})(?:[\s._\-、]+(.*))?$/);
  if (m) {
    return {
      badge: pad2(parseInt(m[1], 10)),
      name: (m[2] || '').trim() || ('视图 ' + pad2(parseInt(m[1], 10)))
    };
  }
  var b = pad2(fallbackIdx + 1);
  return { badge: b, name: base || ('视图 ' + b) };
}

function getTargetArtboards(doc) {
  var selected = doc.selectedLayers && doc.selectedLayers.layers ? doc.selectedLayers.layers : [];
  var seen = {};
  var artboards = [];

  for (var i = 0; i < selected.length; i++) {
    var layer = selected[i];
    var ab = layer.type === 'Artboard' ? layer : (layer.getParentArtboard ? layer.getParentArtboard() : null);
    if (ab && !seen[ab.id]) {
      seen[ab.id] = true;
      artboards.push(ab);
    }
  }

  if (!artboards.length && doc.selectedPage && doc.selectedPage.layers) {
    var pageLayers = doc.selectedPage.layers;
    for (var j = 0; j < pageLayers.length; j++) {
      if (pageLayers[j].type === 'Artboard') {
        artboards.push(pageLayers[j]);
      }
    }
  }

  // 按画布阅读顺序排列（从上到下分行，每行内从左到右）
  artboards.sort(function (a, b) {
    var dy = a.frame.y - b.frame.y;
    if (Math.abs(dy) > 150) return dy;
    return a.frame.x - b.frame.x;
  });

  return artboards;
}

function collectFlowsInArtboard(container, offsetX, offsetY, scale, artboardIdToCardId, results) {
  var layers = container.layers || [];
  for (var i = 0; i < layers.length; i++) {
    var l = layers[i];
    if (l.hidden) continue;
    var x = offsetX + (l.frame ? l.frame.x : 0);
    var y = offsetY + (l.frame ? l.frame.y : 0);
    var w = l.frame ? l.frame.width : 0;
    var h = l.frame ? l.frame.height : 0;

    if (l.flow && l.flow.targetId) {
      var rawTarget = String(l.flow.targetId);
      var targetId = '';
      if (rawTarget === 'back' || (sketch.Flow && rawTarget === String(sketch.Flow.BackTarget))) {
        targetId = BACK_ID;
      } else if (artboardIdToCardId[rawTarget]) {
        targetId = artboardIdToCardId[rawTarget];
      }

      results.push({
        left: Math.max(0, Math.round(x * scale)),
        top: Math.max(0, Math.round(y * scale)),
        width: Math.max(16, Math.round(w * scale)),
        height: Math.max(14, Math.round(h * scale)),
        targetId: targetId,
        label: ''
      });
    }

    if (l.layers && l.layers.length) {
      collectFlowsInArtboard(l, x, y, scale, artboardIdToCardId, results);
    }
  }
}

function buildHotspotHtml(hs, isPreview) {
  var style = 'left: ' + hs.left + 'px; top: ' + hs.top + 'px; width: ' + hs.width + 'px; height: ' + hs.height + 'px;';
  if (isPreview) {
    return '<div class="hotspot-box" style="' + style + '" data-target-id="' + esc(hs.targetId) + '" data-label=""></div>';
  }
  return (
    '<div class="hotspot-box" style="' + style + '" data-target-id="' + esc(hs.targetId) + '" data-label="">' +
      '<span class="hotspot-tag"></span>' +
      '<div class="hotspot-actions">' +
        '<button type="button" class="hotspot-mini-btn" data-action="hs-edit">目标</button>' +
        '<button type="button" class="hotspot-mini-btn del" data-action="hs-del">×</button>' +
      '</div>' +
      '<span class="hotspot-resize-handle" title="拖动调整大小"></span>' +
    '</div>'
  );
}

function buildCardHtml(card, hotspotsHtml, imgDataUrl, isPreview, devW, devH) {
  var screenHtml =
    '<div class="screen screen-image" data-screen="image">' +
      '<div class="body chat-body img-mode">' +
        (isPreview ? '' : '<div class="body-mode-bar"><button type="button" class="body-mode-chip" data-action="sec-cut">换图</button><button type="button" class="body-mode-chip" data-action="sec-layers">图层</button></div>') +
        '<div class="dom-content">' +
          '<div class="hotspot-layer">' + hotspotsHtml + '</div>' +
          '<img class="chat-body-image" src="' + imgDataUrl + '" alt="设计图" draggable="false" />' +
        '</div>' +
      '</div>' +
    '</div>';

  return (
    '<div class="ov-item" data-card-id="' + esc(card.id) + '" data-template-type="image">' +
      '<div class="ov-label">' +
        (isPreview ? '' : '<span class="drag-handle edit-only" draggable="true" title="拖动调整顺序">⠿</span>') +
        '<span class="ov-badge"' + (isPreview ? '' : ' contenteditable="true" spellcheck="false"') + '>' + esc(card.badge) + '</span>' +
        '<span class="ov-name-editable"' + (isPreview ? '' : ' contenteditable="true" spellcheck="false"') + '>' + esc(card.name) + '</span>' +
        '<div class="view-actions">' +
          (isPreview ? '' :
            '<button type="button" class="view-refresh-btn edit-only" data-action="view-refresh" title="恢复此视图初始状态">↻</button>' +
            '<button type="button" class="view-refresh-btn edit-only" data-action="view-fullimg" title="整屏替换为一张设计图">▣</button>' +
            '<button type="button" class="view-refresh-btn edit-only" data-action="view-dup" title="复制视图">⧉</button>' +
            '<button type="button" class="view-refresh-btn danger edit-only" data-action="view-del" title="删除视图">✕</button>'
          ) +
          '<button type="button" class="view-refresh-btn" data-action="view-demo" title="从此视图开始演示">▶</button>' +
        '</div>' +
      '</div>' +
      '<div class="ov-frame"><div class="device" style="width: ' + devW + 'px; height: ' + devH + 'px;">' + screenHtml + '</div></div>' +
    '</div>'
  );
}

function readTemplateHtml(context) {
  var url = context.plugin.urlForResourceNamed('template.html');
  if (!url) return null;
  var nsStr = NSString.stringWithContentsOfURL_encoding_error(url, NSUTF8StringEncoding, null);
  return nsStr ? String(nsStr) : null;
}

function runExport(context, isPreview) {
  var doc = sketch.getSelectedDocument();
  if (!doc) {
    UI.message('请先打开一个 Sketch 文档');
    return;
  }

  var artboards = getTargetArtboards(doc);
  if (!artboards.length) {
    UI.message('当前页面没有可导出的画板（Artboard）');
    return;
  }

  var template = readTemplateHtml(context);
  if (!template) {
    UI.alert('导出失败', '未找到插件内置模板 template.html');
    return;
  }

  var pageName = (doc.selectedPage && doc.selectedPage.name ? doc.selectedPage.name : '原型').trim();
  var artboardIdToCardId = {};
  var cardsMeta = [];

  for (var i = 0; i < artboards.length; i++) {
    var ab = artboards[i];
    var parsed = parseArtboardName(ab.name, i);
    var cardId = 'sk_' + String(ab.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    artboardIdToCardId[String(ab.id)] = cardId;
    cardsMeta.push({ ab: ab, id: cardId, badge: parsed.badge, name: parsed.name });
  }

  var cardsHtml = [];
  var hotspotCount = 0;

  for (var k = 0; k < cardsMeta.length; k++) {
    var meta = cardsMeta[k];
    var buf = sketch.export(meta.ab, {
      formats: 'png',
      scales: '2',
      output: false
    });
    var base64 = buf ? buf.toString('base64') : '';
    var imgDataUrl = 'data:image/png;base64,' + base64;

    var abW = (meta.ab.frame && meta.ab.frame.width) ? meta.ab.frame.width : 375;
    var abH = (meta.ab.frame && meta.ab.frame.height) ? meta.ab.frame.height : 812;
    var scale = abW <= 600 ? 0.9 : 0.75;
    var devW = Math.max(120, Math.round(abW * scale));
    var devH = Math.max(120, Math.round(abH * scale));
    var flows = [];
    collectFlowsInArtboard(meta.ab, 0, 0, scale, artboardIdToCardId, flows);
    hotspotCount += flows.length;

    var hsHtml = flows.map(function (hs) {
      return buildHotspotHtml(hs, isPreview);
    }).join('');

    cardsHtml.push(buildCardHtml(meta, hsHtml, imgDataUrl, isPreview, devW, devH));
  }

  var html = template;
  html = html.replace('<title>标题名称</title>', '<title>' + esc(pageName) + '</title>');
  html = html.replace(
    '<h1 id="boardTitle" contenteditable="true" spellcheck="false">标题名称</h1>',
    '<h1 id="boardTitle"' + (isPreview ? '' : ' contenteditable="true" spellcheck="false"') + '>' + esc(pageName) + '</h1>'
  );
  html = html.replace(
    '<div class="ov-grid" id="ov"></div>',
    '<div class="ov-grid" id="ov">' + cardsHtml.join('\n') + '</div>'
  );

  if (isPreview) {
    html = html.replace('<body>', '<body class="exported-view is-viewing">');
  }

  var d = new Date();
  var stamp =
    d.getFullYear() +
    pad2(d.getMonth() + 1) +
    pad2(d.getDate()) +
    '_' +
    pad2(d.getHours()) +
    pad2(d.getMinutes()) +
    pad2(d.getSeconds());
  var safeName = pageName.replace(/[\\/:*?"<>|\s]+/g, '_') || '原型';
  var suffix = isPreview ? '演示版' : '可编辑原型';
  var outPath = String(NSHomeDirectory()) + '/Desktop/' + safeName + '_' + suffix + '_' + stamp + '.html';

  NSString.stringWithString(html).writeToFile_atomically_encoding_error(
    outPath,
    true,
    NSUTF8StringEncoding,
    null
  );

  NSWorkspace.sharedWorkspace().openFile(outPath);
  UI.message('已导出 ' + cardsMeta.length + ' 个画板、' + hotspotCount + ' 个热区到桌面并打开');
}

function onExportEditable(context) {
  runExport(context, false);
}

function onExportPreview(context) {
  runExport(context, true);
}
