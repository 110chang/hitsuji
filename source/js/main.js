/*
 *
 *   Main 
 *
 */

requirejs.config({
  baseUrl: '/js',
  urlArgs: 'bust=' + (new Date()).getTime(),
  paths: {
    'jquery'           : 'lib/jquery',
    'jquery.easing'    : 'lib/jquery.easing',
    'jquery.touchSwipe': 'lib/jquery.touchSwipe',
    'matter'           : 'lib/matter-0.8.0.min',
    'mod'              : 'mod'
  },
  "shim": {
    "jquery.easing": [
      "jquery"
    ],
    "jquery.touchSwipe": [
      "jquery"
    ]
  }
});

require([
  'jquery',
  'jquery.touchSwipe',
  'mod/nav/anchor',
  'mod/screen',
  'mod/utils/raf',
  'app/cnf',
  'app/fence',
  'app/hitsuji',
  'app/title',
  'matter'
], function($, touchSwipe, Anchor, Screen, raf, cnf, Fence, Hitsuji, Title, M) {
  $(function() {
    console.log('DOM ready.');
    var dpr = window.devicePixelRatio || 1;
    var CW = cnf.CANVAS_WIDTH = Screen().width() * dpr;
    var CH = cnf.CANVAS_HEIGHT = Screen().height() * dpr;
    var M = M || window.Matter;
    var $stage = $('#stage');
    var $canvas;
    var engine;
    var mouseConstraint;
    var broke = false;
    var fence, title;
    var bounds = M.Bounds.create([{ x: 0, y: 0 }, { x: CW, y: CH }]);

    console.log(bounds);

    function init() {
      $stage.css({
        width: CW / dpr,
        height: CH / dpr
      });

      engine = M.Engine.create(
        $stage.get(0),
        M.Common.extend(cnf.prodOptions, {
          render: {
            options: {
              width: CW,
              height: CH,
            }
          }
        }
      ));
      M.Engine.run(engine);

      $canvas = $stage.children('canvas').css({
        width: CW / dpr,
        height: CH / dpr
      });

      reset();
    }
    function reset() {
      M.World.clear(engine.world);
      M.Engine.clear(engine);
      engine.timing.timeScale = 1;
      engine.world.gravity.x = 0;
      engine.world.gravity.y = 1;

      engine.world.bounds.max.x = CW;
      engine.world.bounds.max.y = CH;
      engine.render.options.width = CW;
      engine.render.options.height = CH;
      console.log(engine.timing.timeScale);
      mouseConstraint = M.MouseConstraint.create(engine);
      M.World.add(engine.world, mouseConstraint);
      
      // reset id pool
      M.Common._nextId = 0;

      // reset random seed
      M.Common._seed = 0;

      fence = new Fence();
      fence.create(engine);
      title = new Title();
      title.create(engine);
      //(new Hitsuji()).create(engine);
      M.Events.on(engine, 'afterRender', onAfterRender);

      var t1 = window.setTimeout(function() {
        //console.log('time out 3000(ms)');
        resume();
        window.clearTimeout(t1);
      }, 3000);

      var t2 = window.setTimeout(function() {
        (new Hitsuji()).create(engine);
        //engine.timing.timeScale = 0;
        window.clearTimeout(t2);
      }, 5000);

      pause();
    }
    function pause() {
      engine.timing.timeScale = 0;
    }
    function resume() {
      engine.timing.timeScale = 1;
      M.Composite.allBodies(engine.world).forEach(function(body) {
        M.Body.resetForcesAll(body);
        M.Body.applyForce(body, body.position, { x: 0, y: 0.0001 });
      });
    }
    function onAfterRender(e) {
      var count = M.Composite.allBodies(engine.world).length;
      //console.log(count);
      if (count > 300) {
        engine.world.bounds.max.y = CH * 2;
        engine.render.options.height = CH * 2;
        fence.break();
        broke = true;
      }
      var minY = CH * 2;
      var inBounds = false;
      M.Composite.allBodies(engine.world).forEach(function(body) {
        minY = body.position.y < minY ? body.position.y : minY;
        var b = M.Bounds.contains(bounds, body.position);
        if (b) {
          inBounds = true;
        }
      });
      if (broke && !inBounds) {
        console.log('afterRender end');
        M.Events.off(engine, 'afterRender');
        reset();
      }
    }
    init();

    $stage.swipe({
      tap: function(e) {
        //console.log('tap');
        var mouse = mouseConstraint.mouse;
        (new Hitsuji(mouse.position.x, mouse.position.y)).create(engine);
      }
    });
  });
});

