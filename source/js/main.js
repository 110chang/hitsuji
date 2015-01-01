/*
 *
 *   Main 
 *
 */

requirejs.config({
  baseUrl: '/js',
  urlArgs: 'bust=' + (new Date()).getTime(),
  paths: {
    'jquery'       : 'lib/jquery',
    'jquery.easing': 'lib/jquery.easing',
    'matter'       : 'lib/matter-0.8.0.min',
    'mod'          : 'mod'
  },
  "shim": {
    "jquery.easing": [
      "jquery"
    ]
  }
});

require([
  'mod/nav/anchor',
  'mod/screen',
  'mod/utils/raf',
  'app/cnf',
  'app/fence',
  'app/hitsuji',
  'matter'
], function(Anchor, Screen, raf, cnf, Fence, Hitsuji, M) {
  $(function() {
    console.log('DOM ready.');
    var dpr = window.devicePixelRatio || 1;
    var M = M || window.Matter;
    var $stage = $('#stage');
    $stage.css({
      width: $stage.width() / dpr,
      height: $stage.height() / dpr
    });
    var engine = M.Engine.create($stage.get(0), {
      render: {
        options: {
          wireframes: false,
          width: 600,
          height: 400,
          background: '#39F',
          showAngleIndicator: true,
          showVelocity: true
        }
      }
    });
    var $canvas = $stage.children('canvas');
    $canvas.css({
      width: $canvas.width() / dpr,
      height: $canvas.height() / dpr
    });
    var mouseConstraint = M.MouseConstraint.create(engine);
    M.World.add(engine.world, mouseConstraint);

    (new Fence()).create(engine);
    (new Hitsuji()).create(engine);
    M.Engine.run(engine);

    M.Events.on(engine, 'mousemove', function(e) {
      var mouse = mouseConstraint.mouse;
      var bodies = M.Composite.allBodies(engine.world);
      var startPoint = M.Vector.add(mouse.position, { x: -.1, y: -.1 });
      var endPoint = M.Vector.add(mouse.position, { x: .1, y: .1 });
      var collisions = M.Query.ray(bodies, startPoint, endPoint);
      console.log(collisions.length);
    });

    var abs = Math.abs;
    var prevX, prevY, offsetX, offsetY;
    $stage.on('mousedown', function(e) {
      //console.log('mouse down');
      prevX = e.offsetX;
      prevY = e.offsetY;
    });
    $stage.on('mouseup', function(e) {
      //console.log('mouse up');
      offsetX = e.offsetX;
      offsetY = e.offsetY;
      if (abs(offsetX - prevX) < 1 && abs(offsetY - prevY) < 1) {
        (new Hitsuji()).create(engine);
      }
      offsetX = undefined;
      offsetY = undefined;
    });
  });
});

