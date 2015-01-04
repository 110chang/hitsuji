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

    $stage.css({
      width: CW / dpr,
      height: CH / dpr
    });

    var engine = M.Engine.create($stage.get(0), {
      enableSleeping: true,
      render: {
        //controller: Matter.RenderPixi,
        options: {
          wireframes: false,
          width: CW,
          height: CH,
          background: '#39F',
          showSleeping: false
          //showAngleIndicator: true,
          //showVelocity: true,
          //showCollisions: true,
          //showIds: true
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
    engine.world.gravity.y = 1;
    M.Engine.clear(engine);

    var mouseConstraint = M.MouseConstraint.create(engine);
    M.World.add(engine.world, mouseConstraint);

    var fence = new Fence();
    fence.create(engine);
    var title = new Title();
    title.create(engine);
    //(new Hitsuji()).create(engine);
    M.Engine.run(engine);
    engine.timing.timeScale = 0;
    var broke = false;

    M.Events.on(engine, 'afterRender', function(e) {
      var count = M.Composite.allBodies(engine.world).length;
      if (count > 440) {
        engine.world.bounds.max.y = CH * 2;
        engine.render.options.height = CH * 2;
        fence.break();
        broke = true;
      }
      var minY = CH * 2;
      M.Composite.allBodies(engine.world).forEach(function(body) {
        minY = body.position.y < minY ? body.position.y : minY;
      });
      if (minY > CH) {
        //console.log('afterRender end');
        M.Events.off(engine, 'afterRender');
      }
    });

    M.Events.on(engine, 'collisionStart', function(e) {
      //console.log(e.pairs[0]);
      var i = 0;
      for (; i < e.pairs.length; i++) {
        var pair = e.pairs[i];
        if (pair.bodyA.id === 4 || pair.bodyB.id === 4) {
          console.log(pair.bodyA.force.y);
          console.log(pair.bodyB.force.y);
          title.break();
          M.Composite.allBodies(engine.world).forEach(function(body) {
            M.Body.applyForce(body, body.position, { x: 0, y: 0.0001 });
          });
          break;
        }
      }
    });

    M.Events.on(engine, 'collisionEnd', function(e) {
      //console.log(e.pairs[0]);
      var pairs = e.pairs;
      //console.log(pairs.length);
      if (broke && pairs.length < 10) {
        console.log('collosion end');
        M.Engine.clear(engine);
        M.Events.off(engine, 'collisionEnd');
      }
    });

    window.setTimeout(function() {
      //console.log('time out 3000(ms)');
      engine.timing.timeScale = 1;
    }, 3000);

    window.setTimeout(function() {
      (new Hitsuji()).create(engine);
      //engine.timing.timeScale = 0;
    }, 5000);

    $stage.swipe({
      tap: function(e) {
        //console.log('tap');
        var mouse = mouseConstraint.mouse;
        (new Hitsuji(mouse.position.x, mouse.position.y)).create(engine);
      }
    })
  });
});

