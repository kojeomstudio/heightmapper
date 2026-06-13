/*jslint browser: true*/
/*global Tangram, gui */

map = (function () {
  'use strict';

  var map_start_location = [0, 0, 2];
  var global_min = 0;
  var global_max = 8900;
  var uminValue, umaxValue;
  var scene_loaded = false;
  var moving = false;
  var analysing = false;
  var done = false;
  var tempCanvas;
  var spread = 1;
  var lastumax = null;
  var diff = null;
  var stopped = false;
  var widening = false;
  var tempFactor = 8;

  const mb_factor = 1.0 / (1024 * 1024);
  var zoomRender = 2;
  const min_zoomRender = 1;
  const max_zoomRender = 8;

  var renderName = {name: 'render'};

  var isElectron = !!(window.electronAPI && window.electronAPI.isElectron);
  var headlessConfig = null;

  function getQueryParams() {
    var str = window.location.search;
    if (!str) return {};
    var kvArray = str.slice(1).split('&');
    var obj = {};
    for (var i = 0; i < kvArray.length; i++) {
      var pair = kvArray[i].split('=');
      if (pair.length === 2) {
        obj[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
      }
    }
    return obj;
  }

  var query = getQueryParams();

  if (query.lat && query.lng && query.zoom) {
    map_start_location = [parseFloat(query.lat), parseFloat(query.lng), parseFloat(query.zoom)];
  }

  var url_hash = window.location.hash.slice(1, window.location.hash.length).split('/');
  if (url_hash.length == 3) {
    map_start_location = [url_hash[1], url_hash[2], url_hash[0]].map(Number);
  }

  if (query.min) global_min = parseFloat(query.min);
  if (query.max) global_max = parseFloat(query.max);

  var isHeadless = query.headless === '1';
  var isJson = query.json === '1';
  var isExport = query.export === '1';
  var exportOutput = query.output || null;

  var map = L.map('map',
  {"keyboardZoomOffset" : .05,
  "inertiaDeceleration" : 10000,
  "zoomSnap" : .001}
  );

  var layer = Tangram.leafletLayer({
    scene: 'scene.yaml',
    attribution: 'Map by <a href="https://mapzen.com/tangram" target="_blank">Tangram</a> | <a href="https://github.com/tangrams/heightmapper" target="_blank">Fork This</a>',
    postUpdate: function() {
      if (gui && gui.autoexpose && !stopped) {
        if (!analysing && !done) {
          expose();
        }
        else if (analysing && !done) {
          start_analysis();
        }
        else if (done) {
          done = false;
        }
      }
    }
  });

  function debounce(func, wait, immediate) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
      var callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func.apply(context, args);
    };
  }

  function expose() {
    analysing = true;
    if (typeof gui != 'undefined' && gui.autoexpose == false) return false;
    if (scene_loaded) {
      start_analysis();
    } else {
      scene.initializing.then(function() {
        start_analysis();
      });
    }
  }

  function updateGUI() {
    if (!gui) return;
    for (var i in gui.__controllers) {
      gui.__controllers[i].updateDisplay();
    }
  }

  function start_analysis() {
    var levels = analyse();
    if (!levels) return;
    diff = levels.max - lastumax;
    if (typeof levels.max !== 'undefined') lastumax = levels.max;
    else diff = 1;
    widening = diff < 0 ? false : true;
    scene.styles.hillshade.shaders.uniforms.u_min = levels.min;
    scene.styles.hillshade.shaders.uniforms.u_max = levels.max;
    scene.requestRedraw();
  }

  function analyse() {
    var ctx = tempCanvas.getContext("2d");
    ctx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    ctx.drawImage(scene.canvas,0,0,scene.canvas.width/tempFactor,scene.canvas.height/tempFactor);
    var pixels = ctx.getImageData(0,0, tempCanvas.width, tempCanvas.height);

    var val;
    var counts = {};
    var empty = true;
    var max = 0, min = 255;
    for (var i = 0; i < tempCanvas.height * tempCanvas.width * 4; i += 4) {
      val = pixels.data[i];
      var alpha = pixels.data[i+3];
      if (alpha === 0) { continue; }
      empty = false;
      counts[val] = counts[val] ? counts[val]+1 : 1;
      min = Math.min(min, val);
      max = Math.max(max, val);
    }

    if (empty) { return false; }
      if (max > 253 && min < 4 && !widening ) {
      analysing = false;
      done = true;
      spread = 2;

      if (isHeadless && scene_loaded && !window.__headlessExported) {
        window.__headlessExported = true;
        triggerHeadlessExport();
      }
      return false;
    }
    if (max > 252 && min < 4 && widening) {
      spread *= 2;
      spread = Math.min(spread, 512);
      max += spread;
      min -= spread;
    }

    var range = (gui.u_max - gui.u_min);
    var minadj = (min / 255) * range + gui.u_min;
    var maxadj = (max / 255) * range + gui.u_min;

    minadj = Math.max(minadj, -11000);
    maxadj = Math.min(maxadj, 8900);
    minadj = gui.include_oceans ? minadj : Math.max(minadj, 0);
    if (minadj === maxadj) maxadj += 10;

    var zrange = (gui.u_max - gui.u_min);
    var xscale = zrange / scene.view.size.meters.x;
    gui.scaleFactor = xscale +'';

    scene.styles.hillshade.shaders.uniforms.u_min = minadj;
    scene.styles.hillshade.shaders.uniforms.u_max = maxadj;

    gui.u_min = minadj;
    gui.u_max = maxadj;
    updateGUI();

    return {max: maxadj, min: minadj}
  }

  async function triggerHeadlessExport() {
    try {
      var screenshot = await scene.screenshot();
      var imageData;
      if (screenshot && screenshot.url) {
        imageData = screenshot.url.split(',')[1];
      }

      var center = map.getCenter();
      var bounds = map.getBounds();

      var metadata = {
        bounds: {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        },
        lat: center.lat,
        lng: center.lng,
        zoom: map.getZoom(),
        minElev: gui ? gui.u_min : 0,
        maxElev: gui ? gui.u_max : 8848,
        scaleFactor: gui ? gui.scaleFactor : '1',
        width: scene.canvas.width,
        height: scene.canvas.height,
        imageData: isExport ? imageData : null,
      };

      if (window.electronAPI) {
        window.electronAPI.renderComplete(metadata);
      }
    } catch (e) {
      if (window.electronAPI) {
        window.electronAPI.renderError(e.message || String(e));
      }
    }
  }

  window.layer = layer;
  var scene = layer.scene;
  window.scene = scene;

  map.setView(map_start_location.slice(0, 2), map_start_location[2]);

  let hash = new L.Hash(map);

  var gui;
  function addGUI () {
    if (isHeadless) {
      window.gui = { autoexpose: true, u_max: global_max, u_min: global_min, scaleFactor: '1', include_oceans: false };
      gui = window.gui;
      return;
    }

    gui.domElement.parentNode.style.zIndex = 5;
    window.gui = gui;
    gui.u_max = global_max || 8848.;
    gui.add(gui, 'u_max', -10916., 8848).name("max elevation").onChange(function(value) {
      scene.styles.hillshade.shaders.uniforms.u_max = value;
      scene.requestRedraw();
    });
    gui.u_min = global_min || 0.;
    gui.add(gui, 'u_min', -10916., 8848).name("min elevation").onChange(function(value) {
      scene.styles.hillshade.shaders.uniforms.u_min = value;
      scene.requestRedraw();
    });

    gui.scaleFactor = 1 +'';
    gui.add(gui, 'scaleFactor').name("z:x scale factor");

    gui.autoexpose = true;
    gui.add(gui, 'autoexpose').name("auto-exposure").onChange(function(value) {
      sliderState(!value);
      if (value) {
        uminValue = gui.u_min;
        umaxValue = gui.u_max;
        lastumax = 0;
        expose();
      } else if (typeof uminValue != 'undefined') {
        scene.styles.hillshade.shaders.uniforms.u_min = uminValue;
        scene.styles.hillshade.shaders.uniforms.u_max = umaxValue;
        scene.requestRedraw();
        gui.u_min = uminValue;
        gui.u_max = umaxValue;
        updateGUI();
      }
    });

    gui.include_oceans = false;
    gui.add(gui, 'include_oceans').name("include ocean data").onChange(function(value) {
      if (value) global_min = -11000;
      else global_min = 0;
      gui.u_min = global_min;
      scene.styles.hillshade.shaders.uniforms.u_min = global_min;
      expose();
    });

    gui.map_lines = false;
    gui.add(gui, 'map_lines').name("map lines (unavailable)");

    gui.map_labels = false;
    gui.add(gui, 'map_labels').name("map labels (unavailable)");

    gui.export = function () {
      return doExport();
    }
    gui.add(gui, 'export');

    gui.zoomRender = zoomRender;
    gui.add(gui, 'zoomRender', min_zoomRender, max_zoomRender, 1).name("Render Multiplier").onChange(function(value) {
      zoomRender = Math.round(value);
    });

    gui.renderName = renderName.name;
    let rendernameInput = gui.add(gui, 'renderName').name('Render Name').onChange(function(value) {
      renderName.name = value;
    });
    rendernameInput.domElement.id = 'renderName';

    gui.render = function () {
      renderView();
    }
    gui.add(gui, 'render');

    gui.help = function () {
      toggleHelp(true);
    }
    gui.add(gui, 'help');
    gui.__controllers[2].domElement.firstChild.setAttribute("readonly", true);
  }

  async function doExport() {
    try {
      var screenshot = await scene.screenshot();
      if (isElectron && window.electronAPI) {
        var reader = new FileReader();
        reader.onload = function() {
          var base64 = reader.result.split(',')[1];
          var filename = 'heightmapper-' + (+new Date()) + '.png';
          window.electronAPI.saveFile(base64, filename).then(function(savedPath) {
            console.log('Saved to:', savedPath);
          });
        };
        reader.readAsDataURL(screenshot.blob);
      } else {
        saveAs(screenshot.blob, 'heightmapper-' + (+new Date()) + '.png');
      }
    } catch(e) {
      console.error('Export failed:', e);
    }
  }

  function stop() {
    console.log('stopping');
    stopped = true;
  }
  function go() {
    stopped = false;
  }

  async function renderView() {
    let zoomFactor = zoomRender * window.devicePixelRatio;
    const originalX = scene.canvas.width;
    const originalY = scene.canvas.height;
    const outputX = originalX * zoomRender;
    const outputY = originalY * zoomRender;
    const size_mb = Math.ceil(scene.canvas.width * scene.canvas.height * zoomFactor * mb_factor);
    const status = confirm(`Potential image size with ${zoomRender}x zoom render: ${size_mb} MB\nEstimated dimensions: ${outputX}X${outputY} pixels.\nContinue?`);

    if(!status) { return; }

    map.invalidateSize(true);
    logRenderStep("Preparing render");

    const originalBounds = map.getBounds();
    const preRenderAutoExposureState = gui.autoexpose;
    gui.autoexpose = false;
    const widthPerCell = scene.canvas.width / zoomFactor;
    const heightPerCell = scene.canvas.height / zoomFactor;
    const captures = [];
    const captureOrigins = [];
    const cells = [];
    for(let i = 0; i < zoomRender; i++) {
      for(let j = 0; j < zoomRender; j++) {
        const nwPoint = L.point(i * widthPerCell, j * heightPerCell, false);
        const sePoint = L.point(nwPoint.x + widthPerCell, nwPoint.y + heightPerCell, false);
        const topLeftCoords = map.containerPointToLatLng(nwPoint);
        const bottomRightCoords = map.containerPointToLatLng(sePoint);
        const bounds = L.latLngBounds(topLeftCoords, bottomRightCoords);
        captureOrigins.push(nwPoint);
        cells.push(bounds);
      }
    }

    logRenderStep("Rendering cells");
    let count = 0;
    for(const bounds of cells) {
      await async function() {
        return new Promise(resolve => {
          map.once('moveend zoomend', resolve);
          map.fitBounds(bounds);
        });
      }();
      await awaitViewComplete().then(async () => {
        const renderedCell = await scene.screenshot();
        captures[count] = renderedCell.url;
        console.log(`Cell ${count} rendered`);
        count++;
      });
    }

    map.fitBounds(originalBounds);
    logRenderStep("Building final image");

    const renderCanvas = document.createElement('canvas');
    renderCanvas.id = "renderCanvas";
    renderCanvas.width = outputX;
    renderCanvas.height = outputY;
    const renderContext = renderCanvas.getContext("2d");

    for(let i = 0; i < captures.length; i++) {
      const xPixel = captureOrigins[i].x * zoomFactor;
      const yPixel = captureOrigins[i].y * zoomFactor;
      await addImageToCanvas(renderContext, captures[i], xPixel, yPixel);
    }

    logRenderStep("Saving render");
    const blob = await getCanvasBlob(renderCanvas);

    if (isElectron && window.electronAPI) {
      var reader = new FileReader();
      reader.onload = function() {
        var base64 = reader.result.split(',')[1];
        window.electronAPI.saveFile(base64, `${renderName.name || 'render'}.png`);
      };
      reader.readAsDataURL(blob);
    } else {
      saveAs(blob, `${renderName.name || 'render'}.png`);
    }

    logRenderStep("Cleaning up");
    gui.autoexpose = preRenderAutoExposureState;
    alert("Render complete!");
  }

  function awaitViewComplete() {
    return new Promise(function(resolve) {
      scene.subscribe({ view_complete: function() { resolve(); } });
    });
  }

  function addImageToCanvas(ctx, src, x, y) {
    return new Promise(function(resolve) {
      const img = new Image();
      img.src = src;
      img.onload = function() { ctx.drawImage(img, x, y); resolve(); };
    });
  }

  function getCanvasBlob(canvasElement) {
    return new Promise(function(resolve) {
      canvasElement.toBlob(function(blob) { resolve(blob); });
    });
  }

  function logRenderStep(title) {
    console.log("=========================");
    console.log(title);
    console.log("=========================");
  }

  window.stop = stop;
  window.go = go;

  function sliderState(active) {
    if (!gui || !gui.__controllers) return;
    var pointerEvents = active ? "auto" : "none";
    var opacity = active ? 1. : .5;
    gui.__controllers[0].domElement.parentElement.style.pointerEvents = pointerEvents;
    gui.__controllers[0].domElement.parentElement.style.opacity = opacity;
    gui.__controllers[1].domElement.parentElement.style.pointerEvents = pointerEvents;
    gui.__controllers[1].domElement.parentElement.style.opacity = opacity;
  }

  function toggleHelp(active) {
    var visibility = active ? "visible" : "hidden";
    document.getElementById('help').style.visibility = visibility;
    document.getElementById('help-blocker').style.visibility = visibility;
  }

  function toggleNew(active) {
    var visibility = active ? "visible" : "hidden";
    document.getElementById('new').style.visibility = visibility;
    document.getElementById('help-blocker').style.visibility = visibility;
  }

  function toggleLines(active) {
    scene.styles.togglelines.shaders.uniforms.u_alpha = active ? 1. : 0.;
    scene.requestRedraw();
  }
  function toggleLabels(active) {
    scene.styles.toggletext.shaders.uniforms.u_alpha = active ? 1. : 0.;
    scene.requestRedraw();
  }

  document.onkeydown = function (e) {
    e = e || window.event;
    if (e.which == 72 && document.activeElement != document.querySelector('#renderName>input')) {
      var display = map._controlContainer.style.display;
      map._controlContainer.style.display = (display === "none") ? "block" : "none";
      document.getElementsByClassName('dg')[0].style.display = (display === "none") ? "block" : "none";
    } else if (e.which == 27) {
      toggleHelp(false);
    }
  };

  window.addEventListener('load', function () {
    layer.on('init', function() {
      if (!isHeadless) {
        gui = new dat.GUI({ autoPlace: true, hideable: true, width: 300 });
      }
      addGUI();
      scene.subscribe({ view_complete: function() {} });
      scene_loaded = true;

      if (!isHeadless) {
        sliderState(false);
      }
      tempCanvas = document.createElement("canvas");
      tempCanvas.width = scene.canvas.width/tempFactor;
      tempCanvas.height = scene.canvas.height/tempFactor;
    });
    layer.addTo(map);

    document.getElementById('help').onclick = function(){toggleHelp(false)};
    document.getElementById('new').onclick = function(){toggleNew(false)};
    document.getElementById('help-blocker').onclick = function(){toggleHelp(false);toggleNew(false)};

    var moveend = debounce(function(e) {
      moving = false;
      scene.resetViewComplete();
      scene.requestRedraw();
    }, 250);

    map.on("movestart", function () { moving = true; });
    map.on("moveend", function (e) { moveend(e) });
  });

  return map;

}());
