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
  'matter'
], function($, touchSwipe, Anchor, Screen, raf, cnf, Fence, Hitsuji, M) {
  $(function() {
    console.log('DOM ready.');
    var dpr = window.devicePixelRatio || 1;
    var CW = cnf.CANVAS_WIDTH = Screen().width() * dpr;
    var CH = cnf.CANVAS_HEIGHT = Screen().height() * dpr;
    var M = M || window.Matter;
    var $stage = $('#stage');

    $stage.css({
      width: CW / dpr,
      height: CH / dpr
    });

    var engine = M.Engine.create($stage.get(0), {
      enableSleeping: true,
      render: {
        options: {
          wireframes: true,
          width: CW,
          height: CH,
          background: '#39F',
          //showAngleIndicator: true,
          //showVelocity: true,
          //showCollisions: true
        }
      }
    });

    var $canvas = $stage.children('canvas');
    $canvas.css({
      width: CW / dpr,
      height: CH / dpr
    });
    engine.world.bounds.max.x = CW;
    engine.world.bounds.max.y = CH;
    engine.render.options.width = CW;
    engine.render.options.height = CH;

    M.Engine.clear(engine);

    var mouseConstraint = M.MouseConstraint.create(engine);
    M.World.add(engine.world, mouseConstraint);

    (new Fence()).create(engine);
    (new Hitsuji()).create(engine);
    M.Engine.run(engine);

    M.Events.on(engine, 'afterRender', function(e) {
      var hitsujis = M.Composite.allComposites(engine.world);
      hitsujis.forEach(function(hitsuji, i) {
        var b0 = hitsuji.bodies[0];
        var b1 = hitsuji.bodies[1];
        var v0 = b0.position;
        var v1 = b1.position;
        hitsuji.bodies.forEach(function(body, i) {
          M.Body.rotate(body, M.Vector.angle(v0, v1) - body.angle);
        });
      });
    });

    $stage.swipe({
      tap: function(e) {
        //console.log('tap');
        var mouse = mouseConstraint.mouse;
        (new Hitsuji(mouse.position.x, mouse.position.y)).create(engine);
      }
    })
  });
});

