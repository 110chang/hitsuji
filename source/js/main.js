/*
 *
 *   Main 
 *
 */

requirejs.config({
  baseUrl: '/js',
  urlArgs: 'bust=' + (new Date()).getTime(),
  paths: {
    'jquery': 'lib/jquery.min',
    'matter': 'lib/matter-0.8.0.min',
    'mod'   : 'mod'
  }
});

require([
  'jquery',
  'mod/screen',
  'mod/timer',
  'app/cnf',
  'app/fence',
  'app/hitsuji',
  'app/title',
  'matter'
], function($, Screen, Timer, cnf, Fence, Hitsuji, Title, M) {
  $(function() {
    //console.log('DOM ready.');
    var M = M || window.Matter;
    var dpr = window.devicePixelRatio || 1;
    var $stage, $canvas, $toggle;
    var engine, mouseConstraint, fence, title, bounds;
    var timer0, timer1;
    var maxBodyNum = 0;
    var broke = false;
    var wireframe = false;
    var CW, CH;

    function init() {
      CW = cnf.CANVAS_WIDTH = Screen().width() * dpr;
      CH = cnf.CANVAS_HEIGHT = Screen().height() * dpr;

      $stage = $('#stage').css({
        width: CW / dpr,
        height: CH / dpr
      }).empty();

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

      $toggle = $('#toggle-wireframe');
      $toggle.on('click', function(e) {
        toggleWireframe();
      });

      bounds = M.Bounds.create([{ x: 0, y: 0 }, { x: CW, y: CH }]);
      maxBodyNum = ~~(Math.pow(CW * CH, 1 / 3) * 2 / dpr);
      //console.log(maxBodyNum);
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
      //console.log(engine.timing.timeScale);
      mouseConstraint = M.MouseConstraint.create(engine);
      M.World.add(engine.world, mouseConstraint);

      fence = new Fence();
      fence.create(engine);

      title = new Title('A HAPPY\nNEW YEAR\n2015');
      title.create(engine);

      timer0 = new Timer(3000);
      timer1 = new Timer(3000, -1);

      timer0.subscribe(Timer.TIMER, function(e) {
        //console.log('time begins to move');
        resume();
        timer1.start();
      });
      timer1.subscribe(Timer.TIMER, function(e) {
        //console.log('create hitsuji');
        //console.log(M.Composite.allBodies(engine.world).length);
        (new Hitsuji()).create(engine);
      });
      timer0.start();

      broke = false;

      M.Events.on(engine, 'afterRender', onAfterRender);

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
      var inBounds = false;
      //console.log(count);
      if (count > maxBodyNum) {
        engine.world.bounds.max.y = CH * 2;
        engine.render.options.height = CH * 2;
        fence.break();
        broke = true;
        timer1.stop();
      }
      M.Composite.allBodies(engine.world).forEach(function(body) {
        M.Body.applyForce(body, body.position, { x: 0, y: 0.0001 });
        if (M.Bounds.contains(bounds, body.position)) {
          inBounds = true;
        }
      });
      if (broke && !inBounds) {
        //console.log('afterRender end');
        M.Events.off(engine, 'afterRender');
        reset();
      }
    }
    function toggleWireframe() {
      wireframe = !wireframe;
      if (wireframe) {
        engine.render.options.wireframes = true;
        engine.render.options.showSleeping = true;
        engine.render.options.showAngleIndicator = true;
        engine.render.options.showVelocity = true;
        engine.render.options.showCollisions = true;
      } else {
        engine.render.options.wireframes = false;
        engine.render.options.showSleeping = false;
        engine.render.options.showAngleIndicator = false;
        engine.render.options.showVelocity = false;
        engine.render.options.showCollisions = false;
      }
      $toggle.toggleClass('on');
    }
    init();
  });
});

